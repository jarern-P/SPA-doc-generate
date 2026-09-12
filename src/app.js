(function () {
    'use strict';

    // ──────────────────────────────────────────────────────────────
    // Functions (จากไฟล์ extract.js)
    // ──────────────────────────────────────────────────────────────
    function extractFields(xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const textNodes = Array.from(doc.getElementsByTagName('w:t'));

        let fullText = '';
        for (const node of textNodes) {
            fullText += node.textContent || '';
        }

        const regex = /\{\{\s*([a-zA-Z0-9_ก-๙]+)\s*\}\}/g;
        const result = new Set();
        let match;
        while ((match = regex.exec(fullText)) !== null) {
            result.add(match[1]);
        }
        return Array.from(result);
    }

    // ──────────────────────────────────────────────────────────────
    // Functions (จากไฟล์ replace.js)
    // ──────────────────────────────────────────────────────────────
    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function replaceFields(xml, values) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');

        const parserError = doc.getElementsByTagName('parsererror');
        if (parserError.length > 0) {
            console.error('XML Parse Error:', parserError[0].textContent);
            return xml;
        }

        const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        const paragraphs = doc.getElementsByTagNameNS(W_NS, 'p');

        const fieldPattern = Object.keys(values)
            .map(field => escapeRegex(field))
            .join('|');

        if (!fieldPattern) {
            return xml;
        }

        const regex = new RegExp(
            '\\{\\{\\s*(' + fieldPattern + ')\\s*\\}\\}',
            'g'
        );

        for (const paragraph of paragraphs) {
            const textNodes = Array.from(
                paragraph.getElementsByTagNameNS(W_NS, 't')
            );

            if (textNodes.length === 0) {
                continue;
            }

            let hasReplacement = true;
            while (hasReplacement) {
                hasReplacement = false;

                const parts = textNodes.map(node => node.textContent || '');
                const fullText = parts.join('');

                if (!fullText.includes('{{') || !fullText.includes('}}')) {
                    break;
                }

                regex.lastIndex = 0;
                const match = regex.exec(fullText);
                if (!match) break;

                const fieldName = match[1];
                const replacement = String(values[fieldName] ?? '');
                const matchStart = match.index;
                const matchEnd = match.index + match[0].length;

                let currentPosition = 0;
                let startNodeIndex = -1;
                let endNodeIndex = -1;
                let startOffset = 0;
                let endOffset = 0;

                for (let i = 0; i < parts.length; i++) {
                    const nodeStart = currentPosition;
                    const nodeEnd = currentPosition + parts[i].length;

                    if (
                        startNodeIndex === -1 &&
                        matchStart >= nodeStart &&
                        matchStart <= nodeEnd
                    ) {
                        startNodeIndex = i;
                        startOffset = matchStart - nodeStart;
                    }

                    if (matchEnd >= nodeStart && matchEnd <= nodeEnd) {
                        endNodeIndex = i;
                        endOffset = matchEnd - nodeStart;
                        break;
                    }

                    currentPosition = nodeEnd;
                }

                if (startNodeIndex === -1 || endNodeIndex === -1) {
                    break;
                }

                const before = parts[startNodeIndex].substring(0, startOffset);
                const after = parts[endNodeIndex].substring(endOffset);

                if (startNodeIndex === endNodeIndex) {
                    textNodes[startNodeIndex].textContent =
                        before + replacement + after;
                } else {
                    textNodes[startNodeIndex].textContent =
                        before + replacement;

                    for (let i = startNodeIndex + 1; i < endNodeIndex; i++) {
                        textNodes[i].textContent = '';
                    }

                    textNodes[endNodeIndex].textContent = after;
                }

                hasReplacement = true;
            }
        }

        const serializer = new XMLSerializer();
        return serializer.serializeToString(doc);
    }

    // ──────────────────────────────────────────────────────────────
    // Page HTML (จากไฟล์ reportPage.js และ templateConfigPage.js)
    // ──────────────────────────────────────────────────────────────
    function getReportPageHTML() {
        return `
            <h1>Word Template Filler</h1>

            <div class="box">
                <input
                    type="file"
                    id="fileInput"
                    accept=".docx"
                >
            </div>

            <div id="form"></div>

            <button id="downloadBtn" style="display:none">
                Download DOCX
            </button>
            <button id="clearBtn" style="display:none">
                Clear
            </button>
        `;
    }

    function getTemplateConfigPageHTML() {
        return `
            <h1>Template Configuration</h1>

            <div class="box">
                <input
                    type="file"
                    id="fileInput"
                    accept=".docx"
                >
            </div>

            <div id="form"></div>

            <button id="downloadBtn" style="display:none">
                Download DOCX
            </button>
            <button id="clearBtn" style="display:none">
                Clear
            </button>
        `;
    }

    // ──────────────────────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────────────────────
    let originalZip = null;
    let fields = [];
    let originalXml = null;
    let currentPage = 'report';
    const pageCache = {};

    const mainContentEl = document.getElementById('mainContent');
    const masterSubmenuEl = document.getElementById('masterSubmenu');
    const masterMenuItem = document.querySelector('[data-page="master"]');

    // ──────────────────────────────────────────────────────────────
    // Init
    // ──────────────────────────────────────────────────────────────
    function init() {
        // Cache หน้ารายงานเริ่มต้น
        pageCache['report'] = getReportPageHTML();
        mainContentEl.innerHTML = pageCache['report'];
        bindEvents();
        initSidebar();
    }

    // ──────────────────────────────────────────────────────────────
    // Event Binding
    // ──────────────────────────────────────────────────────────────
    function bindEvents() {
        const fileInput = document.getElementById('fileInput');
        const downloadBtn = document.getElementById('downloadBtn');
        const clearBtn = document.getElementById('clearBtn');

        if (fileInput) {
            fileInput.addEventListener('change', onFileChange);
        }
        if (downloadBtn) {
            downloadBtn.addEventListener('click', onDownload);
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', resetAll);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Page Navigation
    // ──────────────────────────────────────────────────────────────
    function showPage(page) {
        // จัดการ submenu ของ master
        if (page === 'master') {
            masterSubmenuEl.classList.toggle('open');
            const isOpen = masterSubmenuEl.classList.contains('open');
            masterMenuItem.classList.toggle('active', isOpen);
            return;
        }

        // ปิด submenu ของ master
        if (masterSubmenuEl) {
            masterSubmenuEl.classList.remove('open');
        }
        if (masterMenuItem) {
            masterMenuItem.classList.remove('active');
        }

        currentPage = page;

        // อัปเดต active state ใน sidebar (เมนูหลักอื่นๆ)
        document.querySelectorAll('[data-page]').forEach(item => {
            // ข้าม submenu item
            if (item.parentElement === masterSubmenuEl) return;
            item.classList.toggle('active', item.dataset.page === page);
        });

        // ตัดสินใจว่าจะใช้ cached HTML หรือสร้างใหม่
        if (page === 'template-config') {
            // สร้าง HTML จาก component
            const html = getTemplateConfigPageHTML();
            mainContentEl.innerHTML = html;
            pageCache['template-config'] = html;
        } else if (page === 'report') {
            // ใช้ cached HTML
            mainContentEl.innerHTML = pageCache['report'] || getReportPageHTML();
        }

        // Re-bind events สำหรับ elements ใหม่
        bindEvents();
    }

    // ──────────────────────────────────────────────────────────────
    // Sidebar Init
    // ──────────────────────────────────────────────────────────────
    function initSidebar() {
        // bind click ที่เมนูหลักและ submenu item ทั้งหมด
        document.querySelectorAll('.sidebar .menu-item').forEach(item => {
            item.addEventListener('click', () => {
                showPage(item.dataset.page);
            });
        });
    }

    // ──────────────────────────────────────────────────────────────
    // Event Handlers
    // ──────────────────────────────────────────────────────────────
    async function onFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            originalZip = await JSZip.loadAsync(file);
            const xml = await originalZip.file('word/document.xml').async('string');
            originalXml = xml;
            fields = extractFields(xml);
            renderForm(fields);

            const downloadBtn = document.getElementById('downloadBtn');
            const clearBtn = document.getElementById('clearBtn');

            if (downloadBtn) downloadBtn.style.display = fields.length > 0 ? 'block' : 'none';
            if (clearBtn) clearBtn.style.display = originalZip ? 'block' : 'none';

            console.log('Fields:', fields);
        } catch (error) {
            console.error(error);
            alert('ไม่สามารถอ่านไฟล์ DOCX ได้');
        }
    }

    async function onDownload() {
        if (!originalZip) return;

        const zip = originalZip;
        let xml = originalXml;

        const values = {};
        document.querySelectorAll('input').forEach(input => {
            values[input.dataset.field] = input.value;
        });

        xml = replaceFields(xml, values);
        zip.file('word/document.xml', xml);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated-document.docx';
        a.click();
        URL.revokeObjectURL(url);
    }

    function resetAll() {
        const fileInput = document.getElementById('fileInput');
        const form = document.getElementById('form');

        if (fileInput) fileInput.value = '';
        if (form) form.innerHTML = '';

        originalZip = null;
        originalXml = null;
        fields = [];

        const downloadBtn = document.getElementById('downloadBtn');
        const clearBtn = document.getElementById('clearBtn');

        if (downloadBtn) downloadBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
    }

    // ──────────────────────────────────────────────────────────────
    // Form Rendering
    // ──────────────────────────────────────────────────────────────
    function renderForm(fields) {
        const form = document.getElementById('form');
        form.innerHTML = '';

        if (fields.length === 0) {
            form.innerHTML = '<p>ไม่พบ {{field}} ใน Template</p>';
            return;
        }

        const title = document.createElement('h2');
        title.textContent = 'กรอกข้อมูล';
        form.appendChild(title);

        for (const field of fields) {
            const wrapper = document.createElement('div');
            wrapper.className = 'field';

            const label = document.createElement('label');
            label.textContent = field;

            const input = document.createElement('input');
            input.type = 'text';
            input.dataset.field = field;
            input.placeholder = `กรอก ${field}`;

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            form.appendChild(wrapper);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Boot
    // ──────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
})();
