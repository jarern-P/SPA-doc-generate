// Sidebar component - จัดการ UI และ event ของ sidebar menu
// การแสดง/ซ่อนหน้าจริง อยู่ที่ app.js

export function initSidebar() {
    document.querySelectorAll('[data-page]').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            // trigger event ให้ app.js จัดการ
            document.dispatchEvent(new CustomEvent('page-change', { detail: { page } }));
        });
    });
}
