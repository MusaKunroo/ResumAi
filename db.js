const db = {
    dbName: 'ResumaiDB',
    storeName: 'resumes',
    version: 1,
    instance: null,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error("Database error: " + event.target.errorCode);
                reject(event.target.errorCode);
            };

            request.onsuccess = (event) => {
                this.instance = event.target.result;
                resolve(this.instance);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    },

    saveResume(name, blob, profileName) {
        return new Promise((resolve, reject) => {
            if (!this.instance) return reject('DB not initialized');
            
            const transaction = this.instance.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const record = {
                name: name,
                blob: blob,
                date: new Date().toISOString(),
                profileName: profileName || 'Unknown Profile'
            };
            
            const request = store.add(record);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    getAllResumes() {
        return new Promise((resolve, reject) => {
            if (!this.instance) return reject('DB not initialized');
            
            const transaction = this.instance.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    deleteResume(id) {
        return new Promise((resolve, reject) => {
            if (!this.instance) return reject('DB not initialized');
            
            const transaction = this.instance.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
};
