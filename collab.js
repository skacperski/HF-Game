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
    const provider = new WebrtcProvider(`hf-game-${roomId}`, ydoc, {
        signaling: [
            "wss://signaling.yjs.dev",
            "wss://y-webrtc-signaling-eu.herokuapp.com",
            "wss://y-webrtc-signaling-us.herokuapp.com",
        ],
    });
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
    let suppressRemoteApply = false;

    yPlayer.observe((event) => {
        if (event.transaction.local) return;
        if (mode !== "shared") return;
        suppressRemoteApply = true;
        game.player.x = yPlayer.get("x") ?? game.player.x;
        game.player.y = yPlayer.get("y") ?? game.player.y;
        game.player.direction = yPlayer.get("direction") ?? game.player.direction;
        game.player.moving = yPlayer.get("moving") ?? false;
        suppressRemoteApply = false;
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
    function syncPlayer() {
        if (mode !== "shared") return;
        if (suppressRemoteApply) return;

        const now = Date.now();
        if (now - lastSyncTime < 50) return;
        lastSyncTime = now;

        const p = game.player;
        ydoc.transact(() => {
            yPlayer.set("x", Math.round(p.x * 10) / 10);
            yPlayer.set("y", Math.round(p.y * 10) / 10);
            yPlayer.set("direction", p.direction);
            yPlayer.set("moving", p.moving);
        });
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
