const Slideshow = (() => {
    const layers = [
        document.getElementById('slide-img-a'),
        document.getElementById('slide-img-b'),
    ];
    let active     = 0; // índice da camada atualmente visível
    let filenames  = [];
    let index      = 0;
    let intervalId = null;

    function showFrame(filename) {
        Cache.get(filename).then(url => {
            const nextIdx = 1 - active;
            const next    = layers[nextIdx];
            const curr    = layers[active];

            const swap = () => {
                next.onload  = null;
                next.onerror = null;
                next.classList.add('active');
                curr.classList.remove('active');
                active = nextIdx;
            };

            next.onload  = swap;
            next.onerror = swap;
            next.src     = url || 'img/default.png';

            // Imagem já estava em cache e carregou sincronamente
            if (next.complete) swap();
        });
    }

    function advance() {
        if (filenames.length === 0) {
            layers[active].src = 'img/default.png';
            return;
        }
        showFrame(filenames[index % filenames.length]);
        index++;
    }

    function startTimer(names, intervalSec) {
        filenames = names;
        index     = 0;
        if (intervalId) clearInterval(intervalId);
        const ms = Math.max(1, intervalSec) * 1000;
        advance();
        intervalId = setInterval(advance, ms);
    }

    return {
        enter() {
            const names = Config.remoteImages;
            if (names.length === 0) { startTimer([], Config.slideInterval); return; }

            Cache.keys().then(cachedKeys => {
                const cached  = new Set(cachedKeys);
                const toFetch = names.filter(f => !cached.has(f));

                if (toFetch.length === 0) {
                    startTimer(names, Config.slideInterval);
                    return;
                }

                const downloads = toFetch.map(f =>
                    Api.downloadImage(f).then(blob => blob ? Cache.put(f, blob) : null)
                );
                Promise.all(downloads).then(() => startTimer(names, Config.slideInterval));
            });
        },

        syncImages(config) {
            const newNames        = config.images.map(i => i.filename);
            const oldNames        = Config.remoteImages;
            const imagesChanged   = JSON.stringify(newNames) !== JSON.stringify(oldNames);
            const intervalChanged = config.slideInterval !== Config.slideInterval;

            Config.apply(config);

            if (!imagesChanged && !intervalChanged) return;

            const newSet = new Set(newNames);
            oldNames.filter(f => !newSet.has(f)).forEach(f => Cache.delete(f));

            const oldSet    = new Set(oldNames);
            const toFetch   = newNames.filter(f => !oldSet.has(f));
            const downloads = toFetch.map(f =>
                Api.downloadImage(f).then(blob => blob ? Cache.put(f, blob) : null)
            );

            Promise.all(downloads).then(() => startTimer(newNames, config.slideInterval));
        },

        stop() {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }
    };
})();
