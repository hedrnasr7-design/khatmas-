const OfflineStore = (() => {
    const DB_NAME = 'khatmas-offline-db';
    const DB_VERSION = 1;
    const KHATMAS_STORE = 'khatmas';
    const META_STORE = 'meta';
    let databasePromise = null;

    function open() {
        if (databasePromise) return databasePromise;

        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(KHATMAS_STORE)) {
                    database.createObjectStore(KHATMAS_STORE, { keyPath: 'key' });
                }
                if (!database.objectStoreNames.contains(META_STORE)) {
                    database.createObjectStore(META_STORE, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('تعذر فتح التخزين المحلي لأن نسخة قديمة من التطبيق ما زالت مفتوحة.'));
        });

        return databasePromise;
    }

    function transactionPromise(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('تم إلغاء عملية التخزين المحلي.'));
        });
    }

    async function getAllKhatmas() {
        const database = await open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(KHATMAS_STORE, 'readonly');
            const request = transaction.objectStore(KHATMAS_STORE).getAll();
            request.onsuccess = () => {
                const result = {};
                request.result.forEach((record) => {
                    const { key, ...value } = record;
                    result[key] = value;
                });
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function replaceAllKhatmas(data) {
        const database = await open();
        const transaction = database.transaction(KHATMAS_STORE, 'readwrite');
        const store = transaction.objectStore(KHATMAS_STORE);
        store.clear();
        Object.entries(data || {}).forEach(([key, value]) => {
            store.put({ key, ...value });
        });
        await transactionPromise(transaction);
    }

    async function putKhatma(key, value) {
        const database = await open();
        const transaction = database.transaction(KHATMAS_STORE, 'readwrite');
        transaction.objectStore(KHATMAS_STORE).put({ key, ...value });
        await transactionPromise(transaction);
    }

    async function deleteKhatma(key) {
        const database = await open();
        const transaction = database.transaction(KHATMAS_STORE, 'readwrite');
        transaction.objectStore(KHATMAS_STORE).delete(key);
        await transactionPromise(transaction);
    }

    async function getMeta(key) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(META_STORE, 'readonly');
            const request = transaction.objectStore(META_STORE).get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    async function setMeta(key, value) {
        const database = await open();
        const transaction = database.transaction(META_STORE, 'readwrite');
        transaction.objectStore(META_STORE).put({ key, value });
        await transactionPromise(transaction);
    }

    return {
        open,
        getAllKhatmas,
        replaceAllKhatmas,
        putKhatma,
        deleteKhatma,
        getMeta,
        setMeta
    };
})();
