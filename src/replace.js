// Replace Module - แทน {{field}} ใน XML ด้วยค่าจาก values
(function (scope) {
    'use strict';

    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    // กันลูปไม่รู้จบ กรณีค่าที่แทนเข้าไปมีรูปแบบ {{field}} เหมือนเดิม
    const MAX_ITERATIONS_PER_PARAGRAPH = 1000;

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildFieldRegex(fields) {
        if (fields.length === 0) return null;
        const pattern = fields.map(escapeRegex).join('|');
        return new RegExp('\\{\\{\\s*(' + pattern + ')\\s*\\}\\}', 'g');
    }

    // หา text node ที่ offset ตกอยู่ พร้อมตำแหน่งภายใน node นั้น
    function locateOffset(parts, offset) {
        let position = 0;

        for (let i = 0; i < parts.length; i++) {
            const end = position + parts[i].length;

            // ใช้ < เพื่อให้ offset ที่อยู่ตรงรอยต่อไปอยู่ที่ node ถัดไป
            if (offset < end || i === parts.length - 1) {
                return { index: i, offset: Math.max(0, offset - position) };
            }

            position = end;
        }

        return null;
    }

    // แทนค่า match หนึ่งรายการ โดยรักษา text node อื่นใน paragraph ไว้
    function replaceMatch(textNodes, parts, match, replacement) {
        const start = locateOffset(parts, match.index);
        const end = locateOffset(parts, match.index + match[0].length);

        if (!start || !end || end.index < start.index) {
            return false;
        }

        const before = parts[start.index].slice(0, start.offset);
        const after = parts[end.index].slice(end.offset);

        if (start.index === end.index) {
            textNodes[start.index].textContent = before + replacement + after;
            return true;
        }

        textNodes[start.index].textContent = before + replacement;

        for (let i = start.index + 1; i < end.index; i++) {
            textNodes[i].textContent = '';
        }

        textNodes[end.index].textContent = after;
        return true;
    }

    function replaceInParagraph(paragraph, regex, values) {
        const textNodes = Array.from(paragraph.getElementsByTagNameNS(W_NS, 't'));
        if (textNodes.length === 0) return;

        let iterations = 0;
        while (iterations++ < MAX_ITERATIONS_PER_PARAGRAPH) {
            const parts = textNodes.map(node => node.textContent || '');
            const fullText = parts.join('');

            if (fullText.indexOf('{{') === -1 || fullText.indexOf('}}') === -1) {
                return;
            }

            regex.lastIndex = 0;
            const match = regex.exec(fullText);
            if (!match) return;

            const replacement = String(values[match[1]] ?? '');
            if (!replaceMatch(textNodes, parts, match, replacement)) return;
        }

        console.warn('หยุดแทนค่าใน paragraph หนึ่งเพราะถึงขีดจำกัดรอบ');
    }

    function replaceFields(xml, values) {
        if (!xml || !values) return xml;

        const regex = buildFieldRegex(Object.keys(values));
        if (!regex) return xml;

        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length > 0) {
            console.error('XML Parse Error: ไม่สามารถแทนค่าได้');
            return xml;
        }

        const paragraphs = doc.getElementsByTagNameNS(W_NS, 'p');
        for (const paragraph of paragraphs) {
            replaceInParagraph(paragraph, regex, values);
        }

        return new XMLSerializer().serializeToString(doc);
    }

    scope.Replace = {
        replaceFields: replaceFields
    };
})(window);
