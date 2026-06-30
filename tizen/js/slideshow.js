const Slideshow = (() => {
    const layers = [
        document.getElementById('slide-img-a'),
        document.getElementById('slide-img-b'),
    ];
    const overlay = document.getElementById('slideshow-controls');
    const playBtn = document.getElementById('ctrl-play');

    let active     = 0;
    let filenames  = [];
    let index      = 0;
    let intervalId = null;
    let paused     = false;
    let hideTimer  = null;

    function showControls() {
        overlay.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => overlay.classList.remove('visible'), 3000);
    }

    function updatePlayBtn() {
        // ⏸ quando tocando, ▶ quando pausado
        playBtn.textContent = paused ? '▶' : '⏸';
    }

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
            if (next.complete) swap();
        });
    }

    function advance() {
        if (!filenames.length) {
            layers[active].src = 'img/default.png';
            return;
        }
        showFrame(filenames[index % filenames.length]);
        index++;
    }

    function startTimer(names, intervalSec) {
        filenames = names;
        index     = 0;
        paused    = false;
        if (intervalId) clearInterval(intervalId);
        const ms = Math.max(1, intervalSec) * 1000;
        advance();
        intervalId = setInterval(advance, ms);
        updatePlayBtn();
    }

    function pause() {
        if (paused || !intervalId) return;
        paused = true;
        clearInterval(intervalId);
        intervalId = null;
        updatePlayBtn();
        showControls();
    }

    function resume() {
        if (!paused) return;
        paused = false;
        const ms = Math.max(1, Config.slideInterval) * 1000;
        intervalId = setInterval(advance, ms);
        updatePlayBtn();
        showControls();
    }

    function togglePause() {
        if (paused) resume(); else pause();
    }

    function prevSlide() {
        if (!filenames.length) return;
        // index aponta para o próximo a exibir; recuar 2 chega ao slide anterior
        const n = filenames.length;
        index = ((index - 2) % n + n) % n;
        showFrame(filenames[index]);
        index = (index + 1) % n;
        showControls();
    }

    function nextSlide() {
        if (!filenames.length) return;
        advance();
        showControls();
    }

    return {
        enter() {
            paused = false;
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
            clearTimeout(hideTimer);
            paused = false;
            overlay.classList.remove('visible');
        },

        togglePause,
        prevSlide,
        nextSlide,
    };
})();
