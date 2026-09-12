export function getTemplateConfigPageHTML() {
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
