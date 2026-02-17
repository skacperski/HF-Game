// ============================================================
// Hey Feelings - Media Module (Video + Audio via WebRTC)
// Piggybacks on y-webrtc peer connections for stream exchange
// ============================================================

const VIDEO_CONSTRAINTS = {
    width: { ideal: 160, max: 240 },
    height: { ideal: 120, max: 180 },
    frameRate: { ideal: 12, max: 15 },
};

const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
};

export function createMedia(provider, awareness, clientId) {
    let localStream = null;
    let videoEnabled = true;
    let audioEnabled = true;

    const trackedPeers = new Set();
    const remoteStreams = new Map();

    let _onStreamAdded = null;
    let _onStreamRemoved = null;
    let pollTimer = null;

    async function start() {
        // Request camera + mic with low resolution
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: VIDEO_CONSTRAINTS,
                audio: AUDIO_CONSTRAINTS,
            });
            console.log("Media: camera + mic acquired");
        } catch (err) {
            console.warn("Media: camera denied, trying audio only -", err.message);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: AUDIO_CONSTRAINTS,
                });
                console.log("Media: mic only acquired");
            } catch (err2) {
                console.warn("Media: all denied -", err2.message);
                return null;
            }
        }

        // Poll y-webrtc connections to attach media streams
        pollTimer = setInterval(checkConnections, 2000);
        setTimeout(checkConnections, 500);

        return localStream;
    }

    function checkConnections() {
        if (!localStream) return;
        if (!provider.room) return;

        const conns = provider.room.webrtcConns;
        if (!conns || conns.size === 0) return;

        conns.forEach((conn, peerId) => {
            if (trackedPeers.has(peerId)) return;

            const peer = conn.peer;
            if (!peer || peer.destroyed) return;

            trackedPeers.add(peerId);

            // Add our local stream to this peer connection
            try {
                peer.addStream(localStream);
            } catch (e) {
                console.warn("Media: failed to add stream to peer", peerId, e.message);
            }

            // Listen for their stream
            peer.on("stream", (stream) => {
                remoteStreams.set(peerId, stream);
                if (_onStreamAdded) _onStreamAdded(peerId, stream);
            });

            peer.on("close", () => {
                handlePeerClose(peerId);
            });

            peer.on("error", () => {
                handlePeerClose(peerId);
            });
        });

        // Clean up peers that no longer exist
        for (const peerId of trackedPeers) {
            if (!conns.has(peerId)) {
                handlePeerClose(peerId);
            }
        }
    }

    function handlePeerClose(peerId) {
        trackedPeers.delete(peerId);
        if (remoteStreams.has(peerId)) {
            remoteStreams.delete(peerId);
            if (_onStreamRemoved) _onStreamRemoved(peerId);
        }
    }

    function toggleVideo() {
        if (!localStream) return false;
        videoEnabled = !videoEnabled;
        localStream.getVideoTracks().forEach((t) => (t.enabled = videoEnabled));
        return videoEnabled;
    }

    function toggleAudio() {
        if (!localStream) return false;
        audioEnabled = !audioEnabled;
        localStream.getAudioTracks().forEach((t) => (t.enabled = audioEnabled));
        return audioEnabled;
    }

    function destroy() {
        if (pollTimer) clearInterval(pollTimer);
        remoteStreams.clear();
        trackedPeers.clear();
        if (localStream) {
            localStream.getTracks().forEach((t) => t.stop());
            localStream = null;
        }
    }

    return {
        start,
        get localStream() { return localStream; },
        get videoEnabled() { return videoEnabled; },
        get audioEnabled() { return audioEnabled; },
        get remoteStreams() { return remoteStreams; },
        toggleVideo,
        toggleAudio,
        destroy,
        checkConnections,
        set onStreamAdded(fn) { _onStreamAdded = fn; },
        set onStreamRemoved(fn) { _onStreamRemoved = fn; },
    };
}
