// ============================================================
// Hey Feelings - Co-browsing Module (Yjs + y-webrtc)
// ============================================================
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

const PEER_COLORS = [
    "#E74C3C", "#3498DB", "#2ECC71", "#F39C12",
    "#9B59B6", "#1ABC9C", "#E84393", "#00B894",
    "#FF6B8A", "#5DADE2", "#E67E22", "#A8B820",
];

const ADJECTIVES = ["Happy", "Brave", "Kind", "Calm", "Wise", "Sweet", "Warm", "Bold"];
const NOUNS = ["Filly", "Dilly", "Star", "Heart", "Cloud", "Sun", "Moon", "Gem"];

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 10);
}

function generateUserName() {
    return randomItem(ADJECTIVES) + randomItem(NOUNS);
}

export function createCollab(game) {
    // ---- Room ID from URL hash ----
    let roomId;
    const hash = window.location.hash;
    if (hash.startsWith("#room=")) {
        roomId = hash.substring(6);
    } else {
        roomId = generateRoomId();
        history.replaceState(null, "", `#room=${roomId}`);
    }

    // ---- Local user identity ----
    const localUser = {
        name: generateUserName(),
        color: randomItem(PEER_COLORS),
    };

    // ---- Initialize Yjs ----
    const ydoc = new Y.Doc();
    // Build signaling server list
    const signalingServers = [];

    // Local signaling server (start with: npx y-webrtc-signaling)
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        signalingServers.push("ws://localhost:4444");
    }

    // Public fallback
    signalingServers.push("wss://signaling.yjs.dev");

    const provider = new WebrtcProvider(`hf-game-${roomId}`, ydoc, {
        signaling: signalingServers,
        // CRITICAL: allow BroadcastChannel sync even when signaling servers are down.
        // This enables same-browser tab-to-tab sync without any server.
        filterBcConns: false,
    });

    // Suppress noisy WebSocket reconnection errors in console
    provider.on("status", () => {});
    const awareness = provider.awareness;

    const yPlayer = ydoc.getMap("player");
    const ySvgMap = ydoc.getMap("svgMap");
    const ySettings = ydoc.getMap("settings");

    // ---- Mode ----
    let mode = "shared";
    let _onUsersChanged = null;
    let _onModeChanged = null;

    // ---- Set initial awareness ----
    awareness.setLocalStateField("user", localUser);
    awareness.setLocalStateField("cursor", null);
    awareness.setLocalStateField("pawn", null);

    // ---- Awareness changes ----
    awareness.on("change", () => {
        if (_onUsersChanged) _onUsersChanged(getUsers());
    });

    // ---- Shared player sync (remote -> local) ----
    // Instead of instant snap, we store a remote target and interpolate smoothly.
    // Only the user who is ACTIVELY pressing keys writes to Y.Map (prevents echo-loop).
    let remoteTarget = null;
    let lastRemoteTime = 0;

    yPlayer.observe((event) => {
        if (event.transaction.local) return;
        if (mode !== "shared") return;
        lastRemoteTime = Date.now();
        remoteTarget = {
            x: yPlayer.get("x") ?? game.player.x,
            y: yPlayer.get("y") ?? game.player.y,
            direction: yPlayer.get("direction") ?? 0,
            moving: yPlayer.get("moving") ?? false,
        };
    });

    // ---- SVG map sync (remote -> local) ----
    ySvgMap.observe((event) => {
        if (event.transaction.local) return;
        const text = ySvgMap.get("text");
        if (text) {
            game.parseSvgText(text);
            const btnLoad = document.getElementById("btn-load-svg");
            const btnClear = document.getElementById("btn-clear-svg");
            if (btnLoad) btnLoad.classList.add("hidden");
            if (btnClear) {
                btnClear.classList.remove("hidden");
                const span = btnClear.querySelector("span");
                if (span) span.textContent = "Shared Map";
            }
        }
    });

    // ---- Settings sync ----
    ySettings.observe(() => {
        const newMode = ySettings.get("mode");
        if (newMode && newMode !== mode) {
            mode = newMode;
            if (_onModeChanged) _onModeChanged(mode);
        }
    });

    // ---- API Functions ----

    function getUsers() {
        const states = awareness.getStates();
        const users = [];
        states.forEach((state, clientID) => {
            if (state && state.user) {
                users.push({
                    id: clientID,
                    name: state.user.name,
                    color: state.user.color,
                    cursor: state.cursor,
                    pawn: state.pawn,
                    isLocal: clientID === ydoc.clientID,
                });
            }
        });
        return users;
    }

    let lastSyncTime = 0;
    const SYNC_INTERVAL = 33; // ~30fps sync rate
    const REMOTE_COOLDOWN = 150; // ms to wait after receiving remote before sending

    function syncPlayer() {
        if (mode !== "shared") return;

        // Only sync when the LOCAL user is actively providing input.
        // This prevents echo: idle tab would otherwise echo back remote positions.
        if (!game.hasLocalInput()) return;

        // Cooldown: don't write back immediately after receiving remote data
        const now = Date.now();
        if (now - lastRemoteTime < REMOTE_COOLDOWN) return;

        if (now - lastSyncTime < SYNC_INTERVAL) return;
        lastSyncTime = now;

        // Clear remote target since we're now the driver
        remoteTarget = null;

        const p = game.player;
        ydoc.transact(() => {
            yPlayer.set("x", Math.round(p.x * 10) / 10);
            yPlayer.set("y", Math.round(p.y * 10) / 10);
            yPlayer.set("direction", p.direction);
            yPlayer.set("moving", p.moving);
        });
    }

    // Smooth interpolation: called every frame from main.js render callback.
    // When local user is idle, smoothly move player toward remote position.
    function applyRemoteSmooth() {
        if (mode !== "shared") return;
        if (!remoteTarget) return;

        // If local user is actively controlling, ignore remote target
        if (game.hasLocalInput()) {
            remoteTarget = null;
            return;
        }

        const p = game.player;
        const dx = remoteTarget.x - p.x;
        const dy = remoteTarget.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.5) {
            // Close enough, snap and clear
            p.x = remoteTarget.x;
            p.y = remoteTarget.y;
            p.direction = remoteTarget.direction;
            p.moving = remoteTarget.moving;
            remoteTarget = null;
        } else {
            // Smooth lerp (0.25 per frame at 60fps = quick but smooth)
            const lerp = Math.min(0.3, dist * 0.01 + 0.1);
            p.x += dx * lerp;
            p.y += dy * lerp;
            p.direction = remoteTarget.direction;
            p.moving = remoteTarget.moving;
        }
    }

    function syncIndividualPawn() {
        if (mode !== "individual") return;
        const p = game.player;
        awareness.setLocalStateField("pawn", {
            x: Math.round(p.x * 10) / 10,
            y: Math.round(p.y * 10) / 10,
            direction: p.direction,
            moving: p.moving,
            animFrame: p.animFrame,
        });
    }

    function setCursor(boardX, boardY) {
        if (boardX < 0 || boardY < 0) {
            awareness.setLocalStateField("cursor", null);
        } else {
            awareness.setLocalStateField("cursor", {
                x: Math.round(boardX),
                y: Math.round(boardY),
            });
        }
    }

    function shareSvg(svgText) {
        if (svgText) {
            ySvgMap.set("text", svgText);
        }
    }

    function setMode(newMode) {
        mode = newMode;
        ySettings.set("mode", newMode);
        if (_onModeChanged) _onModeChanged(mode);
    }

    function setUserName(name) {
        localUser.name = name;
        awareness.setLocalStateField("user", { ...localUser });
    }

    function getRemoteCursors() {
        const cursors = [];
        awareness.getStates().forEach((state, clientID) => {
            if (clientID === ydoc.clientID) return;
            if (state && state.user && state.cursor) {
                cursors.push({
                    name: state.user.name,
                    color: state.user.color,
                    x: state.cursor.x,
                    y: state.cursor.y,
                });
            }
        });
        return cursors;
    }

    function getRemotePawns() {
        if (mode !== "individual") return [];
        const pawns = [];
        awareness.getStates().forEach((state, clientID) => {
            if (clientID === ydoc.clientID) return;
            if (state && state.user && state.pawn) {
                pawns.push({
                    name: state.user.name,
                    color: state.user.color,
                    ...state.pawn,
                });
            }
        });
        return pawns;
    }

    function getRoomUrl() {
        return `${window.location.origin}${window.location.pathname}#room=${roomId}`;
    }

    function destroy() {
        provider.destroy();
        ydoc.destroy();
    }

    return {
        roomId,
        localUser,
        getUsers,
        syncPlayer,
        applyRemoteSmooth,
        syncIndividualPawn,
        setCursor,
        shareSvg,
        setMode,
        getMode: () => mode,
        setUserName,
        getRemoteCursors,
        getRemotePawns,
        getRoomUrl,
        destroy,
        set onUsersChanged(fn) { _onUsersChanged = fn; },
        set onModeChanged(fn) { _onModeChanged = fn; },
    };
}
