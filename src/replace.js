function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceFields(xml, values) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const parserError = doc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
        console.error("XML Parse Error:", parserError[0].textContent);
        return xml;
    }

    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const paragraphs = doc.getElementsByTagNameNS(W_NS, "p");

    const fieldPattern = Object.keys(values)
        .map(field => escapeRegex(field))
        .join("|");

    if (!fieldPattern) {
        return xml;
    }

    const regex = new RegExp(
        "\\{\\{\\s*(" + fieldPattern + ")\\s*\\}\\}",
        "g"
    );

    for (const paragraph of paragraphs) {
        const textNodes = Array.from(
            paragraph.getElementsByTagNameNS(W_NS, "t")
        );

        if (textNodes.length === 0) {
            continue;
        }

        let hasReplacement = true;
        while (hasReplacement) {
            hasReplacement = false;

            const parts = textNodes.map(node => node.textContent || "");
            const fullText = parts.join("");

            if (!fullText.includes("{{") || !fullText.includes("}}")) {
                break;
            }

            regex.lastIndex = 0;
            const match = regex.exec(fullText);

            if (!match) {
                break;
            }

            const fieldName = match[1];
            const replacement = String(values[fieldName] ?? "");
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
                textNodes[startNodeIndex].textContent = before + replacement + after;
            } else {
                textNodes[startNodeIndex].textContent = before + replacement;

                for (let i = startNodeIndex + 1; i < endNodeIndex; i++) {
                    textNodes[i].textContent = "";
                }

                textNodes[endNodeIndex].textContent = after;
            }

            hasReplacement = true;
        }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
}

export { escapeRegex };
