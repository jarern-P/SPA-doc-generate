export function extractFields(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const textNodes = [...doc.getElementsByTagName("w:t")];

    let fullText = "";
    for (const node of textNodes) {
        fullText += node.textContent || "";
    }

    const regex = /\{\{\s*([a-zA-Z0-9_ก-๙]+)\s*\}\}/g;
    const result = new Set();
    let match;

    while ((match = regex.exec(fullText)) !== null) {
        result.add(match[1]);
    }

    return [...result];
}
