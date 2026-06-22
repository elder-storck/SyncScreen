const Api = (() => {
    function post(path, body) {
        return fetch(Config.serverUrl + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(r => r.ok ? r.json() : Promise.reject(r.status));
    }

    function parseConfig(data) {
        const cfg = data.config;
        return {
            mode:          cfg.mode           || 'slideshow',
            webviewUrl:    cfg.webview_url    || '',
            slideInterval: cfg.slide_interval  || 5,
            images:        (cfg.images || []).map(i => ({ id: i.id, filename: i.filename }))
        };
    }

    return {
        register(tvId, tvName, ipAddress) {
            return post('/api/tvs/register', {
                id: tvId, name: tvName, ip_address: ipAddress, android_id: tvId
            }).then(parseConfig).catch(() => null);
        },

        heartbeat(tvId) {
            return post('/api/tvs/heartbeat', { id: tvId })
                .then(parseConfig)
                .catch(() => null);
        },

        downloadImage(filename) {
            return fetch(Config.serverUrl + '/uploads/' + filename)
                .then(r => r.ok ? r.blob() : Promise.reject(r.status))
                .catch(() => null);
        }
    };
})();
