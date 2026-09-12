// DB Worker - เก็บ template (ชื่อ, type ของแต่ละ field, ไฟล์ .docx) ใน SQLite
//
// ต้องรันใน Worker เพราะ OPFS ใช้ได้เฉพาะ Worker thread (ไม่ใช่ main UI thread)
// ใช้ VFS "opfs-sahpool" ซึ่งไม่ต้องตั้ง COOP/COEP header
// ถ้า OPFS ใช้ไม่ได้ (เช่นเปิดผ่าน file://) จะ fallback เป็น in-memory ให้โปรแกรมยังทำงานได้
import sqlite3InitModule from 'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.53.4-build1/dist/index.mjs';

const DB_PATH = '/word-templates.sqlite3';

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS templates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        file_name  TEXT NOT NULL DEFAULT '',
        docx       BLOB NOT NULL,
        fields     TEXT NOT NULL DEFAULT '[]',
        types      TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
`;

let db = null;
let persistent = false;

function rows(sql, bind) {
    return db.exec({
        sql: sql,
        bind: bind || [],
        rowMode: 'object',
        returnValue: 'resultRows'
    });
}

// เปิดฐานข้อมูล: ลอง OPFS ก่อน ถ้าไม่ได้ก็ใช้ in-memory
async function openDatabase() {
    const sqlite3 = await sqlite3InitModule();

    try {
        // opfs-sahpool: ไม่ต้องใช้ COOP/COEP และเร็วที่สุด (แต่ใช้ได้ทีละแท็บ)
        const pool = await sqlite3.installOpfsSAHPoolVfs({ initialCapacity: 6 });
        db = new pool.OpfsSAHPoolDb(DB_PATH);
        persistent = true;
    } catch (error) {
        // สาเหตุที่พบบ่อย: เปิดผ่าน file:// หรือเปิดซ้ำหลายแท็บ (sahpool ใช้ได้ทีละแท็บ)
        console.warn('OPFS ใช้ไม่ได้ จะใช้ in-memory แทน (ข้อมูลจะไม่ถูกบันทึกถาวร):', error);
        db = new sqlite3.oo1.DB(':memory:');
        persistent = false;
    }

    db.exec(SCHEMA);
    return { persistent: persistent };
}

// ──────────────────────────────────────────────────────────────
// คำสั่งต่าง ๆ (เรียกจาก main thread)
// ──────────────────────────────────────────────────────────────
const commands = {
    list: function () {
        return rows(
            'SELECT id, name, file_name, fields, types, created_at, updated_at' +
            ' FROM templates ORDER BY updated_at DESC'
        );
    },

    get: function (payload) {
        const result = rows(
            'SELECT id, name, file_name, docx, fields, types, created_at, updated_at' +
            ' FROM templates WHERE id = ?',
            [payload.id]
        );
        return result[0] || null;
    },

    save: function (payload) {
        const now = new Date().toISOString();
        const fields = JSON.stringify(payload.fields || []);
        const types = JSON.stringify(payload.types || {});

        // มี id เดิม (โหลดมาจากฐานข้อมูล) → อัปเดตแถวเดิมก่อน
        if (payload.id) {
            const updated = rows(
                'UPDATE templates SET name = ?, file_name = ?, docx = ?, fields = ?, types = ?, updated_at = ?' +
                ' WHERE id = ? RETURNING id',
                [payload.name, payload.fileName, payload.docx, fields, types, now, payload.id]
            );
            if (updated.length > 0) {
                return { id: updated[0].id };
            }
        }

        // ไม่มี id หรือ id เดิมหายไปแล้ว → เพิ่มใหม่ (ถ้าชื่อซ้ำให้ทับของเดิม)
        const saved = rows(
            'INSERT INTO templates (name, file_name, docx, fields, types, created_at, updated_at)' +
            ' VALUES (?, ?, ?, ?, ?, ?, ?)' +
            ' ON CONFLICT(name) DO UPDATE SET' +
            '   file_name = excluded.file_name,' +
            '   docx = excluded.docx,' +
            '   fields = excluded.fields,' +
            '   types = excluded.types,' +
            '   updated_at = excluded.updated_at' +
            ' RETURNING id',
            [payload.name, payload.fileName, payload.docx, fields, types, now, now]
        );

        return { id: saved[0].id };
    },

    delete: function (payload) {
        const deleted = rows('DELETE FROM templates WHERE id = ? RETURNING id', [payload.id]);
        return { deleted: deleted.length > 0 };
    }
};

// ──────────────────────────────────────────────────────────────
// รับ-ส่งข้อความกับ main thread
// ──────────────────────────────────────────────────────────────
self.addEventListener('message', function (event) {
    const message = event.data || {};
    const command = commands[message.type];

    if (!command) {
        self.postMessage({
            id: message.id,
            ok: false,
            error: 'ไม่รู้จักคำสั่ง: ' + message.type
        });
        return;
    }

    try {
        const result = command(message.payload || {});
        self.postMessage({ id: message.id, ok: true, result: result });
    } catch (error) {
        console.error('DB command failed:', message.type, error);
        self.postMessage({
            id: message.id,
            ok: false,
            error: (error && error.message) ? error.message : String(error)
        });
    }
});

openDatabase()
    .then(function (info) {
        self.postMessage({ type: 'ready', ok: true, persistent: info.persistent });
    })
    .catch(function (error) {
        console.error('เปิดฐานข้อมูลไม่สำเร็จ:', error);
        self.postMessage({
            type: 'ready',
            ok: false,
            error: (error && error.message) ? error.message : String(error)
        });
    });
