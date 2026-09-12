// DB Module - ตัวกลางคุยกับ db-worker.js (ฐานข้อมูล SQLite อยู่ใน worker เท่านั้น)
(function (scope) {
    'use strict';

    const WORKER_URL = 'src/db-worker.js';

    let worker = null;
    let readyPromise = null;
    let sequence = 0;
    const pending = new Map();

    function failAll(error) {
        pending.forEach(function (request) {
            request.reject(error);
        });
        pending.clear();
    }

    // เริ่ม worker ครั้งเดียว แล้วรอสัญญาณ ready
    function init() {
        if (readyPromise) return readyPromise;

        readyPromise = new Promise(function (resolve, reject) {
            try {
                worker = new Worker(WORKER_URL, { type: 'module' });
            } catch (error) {
                reject(error);
                return;
            }

            worker.addEventListener('message', function (event) {
                const data = event.data || {};

                if (data.type === 'ready') {
                    if (data.ok) {
                        resolve({ persistent: !!data.persistent });
                    } else {
                        reject(new Error(data.error || 'เริ่มฐานข้อมูลไม่สำเร็จ'));
                    }
                    return;
                }

                const request = pending.get(data.id);
                if (!request) return;

                pending.delete(data.id);
                if (data.ok) {
                    request.resolve(data.result);
                } else {
                    request.reject(new Error(data.error || 'คำสั่งฐานข้อมูลล้มเหลว'));
                }
            });

            worker.addEventListener('error', function (event) {
                const error = new Error(event.message || 'Worker ทำงานผิดพลาด');
                failAll(error);
                reject(error);
            });
        });

        return readyPromise;
    }

    function request(type, payload) {
        return init().then(function () {
            return new Promise(function (resolve, reject) {
                const id = ++sequence;
                pending.set(id, { resolve: resolve, reject: reject });
                worker.postMessage({ id: id, type: type, payload: payload || {} });
            });
        });
    }

    scope.Db = {
        init: init,

        // payload: { id?, name, fileName, docx (Uint8Array), fields, types }
        save: function (payload) {
            return request('save', payload);
        },

        list: function () {
            return request('list');
        },

        get: function (id) {
            return request('get', { id: id });
        },

        remove: function (id) {
            return request('delete', { id: id });
        }
    };
})(window);
