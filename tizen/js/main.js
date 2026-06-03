const App = (() => {
    const slideshowView = document.getElementById('slideshow-view');
    const webviewView   = document.getElementById('webview-view');

    let currentMode    = '';
    let syncIntervalId = null;
    let startPending   = false;

    function showMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;

        if (mode === 'webview') {
            slideshowView.classList.add('hidden');
            webviewView.classList.remove('hidden');
            Slideshow.stop();
            Webview.enter();
        } else {
            webviewView.classList.add('hidden');
            slideshowView.classList.remove('hidden');
            Slideshow.enter();
        }
    }

    function doSync() {
        Api.heartbeat(Config.tvId).then(config => {
            if (!config) return;

            if (config.mode !== currentMode) {
                Config.apply(config);
                showMode(config.mode);
            } else if (config.mode === 'webview') {
                Webview.syncUrl(config);
            } else {
                Slideshow.syncImages(config);
            }
        });
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function getTvId(callback) {
        if (typeof tizen !== 'undefined') {
            tizen.systeminfo.getPropertyValue(
                'BUILD',
                info => {
                    const id = (info && info.serialNumber) ? info.serialNumber : '';
                    if (id) {
                        Config.tvId = id;
                        callback(id, '');
                    } else {
                        useFallbackId(callback);
                    }
                },
                () => useFallbackId(callback)
            );
        } else {
            useFallbackId(callback);
        }
    }

    function useFallbackId(callback) {
        let duid = '';
        try { duid = webapis.productinfo.getDuid(); } catch (_) {}
        const id = duid || Config.tvId || generateUUID();
        Config.tvId = id;
        callback(id, '');
    }

    function getLocalIp() {
        if (typeof webapis !== 'undefined' && webapis.network) {
            try {
                const ip = webapis.network.getIPAddress();
                if (ip) return Promise.resolve(ip);
            } catch (_) {}
        }
        if (typeof tizen !== 'undefined') {
            return new Promise(resolve => {
                let done = false;
                const finish = ip => { if (!done) { done = true; resolve(ip || ''); } };
                setTimeout(() => finish(''), 3000);
                tizen.systeminfo.getPropertyValue('WIFI_NETWORK',
                    info => finish(info && info.ipAddress ? info.ipAddress : ''),
                    () => tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK',
                        info => finish(info && info.ipAddress ? info.ipAddress : ''),
                        () => finish('')
                    )
                );
            });
        }
        try {
            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('');
            return new Promise(resolve => {
                pc.onicecandidate = e => {
                    if (!e || !e.candidate) { pc.close(); resolve(''); return; }
                    const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
                    if (m) { pc.close(); resolve(m[1]); }
                };
                pc.createOffer().then(o => pc.setLocalDescription(o));
                setTimeout(() => { pc.close(); resolve(''); }, 1000);
            });
        } catch (_) {
            return Promise.resolve('');
        }
    }

    function start() {
        if (startPending) return;
        startPending = true;
        setTimeout(() => { startPending = false; }, 10000);

        if (syncIntervalId) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
        currentMode = '';

        getTvId((tvId, tvModel) => {
            const tvName = tvModel || ((typeof tizen !== 'undefined') ? 'Samsung Tizen TV' : navigator.userAgent.slice(0, 40));

            getLocalIp().then(ip => {
                Api.register(tvId, tvName, ip).then(config => {
                    if (config) Config.apply(config);
                    showMode(Config.mode);
                    doSync();
                    syncIntervalId = setInterval(doSync, 15000);
                });
            });
        });
    }

    return { start };
})();

document.addEventListener('DOMContentLoaded', () => App.start());
document.addEventListener('appcontrol', () => App.start());

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) App.start();
});

window.addEventListener('focus', () => App.start());
