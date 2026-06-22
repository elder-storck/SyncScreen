const Cache = (() => {
    const DB_NAME    = 'syncscreen-images';
    const STORE_NAME = 'images';
    const DB_VERSION = 1;

    let db = null;

    function openDb() {
        if (db) return Promise.resolve(db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
            req.onsuccess       = e => { db = e.target.result; resolve(db); };
            req.onerror         = e => reject(e.target.error);
        });
    }

    function getStore(mode) {
        return openDb().then(database =>
            database.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
        );
    }

    function wrap(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    return {
        put(filename, blob) {
            return getStore('readwrite').then(store => wrap(store.put(blob, filename)));
        },

        get(filename) {
            return getStore('readonly')
                .then(store => wrap(store.get(filename)))
                .then(blob  => blob ? URL.createObjectURL(blob) : null);
        },

        delete(filename) {
            return getStore('readwrite').then(store => wrap(store.delete(filename)));
        },

        keys() {
            return getStore('readonly').then(store => wrap(store.getAllKeys()));
        }
    };
})();
