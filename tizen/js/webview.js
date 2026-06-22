const Webview = (() => {
    const frame = document.getElementById('kiosk-frame');

    function goFullscreen() {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return;
        try {
            const p = req.call(el);
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
    }

    return {
        enter() {
            frame.src = Config.webviewUrl || 'about:blank';
            goFullscreen();
        },

        syncUrl(config) {
            const urlChanged = config.webviewUrl !== Config.webviewUrl;
            Config.apply(config);
            if (urlChanged) {
                frame.src = Config.webviewUrl || 'about:blank';
            }
        }
    };
})();
