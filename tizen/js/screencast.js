const Screencast = (() => {
    const videoEl = document.getElementById('cast-video');
    const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

    let ws = null;
    let pc = null;
    let negotiating = false;

    function enter() {
        const serverHost = Config.serverUrl.replace(/^https?:\/\//, '');
        const wsProto = Config.serverUrl.startsWith('https') ? 'wss:' : 'ws:';
        ws = new WebSocket(wsProto + '//' + serverHost + '/signal');

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'tv-hello', tvId: Config.tvId }));
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'offer') handleOffer(msg.sdp);
            if (msg.type === 'ice' && pc) pc.addIceCandidate(msg.candidate).catch(() => {});
        };

        ws.onclose = () => stop();
        ws.onerror = () => { try { ws.close(); } catch (_) {} ws = null; };
    }

    async function handleOffer(sdp) {
        if (negotiating) return;
        negotiating = true;
        if (pc) { pc.close(); pc = null; }
        try {
            pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });

            pc.ontrack = (event) => {
                videoEl.srcObject = event.streams[0];
                videoEl.play().catch(() => {});
            };

            pc.onicecandidate = (event) => {
                if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ice', tvId: Config.tvId, candidate: event.candidate }));
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', tvId: Config.tvId, sdp: pc.localDescription }));
        } finally {
            negotiating = false;
        }
    }

    function stop() {
        if (pc) { pc.close(); pc = null; }
        if (ws) { try { ws.close(); } catch (_) {} ws = null; }
        if (videoEl) videoEl.srcObject = null;
    }

    return { enter, stop };
})();
