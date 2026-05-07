const SERVER_URL = 'http://192.168.13.128:3000'; // editar antes de empacotar

const Config = (() => {
    const LS = localStorage;

    return {
        get serverUrl()     { return SERVER_URL; },

        get tvId()          { return LS.getItem('tv_id') || ''; },
        set tvId(v)         { LS.setItem('tv_id', v); },

        get mode()          { return LS.getItem('mode') || 'slideshow'; },
        get webviewUrl()    { return LS.getItem('webview_url') || ''; },
        get slideInterval() { return parseInt(LS.getItem('slide_interval') || '5', 10); },
        get remoteImages() {
            const s = LS.getItem('remote_images') || '';
            return s ? s.split(',') : [];
        },

        apply(config) {
            LS.setItem('mode',           config.mode);
            LS.setItem('webview_url',    config.webviewUrl);
            LS.setItem('slide_interval', String(config.slideInterval));
            LS.setItem('remote_images',  config.images.map(i => i.filename).join(','));
        }
    };
})();
