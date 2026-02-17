// ============================================================
// Hey Feelings - Main Orchestrator (Game + Co-browsing + Media)
// ============================================================
import { createCollab } from "./collab.js";
import { createMedia } from "./media.js";

const game = window.HFGame;

// ---- Initialize game engine ----
game.init();

// ---- Initialize co-browsing ----
const collab = createCollab(game);

// ---- Initialize media (video + audio) ----
const media = createMedia(collab.provider, collab.awareness, collab.ydoc.clientID);

// ---- UI References ----
const roomIdEl = document.getElementById("room-id");
const userCountEl = document.getElementById("user-count");
const userListEl = document.getElementById("user-list");
const shareBtn = document.getElementById("btn-share");
const modeToggle = document.getElementById("mode-toggle");
const modeLabel = document.getElementById("mode-label");
const collabPanel = document.getElementById("collab-panel");

// ---- Display room info ----
if (roomIdEl) roomIdEl.textContent = collab.roomId;

// ---- Share button ----
if (shareBtn) {
    shareBtn.addEventListener("click", () => {
        const url = collab.getRoomUrl();
        navigator.clipboard.writeText(url).then(() => {
            const span = shareBtn.querySelector("span");
            const prev = span.textContent;
            span.textContent = "Copied!";
            shareBtn.classList.add("copied");
            setTimeout(() => {
                span.textContent = prev;
                shareBtn.classList.remove("copied");
            }, 2000);
        }).catch(() => {
            prompt("Copy this link:", collab.getRoomUrl());
        });
    });
}

// ---- Mode toggle ----
if (modeToggle) {
    modeToggle.addEventListener("click", () => {
        const newMode = collab.getMode() === "shared" ? "individual" : "shared";
        collab.setMode(newMode);
        updateModeUI(newMode);
    });
}

function updateModeUI(mode) {
    if (!modeLabel) return;
    if (mode === "shared") {
        modeLabel.textContent = "Shared Pawn";
        modeToggle.title = "Switch to individual pawns";
    } else {
        modeLabel.textContent = "Own Pawns";
        modeToggle.title = "Switch to shared pawn";
    }
}

collab.onModeChanged = (mode) => {
    updateModeUI(mode);
};

// ---- Users list ----
function updateUsersUI(users) {
    if (userCountEl) {
        userCountEl.textContent = users.length;
    }
    if (userListEl) {
        userListEl.innerHTML = "";
        for (const u of users) {
            const dot = document.createElement("div");
            dot.className = "user-dot";
            dot.style.backgroundColor = u.color;
            dot.title = u.name + (u.isLocal ? " (you)" : "");
            if (u.isLocal) dot.classList.add("local");
            userListEl.appendChild(dot);
        }
    }
}

collab.onUsersChanged = updateUsersUI;
updateUsersUI(collab.getUsers());

// ---- Mouse cursor tracking ----
game.canvas.addEventListener("mousemove", (e) => {
    const cam = game.getCamera();
    collab.setCursor(e.clientX + cam.x, e.clientY + cam.y);
});

game.canvas.addEventListener("mouseleave", () => {
    collab.setCursor(-1, -1);
});

// ---- SVG sharing: intercept loads ----
const origParseSvg = game.parseSvgText;
game.parseSvgText = function (text) {
    const result = origParseSvg(text);
    if (result) {
        collab.shareSvg(text);
    }
    return result;
};

// ---- Render callback: sync + draw remote elements ----
game.addRenderCallback((ctx, cam) => {
    // Apply smooth interpolation from remote player data (must be BEFORE sync)
    collab.applyRemoteSmooth();

    // Sync local player to collab (only writes when local user has active input)
    collab.syncPlayer();
    collab.syncIndividualPawn();

    const vp = game.getViewport();

    // Draw remote cursors
    const cursors = collab.getRemoteCursors();
    for (const c of cursors) {
        const sx = c.x - cam.x;
        const sy = c.y - cam.y;
        if (sx < -30 || sx > vp.w + 30 || sy < -30 || sy > vp.h + 30) continue;

        // Outer glow
        ctx.fillStyle = c.color + "30";
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.fill();

        // Inner dot
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();

        // Ring
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.stroke();

        // Name label
        ctx.font = "bold 11px 'Nunito', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const labelW = ctx.measureText(c.name).width + 10;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.roundRect(sx - labelW / 2, sy - 30, labelW, 18, 4);
        ctx.fill();

        ctx.fillStyle = c.color;
        ctx.fillText(c.name, sx, sy - 14);
    }

    // Draw remote pawns (individual mode)
    const pawns = collab.getRemotePawns();
    for (const p of pawns) {
        const sx = p.x - cam.x;
        const sy = p.y - cam.y;
        if (sx < -40 || sx > vp.w + 40 || sy < -60 || sy > vp.h + 40) continue;

        game.drawCharacter(sx, sy, 18, p.color, p.direction, p.animFrame || 0, false);

        // Name label above pawn
        ctx.font = "bold 11px 'Nunito', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const nameW = ctx.measureText(p.name).width + 10;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.roundRect(sx - nameW / 2, sy - 36, nameW, 16, 4);
        ctx.fill();

        ctx.fillStyle = p.color;
        ctx.fillText(p.name, sx, sy - 22);
    }
});

// ---- Collab connection indicator on minimap ----
game.addRenderCallback((ctx) => {
    const users = collab.getUsers();
    if (users.length <= 1) return;

    const vp = game.getViewport();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect(vp.w - 158, 160, 142, 22, 6);
    ctx.fill();

    ctx.font = "bold 11px 'Nunito', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#81C784";
    ctx.fillText(`${users.length} connected`, vp.w - 24, 171);

    ctx.beginPath();
    ctx.arc(vp.w - 148, 171, 4, 0, Math.PI * 2);
    ctx.fill();
});

// ============================================================
// Media: Video + Audio HUD
// ============================================================

const localVideoEl = document.getElementById("local-video");
const remoteVideosEl = document.getElementById("remote-videos");
const btnCam = document.getElementById("btn-toggle-cam");
const btnMic = document.getElementById("btn-toggle-mic");
const localVideoBox = document.getElementById("local-video-box");

// Start media capture
media.start().then((stream) => {
    if (!stream) {
        if (localVideoBox) localVideoBox.classList.add("no-video");
        return;
    }

    // Show local video
    if (localVideoEl) {
        localVideoEl.srcObject = stream;
    }

    // Show local name
    const localLabel = localVideoBox?.querySelector(".video-label");
    if (localLabel) localLabel.textContent = collab.localUser.name;

    // Check if we have video track
    if (stream.getVideoTracks().length === 0) {
        if (localVideoBox) localVideoBox.classList.add("no-video");
        if (btnCam) btnCam.classList.add("hidden");
    }
});

// Remote stream handling
media.onStreamAdded = (peerId, stream) => {
    if (!remoteVideosEl) return;

    // Find user info from awareness
    const users = collab.getUsers();
    const user = users.find((u) => String(u.id) === String(peerId));
    const name = user ? user.name : `Peer-${String(peerId).slice(-4)}`;
    const color = user ? user.color : "#aaa";

    // Create video box
    const box = document.createElement("div");
    box.className = "video-box";
    box.id = `remote-video-${peerId}`;
    box.style.borderColor = color + "80";

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement("span");
    label.className = "video-label";
    label.textContent = name;
    label.style.color = color;

    box.appendChild(video);
    box.appendChild(label);
    remoteVideosEl.appendChild(box);
};

media.onStreamRemoved = (peerId) => {
    const box = document.getElementById(`remote-video-${peerId}`);
    if (box) box.remove();
};

// Camera toggle
if (btnCam) {
    btnCam.addEventListener("click", () => {
        const enabled = media.toggleVideo();
        btnCam.classList.toggle("active", enabled);
        btnCam.classList.toggle("muted", !enabled);
        btnCam.title = enabled ? "Turn off camera" : "Turn on camera";
    });
}

// Mic toggle
if (btnMic) {
    btnMic.addEventListener("click", () => {
        const enabled = media.toggleAudio();
        btnMic.classList.toggle("active", enabled);
        btnMic.classList.toggle("muted", !enabled);
        btnMic.title = enabled ? "Mute microphone" : "Unmute microphone";
    });
}

console.log(`%cCo-browsing%c Room: ${collab.roomId}`, "color:#81C784;font-weight:bold", "color:#ccc");
