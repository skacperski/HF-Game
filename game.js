// ============================================================
// Hey Feelings - Worlds of Emotions - Game Engine
// ============================================================

(function () {
    "use strict";

    // ---- Constants ----
    const BOARD_SCALE = 3;
    const PLAYER_SPEED = 3.5;
    const NPC_COUNT = 25;
    const NPC_MIN_SPEED = 0.4;
    const NPC_MAX_SPEED = 1.4;
    const TILE_SIZE = 64;
    const TREE_COUNT = 80;
    const ROCK_COUNT = 40;
    const HOUSE_COUNT = 12;
    const FLOWER_COUNT = 120;
    const CRYSTAL_COUNT = 60;
    const PATH_POINT_MARGIN = 2;

    // ---- Emotion Worlds (3x3 grid) ----
    // Each world has: name, emoji, base grass colors, accent color, label color
    const EMOTION_WORLDS = [
        [
            { name: "World of Fear",    emoji: "\u{1F630}", grass: ["#3d5a4a", "#345249"], accent: "#6B5B95", label: "rgba(107,91,149,0.15)" },
            { name: "World of Anxiety", emoji: "\u{1F616}", grass: ["#4a6a5a", "#3f6050"], accent: "#5DADE2", label: "rgba(93,173,226,0.12)" },
            { name: "World of Anger",   emoji: "\u{1F621}", grass: ["#5a4a3a", "#504238"], accent: "#E74C3C", label: "rgba(231,76,60,0.12)" },
        ],
        [
            { name: "World of Empathy", emoji: "\u{1F49C}", grass: ["#4a6b4a", "#3f6040"], accent: "#E8A0BF", label: "rgba(232,160,191,0.12)" },
            { name: "Filly & Dilly's Home", emoji: "\u{1F3E0}", grass: ["#5a8a4f", "#4e7e44"], accent: "#F4D03F", label: "rgba(244,208,63,0.12)" },
            { name: "World of Boredom", emoji: "\u{1F634}", grass: ["#5a6a3a", "#4f5f34"], accent: "#A8B820", label: "rgba(168,184,32,0.12)" },
        ],
        [
            { name: "World of Love",    emoji: "\u{2764}\u{FE0F}",  grass: ["#5a4a5a", "#4f4050"], accent: "#FF6B8A", label: "rgba(255,107,138,0.12)" },
            { name: "World of Joy",     emoji: "\u{1F60A}", grass: ["#5a7a3a", "#4f6f34"], accent: "#F39C12", label: "rgba(243,156,18,0.12)" },
            { name: "World of Courage", emoji: "\u{1F4AA}", grass: ["#4a5a3a", "#404f34"], accent: "#E67E22", label: "rgba(230,126,34,0.12)" },
        ],
    ];

    // ---- Canvas Setup ----
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const minimapEl = document.getElementById("minimap");

    let W, H, boardW, boardH;
    let minimapCanvas, minimapCtx;

    function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;
        boardW = W * BOARD_SCALE;
        boardH = H * BOARD_SCALE;

        if (!minimapCanvas) {
            minimapCanvas = document.createElement("canvas");
            minimapEl.appendChild(minimapCanvas);
        }
        minimapCanvas.width = 140;
        minimapCanvas.height = 140;
        minimapCanvas.style.width = "100%";
        minimapCanvas.style.height = "100%";
        minimapCanvas.style.borderRadius = "6px";
        minimapCtx = minimapCanvas.getContext("2d");

        if (svgPaths.length > 0) {
            rescaleSvgPaths();
        }
    }

    // ---- Seeded Random ----
    let seed = 42;
    function seededRandom() {
        seed = (seed * 16807 + 0) % 2147483647;
        return (seed - 1) / 2147483646;
    }

    // ---- Color Palette (Hey Feelings Brand) ----
    const COLORS = {
        grassLight: "#5a8a4f",
        grassDark: "#4e7e44",
        pathLight: "#c4a96a",
        pathDark: "#b09858",
        pathHighlight: "#d4c48a",
        pathShadow: "#9a8848",
        water: "#5DADE2",
        waterLight: "#85C1E9",
        treeTrunk: "#7a5230",
        treeLeaves: ["#4CAF50", "#66BB6A", "#43A047", "#81C784"],
        rock: ["#9E9E9E", "#BDBDBD", "#8D8D8D"],
        houseWall: ["#FFCC80", "#FFE0B2", "#FFAB91", "#F8BBD0"],
        houseRoof: ["#7B1FA2", "#C62828", "#00838F", "#E65100"],
        flowerColors: ["#FF6B8A", "#F4D03F", "#E8A0BF", "#BB86FC", "#5DADE2", "#FF8A65", "#81C784"],
        crystalColors: ["#E040FB", "#7C4DFF", "#00E5FF", "#FF4081", "#FFAB40", "#69F0AE"],
        playerBody: "#7B1FA2",
        playerOutline: "#6A1B9A",
        playerSkin: "#FFCC80",
        npcColors: ["#E74C3C", "#E67E22", "#F1C40F", "#1ABC9C", "#9B59B6", "#E84393", "#00B894", "#FF6B8A", "#5DADE2", "#A8B820"],
    };

    // ============================================================
    // SVG PATH SYSTEM
    // ============================================================
    let svgPaths = [];          // Scaled to board: [{x, y, w, h, color}]
    let svgPathsRaw = [];       // Original SVG coords: [{x, y, w, h, color}]
    let svgViewBox = null;      // {w, h} of the SVG viewBox
    let svgLoaded = false;
    let lastSvgText = null;

    // Parse an SVG string and extract walkable rectangles
    function parseSvg(svgText) {
        lastSvgText = svgText;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const svgEl = doc.querySelector("svg");

        if (!svgEl) {
            console.error("Invalid SVG: no <svg> element found");
            return false;
        }

        // Get viewBox or width/height
        const vb = svgEl.getAttribute("viewBox");
        let vbW, vbH;
        if (vb) {
            const parts = vb.split(/[\s,]+/).map(Number);
            vbW = parts[2];
            vbH = parts[3];
        } else {
            vbW = parseFloat(svgEl.getAttribute("width")) || 900;
            vbH = parseFloat(svgEl.getAttribute("height")) || 600;
        }
        svgViewBox = { w: vbW, h: vbH };

        // Extract all <rect> elements
        const rects = doc.querySelectorAll("rect");
        svgPathsRaw = [];

        rects.forEach((rect) => {
            const x = parseFloat(rect.getAttribute("x")) || 0;
            const y = parseFloat(rect.getAttribute("y")) || 0;
            const w = parseFloat(rect.getAttribute("width")) || 0;
            const h = parseFloat(rect.getAttribute("height")) || 0;
            const fill = rect.getAttribute("fill") || COLORS.pathLight;

            if (w > 0 && h > 0) {
                svgPathsRaw.push({ x, y, w, h, color: fill });
            }
        });

        // Also extract <line> elements and convert to thin rects
        const lines = doc.querySelectorAll("line");
        lines.forEach((line) => {
            const x1 = parseFloat(line.getAttribute("x1")) || 0;
            const y1 = parseFloat(line.getAttribute("y1")) || 0;
            const x2 = parseFloat(line.getAttribute("x2")) || 0;
            const y2 = parseFloat(line.getAttribute("y2")) || 0;
            const strokeWidth = parseFloat(line.getAttribute("stroke-width")) || 20;
            const stroke = line.getAttribute("stroke") || COLORS.pathLight;
            const half = strokeWidth / 2;

            if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
                // Mostly horizontal
                const minX = Math.min(x1, x2);
                const maxX = Math.max(x1, x2);
                const midY = (y1 + y2) / 2;
                svgPathsRaw.push({
                    x: minX, y: midY - half,
                    w: maxX - minX, h: strokeWidth,
                    color: stroke,
                });
            } else {
                // Mostly vertical
                const minY = Math.min(y1, y2);
                const maxY = Math.max(y1, y2);
                const midX = (x1 + x2) / 2;
                svgPathsRaw.push({
                    x: midX - half, y: minY,
                    w: strokeWidth, h: maxY - minY,
                    color: stroke,
                });
            }
        });

        if (svgPathsRaw.length === 0) {
            console.warn("SVG has no <rect> or <line> elements");
            return false;
        }

        rescaleSvgPaths();
        svgLoaded = true;

        console.log(`SVG loaded: ${svgPathsRaw.length} path segments, viewBox ${vbW}x${vbH}`);
        return true;
    }

    // Scale raw SVG coords to current board size
    function rescaleSvgPaths() {
        if (!svgViewBox || svgPathsRaw.length === 0) return;
        const scaleX = boardW / svgViewBox.w;
        const scaleY = boardH / svgViewBox.h;

        svgPaths = svgPathsRaw.map((r) => ({
            x: r.x * scaleX,
            y: r.y * scaleY,
            w: r.w * scaleX,
            h: r.h * scaleY,
            color: r.color,
        }));
    }

    // Check if a point is on any SVG path rectangle
    function isOnPath(px, py) {
        if (!svgLoaded) return true;
        for (const p of svgPaths) {
            if (
                px >= p.x - PATH_POINT_MARGIN &&
                px <= p.x + p.w + PATH_POINT_MARGIN &&
                py >= p.y - PATH_POINT_MARGIN &&
                py <= p.y + p.h + PATH_POINT_MARGIN
            ) {
                return true;
            }
        }
        return false;
    }

    // Constrain movement: try full move, then slide along axes
    function constrainToPath(oldX, oldY, newX, newY) {
        if (!svgLoaded) return { x: newX, y: newY };

        if (isOnPath(newX, newY)) return { x: newX, y: newY };
        if (isOnPath(newX, oldY)) return { x: newX, y: oldY };
        if (isOnPath(oldX, newY)) return { x: oldX, y: newY };

        return { x: oldX, y: oldY };
    }

    // Find a random point on a random path
    function randomPointOnPath() {
        if (!svgLoaded || svgPaths.length === 0) {
            return { x: Math.random() * boardW, y: Math.random() * boardH };
        }
        const p = svgPaths[Math.floor(Math.random() * svgPaths.length)];
        return {
            x: p.x + Math.random() * p.w,
            y: p.y + Math.random() * p.h,
        };
    }

    // Find the nearest point on any path to a given position
    function nearestPointOnPath(px, py) {
        if (!svgLoaded || svgPaths.length === 0) return { x: px, y: py };

        let bestDist = Infinity;
        let bestX = px;
        let bestY = py;

        for (const p of svgPaths) {
            const cx = Math.max(p.x, Math.min(p.x + p.w, px));
            const cy = Math.max(p.y, Math.min(p.y + p.h, py));
            const dx = px - cx;
            const dy = py - cy;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
                bestDist = dist;
                bestX = cx;
                bestY = cy;
            }
        }

        return { x: bestX, y: bestY };
    }

    // SVG file handling
    function loadSvgFile(file) {
        if (!file || !file.name.toLowerCase().endsWith(".svg")) {
            console.warn("Please select an SVG file");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const success = parseSvg(e.target.result);
            if (success) {
                placePlayerOnPath();
                placeNpcsOnPaths();
                updateUploadUI(true, file.name);
            }
        };
        reader.readAsText(file);
    }

    function clearSvgMap() {
        svgPaths = [];
        svgPathsRaw = [];
        svgViewBox = null;
        svgLoaded = false;
        updateUploadUI(false);
        console.log("SVG map cleared");
    }

    function updateUploadUI(loaded, filename) {
        const btnLoad = document.getElementById("btn-load-svg");
        const btnClear = document.getElementById("btn-clear-svg");
        if (loaded) {
            btnLoad.classList.add("hidden");
            btnClear.classList.remove("hidden");
            btnClear.querySelector("span").textContent = filename || "Clear Map";
        } else {
            btnLoad.classList.remove("hidden");
            btnClear.classList.add("hidden");
        }
    }

    function placePlayerOnPath() {
        if (!svgLoaded) return;
        // Find path rect closest to board center
        const centerX = boardW / 2;
        const centerY = boardH / 2;
        const nearest = nearestPointOnPath(centerX, centerY);
        player.x = nearest.x;
        player.y = nearest.y;
    }

    function placeNpcsOnPaths() {
        if (!svgLoaded) return;
        for (const npc of npcs) {
            const pt = randomPointOnPath();
            npc.x = pt.x;
            npc.y = pt.y;
            pickNewTarget(npc);
        }
    }

    // Helper: get emotion world data for a board position
    function getWorldAt(px, py) {
        const zoneW = boardW / BOARD_SCALE;
        const zoneH = boardH / BOARD_SCALE;
        const col = Math.min(Math.floor(px / zoneW), BOARD_SCALE - 1);
        const row = Math.min(Math.floor(py / zoneH), BOARD_SCALE - 1);
        return EMOTION_WORLDS[Math.max(0, row)][Math.max(0, col)];
    }

    function getWorldByGrid(row, col) {
        return EMOTION_WORLDS[row][col];
    }

    // ---- World Generation ----
    let tiles = [];
    let trees = [];
    let rocks = [];
    let houses = [];
    let flowers = [];
    let crystals = [];
    let worldPaths = [];

    function generateWorld() {
        seed = 42;

        const cols = Math.ceil(boardW / TILE_SIZE) + 1;
        const rows = Math.ceil(boardH / TILE_SIZE) + 1;
        tiles = [];
        for (let r = 0; r < rows; r++) {
            tiles[r] = [];
            for (let c = 0; c < cols; c++) {
                const noise = seededRandom();
                tiles[r][c] = noise < 0.04 ? "water" : "grass";
            }
        }

        worldPaths = [];
        for (let i = 0; i < 5; i++) {
            const path = [];
            let px = seededRandom() * boardW;
            let py = seededRandom() * boardH;
            const angle = seededRandom() * Math.PI * 2;
            const steps = 40 + Math.floor(seededRandom() * 60);
            for (let s = 0; s < steps; s++) {
                path.push({ x: px, y: py });
                const drift = (seededRandom() - 0.5) * 0.8;
                px += Math.cos(angle + drift) * TILE_SIZE * 1.5;
                py += Math.sin(angle + drift) * TILE_SIZE * 1.5;
            }
            worldPaths.push(path);
        }

        trees = [];
        for (let i = 0; i < TREE_COUNT; i++) {
            trees.push({
                x: seededRandom() * boardW,
                y: seededRandom() * boardH,
                size: 12 + seededRandom() * 20,
                leafColor: COLORS.treeLeaves[Math.floor(seededRandom() * COLORS.treeLeaves.length)],
                sway: seededRandom() * Math.PI * 2,
            });
        }

        rocks = [];
        for (let i = 0; i < ROCK_COUNT; i++) {
            rocks.push({
                x: seededRandom() * boardW,
                y: seededRandom() * boardH,
                size: 6 + seededRandom() * 14,
                color: COLORS.rock[Math.floor(seededRandom() * COLORS.rock.length)],
                shape: seededRandom(),
            });
        }

        houses = [];
        for (let i = 0; i < HOUSE_COUNT; i++) {
            houses.push({
                x: seededRandom() * boardW,
                y: seededRandom() * boardH,
                w: 50 + seededRandom() * 40,
                h: 40 + seededRandom() * 30,
                wallColor: COLORS.houseWall[Math.floor(seededRandom() * COLORS.houseWall.length)],
                roofColor: COLORS.houseRoof[Math.floor(seededRandom() * COLORS.houseRoof.length)],
            });
        }

        flowers = [];
        for (let i = 0; i < FLOWER_COUNT; i++) {
            flowers.push({
                x: seededRandom() * boardW,
                y: seededRandom() * boardH,
                color: COLORS.flowerColors[Math.floor(seededRandom() * COLORS.flowerColors.length)],
                size: 2 + seededRandom() * 4,
                phase: seededRandom() * Math.PI * 2,
            });
        }

        // Generate emotion crystals (diamond shapes)
        crystals = [];
        for (let i = 0; i < CRYSTAL_COUNT; i++) {
            crystals.push({
                x: seededRandom() * boardW,
                y: seededRandom() * boardH,
                color: COLORS.crystalColors[Math.floor(seededRandom() * COLORS.crystalColors.length)],
                size: 6 + seededRandom() * 6,
                phase: seededRandom() * Math.PI * 2,
                sparkle: seededRandom() * Math.PI * 2,
            });
        }
    }

    // ---- Player ----
    const player = {
        x: 0,
        y: 0,
        size: 18,
        direction: 0,
        animFrame: 0,
        animTimer: 0,
        moving: false,
    };

    function initPlayer() {
        player.x = boardW / 2;
        player.y = boardH / 2;
    }

    // ---- NPCs ----
    let npcs = [];

    function createNPCs() {
        npcs = [];
        for (let i = 0; i < NPC_COUNT; i++) {
            const pt = randomPointOnPath();
            const npc = {
                x: pt.x,
                y: pt.y,
                size: 14 + Math.random() * 6,
                speed: NPC_MIN_SPEED + Math.random() * (NPC_MAX_SPEED - NPC_MIN_SPEED),
                color: COLORS.npcColors[Math.floor(Math.random() * COLORS.npcColors.length)],
                direction: Math.floor(Math.random() * 4),
                targetX: 0,
                targetY: 0,
                waitTimer: 0,
                animFrame: 0,
                animTimer: 0,
                state: "walking",
                stuckCounter: 0,
            };
            pickNewTarget(npc);
            npcs.push(npc);
        }
    }

    function pickNewTarget(npc) {
        if (svgLoaded) {
            // Pick a random point on a path
            const pt = randomPointOnPath();
            npc.targetX = pt.x;
            npc.targetY = pt.y;
        } else {
            const range = 200 + Math.random() * 400;
            const angle = Math.random() * Math.PI * 2;
            npc.targetX = Math.max(40, Math.min(boardW - 40, npc.x + Math.cos(angle) * range));
            npc.targetY = Math.max(40, Math.min(boardH - 40, npc.y + Math.sin(angle) * range));
        }
        npc.stuckCounter = 0;
    }

    // ---- Input Handling ----
    const keys = {};
    let clickTarget = null;

    window.addEventListener("keydown", (e) => {
        keys[e.key.toLowerCase()] = true;
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
        hideHint();
    });

    window.addEventListener("keyup", (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        clickTarget = {
            x: player.x + (mx - W / 2),
            y: player.y + (my - H / 2),
        };
        hideHint();
    });

    canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = touch.clientX - rect.left;
        const my = touch.clientY - rect.top;
        clickTarget = {
            x: player.x + (mx - W / 2),
            y: player.y + (my - H / 2),
        };
        hideHint();
    });

    let hintHidden = false;
    function hideHint() {
        if (!hintHidden) {
            hintHidden = true;
            document.getElementById("controls-hint").classList.add("hidden");
        }
    }

    // ---- SVG File Upload Events ----
    document.getElementById("btn-load-svg").addEventListener("click", () => {
        document.getElementById("svg-file-input").click();
    });

    document.getElementById("btn-clear-svg").addEventListener("click", () => {
        clearSvgMap();
    });

    document.getElementById("svg-file-input").addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            loadSvgFile(e.target.files[0]);
        }
        e.target.value = "";
    });

    // Drag and drop
    let dragCounter = 0;
    const dropOverlay = document.getElementById("drop-overlay");

    document.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) dropOverlay.classList.remove("hidden");
    });

    document.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) dropOverlay.classList.add("hidden");
    });

    document.addEventListener("dragover", (e) => {
        e.preventDefault();
    });

    document.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.classList.add("hidden");
        if (e.dataTransfer.files.length > 0) {
            loadSvgFile(e.dataTransfer.files[0]);
        }
    });

    // ---- Update Logic ----
    function updatePlayer(dt) {
        let dx = 0;
        let dy = 0;

        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;

        if (clickTarget) {
            const cdx = clickTarget.x - player.x;
            const cdy = clickTarget.y - player.y;
            const dist = Math.sqrt(cdx * cdx + cdy * cdy);
            if (dist > 5) {
                dx = cdx / dist;
                dy = cdy / dist;
            } else {
                clickTarget = null;
            }
        }

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            dx = (dx / len) * PLAYER_SPEED;
            dy = (dy / len) * PLAYER_SPEED;
            player.moving = true;

            if (Math.abs(dx) > Math.abs(dy)) {
                player.direction = dx > 0 ? 3 : 1;
            } else {
                player.direction = dy > 0 ? 0 : 2;
            }
        } else {
            player.moving = false;
        }

        // Compute desired new position
        let newX = Math.max(player.size, Math.min(boardW - player.size, player.x + dx));
        let newY = Math.max(player.size, Math.min(boardH - player.size, player.y + dy));

        // Constrain to SVG paths
        const constrained = constrainToPath(player.x, player.y, newX, newY);
        player.x = constrained.x;
        player.y = constrained.y;

        // If couldn't move at all, stop click target
        if (constrained.x === player.x && constrained.y === player.y && clickTarget) {
            // Actually check if we truly didn't move
            if (Math.abs(newX - constrained.x) > 0.1 || Math.abs(newY - constrained.y) > 0.1) {
                // Stuck on path - cancel click target
                clickTarget = null;
                player.moving = false;
            }
        }

        if (player.moving) {
            player.animTimer += dt;
            if (player.animTimer > 150) {
                player.animTimer = 0;
                player.animFrame = (player.animFrame + 1) % 4;
            }
        } else {
            player.animFrame = 0;
            player.animTimer = 0;
        }
    }

    function updateNPCs(dt) {
        for (const npc of npcs) {
            if (npc.state === "waiting") {
                npc.waitTimer -= dt;
                if (npc.waitTimer <= 0) {
                    npc.state = "walking";
                    pickNewTarget(npc);
                }
                npc.animFrame = 0;
                continue;
            }

            const tdx = npc.targetX - npc.x;
            const tdy = npc.targetY - npc.y;
            const dist = Math.sqrt(tdx * tdx + tdy * tdy);

            if (dist < 5) {
                npc.state = "waiting";
                npc.waitTimer = 1000 + Math.random() * 4000;
                continue;
            }

            const mx = (tdx / dist) * npc.speed;
            const my = (tdy / dist) * npc.speed;

            let newX = Math.max(20, Math.min(boardW - 20, npc.x + mx));
            let newY = Math.max(20, Math.min(boardH - 20, npc.y + my));

            // Constrain NPC to paths
            const constrained = constrainToPath(npc.x, npc.y, newX, newY);
            npc.x = constrained.x;
            npc.y = constrained.y;

            // Detect if NPC is stuck
            if (Math.abs(constrained.x - npc.x) < 0.01 && Math.abs(constrained.y - npc.y) < 0.01 && svgLoaded) {
                npc.stuckCounter++;
                if (npc.stuckCounter > 60) {
                    pickNewTarget(npc);
                }
            } else {
                npc.stuckCounter = 0;
            }

            if (Math.abs(mx) > Math.abs(my)) {
                npc.direction = mx > 0 ? 3 : 1;
            } else {
                npc.direction = my > 0 ? 0 : 2;
            }

            npc.animTimer += dt;
            if (npc.animTimer > 200) {
                npc.animTimer = 0;
                npc.animFrame = (npc.animFrame + 1) % 4;
            }
        }
    }

    // ---- Drawing ----
    function getCameraOffset() {
        const camX = player.x - W / 2;
        const camY = player.y - H / 2;
        return {
            x: Math.max(0, Math.min(boardW - W, camX)),
            y: Math.max(0, Math.min(boardH - H, camY)),
        };
    }

    function drawGround(cam) {
        const startCol = Math.floor(cam.x / TILE_SIZE);
        const startRow = Math.floor(cam.y / TILE_SIZE);
        const endCol = Math.ceil((cam.x + W) / TILE_SIZE);
        const endRow = Math.ceil((cam.y + H) / TILE_SIZE);
        const zoneW = boardW / BOARD_SCALE;
        const zoneH = boardH / BOARD_SCALE;

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const sx = c * TILE_SIZE - cam.x;
                const sy = r * TILE_SIZE - cam.y;

                const tileType = tiles[r] && tiles[r][c] ? tiles[r][c] : "grass";

                if (tileType === "water") {
                    const shimmer = Math.sin(Date.now() * 0.002 + c * 0.5 + r * 0.3) * 0.15;
                    ctx.fillStyle = shimmer > 0 ? COLORS.water : COLORS.waterLight;
                    ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1);

                    ctx.strokeStyle = "rgba(255,255,255,0.2)";
                    ctx.lineWidth = 1;
                    const rippleOffset = Math.sin(Date.now() * 0.003 + c + r) * 5;
                    ctx.beginPath();
                    ctx.moveTo(sx + 5, sy + TILE_SIZE / 2 + rippleOffset);
                    ctx.quadraticCurveTo(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + rippleOffset - 4, sx + TILE_SIZE - 5, sy + TILE_SIZE / 2 + rippleOffset);
                    ctx.stroke();
                } else {
                    // Zone-tinted grass
                    const worldX = c * TILE_SIZE;
                    const worldY = r * TILE_SIZE;
                    const zCol = Math.min(Math.floor(worldX / zoneW), BOARD_SCALE - 1);
                    const zRow = Math.min(Math.floor(worldY / zoneH), BOARD_SCALE - 1);
                    const world = EMOTION_WORLDS[Math.max(0, zRow)]?.[Math.max(0, zCol)];
                    const grassPair = world ? world.grass : [COLORS.grassLight, COLORS.grassDark];
                    ctx.fillStyle = (c + r) % 2 === 0 ? grassPair[0] : grassPair[1];
                    ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1);
                }
            }
        }
    }

    function drawWorldPaths(cam) {
        if (svgLoaded) return; // Don't draw random paths when SVG is loaded

        for (const path of worldPaths) {
            ctx.strokeStyle = COLORS.pathLight;
            ctx.lineWidth = 20;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            let started = false;
            for (const pt of path) {
                const sx = pt.x - cam.x;
                const sy = pt.y - cam.y;
                if (sx > -100 && sx < W + 100 && sy > -100 && sy < H + 100) {
                    if (!started) {
                        ctx.moveTo(sx, sy);
                        started = true;
                    } else {
                        ctx.lineTo(sx, sy);
                    }
                }
            }
            ctx.stroke();

            ctx.strokeStyle = COLORS.pathDark;
            ctx.lineWidth = 14;
            ctx.beginPath();
            started = false;
            for (const pt of path) {
                const sx = pt.x - cam.x;
                const sy = pt.y - cam.y;
                if (sx > -100 && sx < W + 100 && sy > -100 && sy < H + 100) {
                    if (!started) {
                        ctx.moveTo(sx, sy);
                        started = true;
                    } else {
                        ctx.lineTo(sx, sy);
                    }
                }
            }
            ctx.stroke();
        }
    }

    // Draw SVG-defined paths on the board
    function drawSvgPaths(cam) {
        if (!svgLoaded) return;

        for (const p of svgPaths) {
            const sx = p.x - cam.x;
            const sy = p.y - cam.y;

            // Cull off-screen paths
            if (sx + p.w < -10 || sx > W + 10 || sy + p.h < -10 || sy > H + 10) continue;

            // Outer border (darker)
            ctx.fillStyle = COLORS.pathShadow;
            ctx.fillRect(sx - 2, sy - 2, p.w + 4, p.h + 4);

            // Main path fill
            ctx.fillStyle = p.color || COLORS.pathLight;
            ctx.fillRect(sx, sy, p.w, p.h);

            // Inner highlight (top-left edge)
            ctx.fillStyle = COLORS.pathHighlight;
            ctx.fillRect(sx, sy, p.w, 2);
            ctx.fillRect(sx, sy, 2, p.h);

            // Texture: small pebble dots
            ctx.fillStyle = "rgba(0,0,0,0.06)";
            const dotSpacing = 18;
            for (let dy = 6; dy < p.h - 4; dy += dotSpacing) {
                for (let dx = 6; dx < p.w - 4; dx += dotSpacing) {
                    const offsetX = ((dx * 7 + dy * 13) % 11) - 5;
                    const offsetY = ((dx * 3 + dy * 17) % 9) - 4;
                    ctx.beginPath();
                    ctx.arc(sx + dx + offsetX, sy + dy + offsetY, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    function drawFlowers(cam) {
        const time = Date.now() * 0.001;
        for (const f of flowers) {
            const sx = f.x - cam.x;
            const sy = f.y - cam.y;
            if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

            const sway = Math.sin(time * 2 + f.phase) * 1.5;

            // Petals (4 small circles around center)
            ctx.fillStyle = f.color;
            const ps = f.size * 0.7;
            for (let a = 0; a < 4; a++) {
                const angle = (a / 4) * Math.PI * 2 + time * 0.5 + f.phase;
                ctx.beginPath();
                ctx.arc(sx + sway + Math.cos(angle) * ps, sy + Math.sin(angle) * ps, f.size * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Center
            ctx.fillStyle = "#FFF9C4";
            ctx.beginPath();
            ctx.arc(sx + sway, sy, f.size * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw emotion crystals (diamond shapes)
    function drawCrystals(cam) {
        const time = Date.now() * 0.001;
        for (const cr of crystals) {
            const sx = cr.x - cam.x;
            const sy = cr.y - cam.y;
            if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

            const hover = Math.sin(time * 2.5 + cr.phase) * 3;
            const glow = 0.4 + Math.sin(time * 3 + cr.sparkle) * 0.2;
            const s = cr.size;

            // Glow
            ctx.fillStyle = cr.color + Math.floor(glow * 40).toString(16).padStart(2, "0");
            ctx.beginPath();
            ctx.arc(sx, sy + hover, s * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Diamond shape
            ctx.fillStyle = cr.color;
            ctx.beginPath();
            ctx.moveTo(sx, sy - s + hover);
            ctx.lineTo(sx + s * 0.6, sy + hover);
            ctx.lineTo(sx, sy + s * 0.5 + hover);
            ctx.lineTo(sx - s * 0.6, sy + hover);
            ctx.closePath();
            ctx.fill();

            // Highlight facet
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.beginPath();
            ctx.moveTo(sx, sy - s + hover);
            ctx.lineTo(sx + s * 0.3, sy - s * 0.2 + hover);
            ctx.lineTo(sx, sy + hover);
            ctx.lineTo(sx - s * 0.15, sy - s * 0.3 + hover);
            ctx.closePath();
            ctx.fill();

            // Sparkle
            const sparkleAlpha = Math.max(0, Math.sin(time * 5 + cr.sparkle));
            if (sparkleAlpha > 0.5) {
                ctx.fillStyle = `rgba(255,255,255,${sparkleAlpha * 0.8})`;
                ctx.beginPath();
                ctx.arc(sx + s * 0.2, sy - s * 0.5 + hover, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawRocks(cam) {
        for (const rock of rocks) {
            const sx = rock.x - cam.x;
            const sy = rock.y - cam.y;
            if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;

            ctx.fillStyle = rock.color;
            ctx.beginPath();
            ctx.ellipse(sx, sy, rock.size, rock.size * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.beginPath();
            ctx.ellipse(sx - rock.size * 0.2, sy - rock.size * 0.2, rock.size * 0.4, rock.size * 0.3, -0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(0,0,0,0.15)";
            ctx.beginPath();
            ctx.ellipse(sx + 2, sy + rock.size * 0.5, rock.size * 0.8, rock.size * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawHouses(cam) {
        for (const h of houses) {
            const sx = h.x - cam.x;
            const sy = h.y - cam.y;
            if (sx < -100 || sx > W + 100 || sy < -100 || sy > H + 100) continue;

            ctx.fillStyle = "rgba(0,0,0,0.15)";
            ctx.fillRect(sx - h.w / 2 + 5, sy - h.h + 5, h.w, h.h);

            ctx.fillStyle = h.wallColor;
            ctx.fillRect(sx - h.w / 2, sy - h.h, h.w, h.h);

            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - h.w / 2, sy - h.h, h.w, h.h);

            ctx.fillStyle = "#5a3a1a";
            const doorW = h.w * 0.2;
            const doorH = h.h * 0.5;
            ctx.fillRect(sx - doorW / 2, sy - doorH, doorW, doorH);

            ctx.fillStyle = "#87CEEB";
            const winSize = h.w * 0.15;
            ctx.fillRect(sx - h.w / 2 + 8, sy - h.h + 8, winSize, winSize);
            ctx.fillRect(sx + h.w / 2 - 8 - winSize, sy - h.h + 8, winSize, winSize);

            ctx.strokeStyle = "#5a3a1a";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - h.w / 2 + 8 + winSize / 2, sy - h.h + 8);
            ctx.lineTo(sx - h.w / 2 + 8 + winSize / 2, sy - h.h + 8 + winSize);
            ctx.moveTo(sx - h.w / 2 + 8, sy - h.h + 8 + winSize / 2);
            ctx.lineTo(sx - h.w / 2 + 8 + winSize, sy - h.h + 8 + winSize / 2);
            ctx.stroke();

            ctx.fillStyle = h.roofColor;
            ctx.beginPath();
            ctx.moveTo(sx - h.w / 2 - 8, sy - h.h);
            ctx.lineTo(sx, sy - h.h - h.h * 0.6);
            ctx.lineTo(sx + h.w / 2 + 8, sy - h.h);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawCharacter(sx, sy, size, color, direction, animFrame, isPlayer) {
        const bobY = animFrame % 2 === 1 ? -2.5 : 0;
        const squish = animFrame % 2 === 1 ? 1.04 : 1.0;

        // Shadow (soft ellipse)
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(sx, sy + size * 0.85, size * 0.7, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Chubby round body (Filly/Dilly inspired)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(sx, sy - size * 0.1 + bobY, size * 0.65 * squish, size * 0.75 / squish, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body shine
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.ellipse(sx - size * 0.15, sy - size * 0.35 + bobY, size * 0.25, size * 0.35, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Body outline
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy - size * 0.1 + bobY, size * 0.65 * squish, size * 0.75 / squish, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Big round head
        const headR = size * 0.52;
        const headY = sy - size * 0.85 + bobY;
        const skinColor = isPlayer ? COLORS.playerSkin : "#FFE0B2";
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(sx, headY, headR, 0, Math.PI * 2);
        ctx.fill();

        // Head outline
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, headY, headR, 0, Math.PI * 2);
        ctx.stroke();

        // Rosy cheeks
        ctx.fillStyle = "rgba(255,150,150,0.25)";
        ctx.beginPath();
        ctx.arc(sx - headR * 0.55, headY + headR * 0.2, headR * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx + headR * 0.55, headY + headR * 0.2, headR * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (big, round, cute)
        const eyeSpread = headR * 0.32;
        const eyeY = headY - headR * 0.05;
        const eyeR = headR * 0.18;
        if (direction !== 2) {
            const eyeShiftX = direction === 1 ? -2 : direction === 3 ? 2 : 0;

            // Eye whites
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(sx - eyeSpread + eyeShiftX, eyeY, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sx + eyeSpread + eyeShiftX, eyeY, eyeR, 0, Math.PI * 2);
            ctx.fill();

            // Pupils
            ctx.fillStyle = "#333";
            const pupilShift = direction === 1 ? -1.5 : direction === 3 ? 1.5 : 0;
            ctx.beginPath();
            ctx.arc(sx - eyeSpread + eyeShiftX + pupilShift, eyeY + 0.5, eyeR * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sx + eyeSpread + eyeShiftX + pupilShift, eyeY + 0.5, eyeR * 0.55, 0, Math.PI * 2);
            ctx.fill();

            // Eye highlight
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(sx - eyeSpread + eyeShiftX + pupilShift + 1, eyeY - 1, eyeR * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sx + eyeSpread + eyeShiftX + pupilShift + 1, eyeY - 1, eyeR * 0.2, 0, Math.PI * 2);
            ctx.fill();

            // Cute smile (only when facing front)
            if (direction === 0) {
                ctx.strokeStyle = "#8B6914";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(sx, headY + headR * 0.2, headR * 0.2, 0.1, Math.PI - 0.1);
                ctx.stroke();
            }
        } else {
            // Back of head - small hair detail
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(sx, headY - headR * 0.3, headR * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Player indicator (floating crystal above head)
        if (isPlayer) {
            const floatY = sy - size * 1.7 + bobY + Math.sin(Date.now() * 0.004) * 4;
            const cSize = 7;

            // Crystal glow
            ctx.fillStyle = "rgba(244,208,63,0.3)";
            ctx.beginPath();
            ctx.arc(sx, floatY, cSize * 2, 0, Math.PI * 2);
            ctx.fill();

            // Crystal diamond
            ctx.fillStyle = "#F4D03F";
            ctx.beginPath();
            ctx.moveTo(sx, floatY - cSize);
            ctx.lineTo(sx + cSize * 0.5, floatY);
            ctx.lineTo(sx, floatY + cSize * 0.4);
            ctx.lineTo(sx - cSize * 0.5, floatY);
            ctx.closePath();
            ctx.fill();

            // Crystal highlight
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.beginPath();
            ctx.moveTo(sx, floatY - cSize);
            ctx.lineTo(sx + cSize * 0.25, floatY - cSize * 0.2);
            ctx.lineTo(sx, floatY);
            ctx.lineTo(sx - cSize * 0.1, floatY - cSize * 0.4);
            ctx.closePath();
            ctx.fill();
        }

        // Little feet (walking animation)
        if (animFrame % 2 === 1) {
            ctx.fillStyle = color;
            const legSpread = animFrame === 1 ? 5 : -5;
            ctx.beginPath();
            ctx.ellipse(sx - 4 + legSpread, sy + size * 0.65, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(sx + 4 - legSpread, sy + size * 0.65, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(sx - 4, sy + size * 0.7, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(sx + 4, sy + size * 0.7, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawPlayer(cam) {
        const sx = player.x - cam.x;
        const sy = player.y - cam.y;
        drawCharacter(sx, sy, player.size, COLORS.playerBody, player.direction, player.animFrame, true);
    }

    function drawBoardGrid(cam) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        for (let i = 1; i < BOARD_SCALE; i++) {
            const x = (boardW / BOARD_SCALE) * i - cam.x;
            if (x > 0 && x < W) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, H);
                ctx.stroke();
            }
        }

        for (let i = 1; i < BOARD_SCALE; i++) {
            const y = (boardH / BOARD_SCALE) * i - cam.y;
            if (y > 0 && y < H) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(W, y);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
    }

    function drawZoneLabels(cam) {
        const zoneW = boardW / BOARD_SCALE;
        const zoneH = boardH / BOARD_SCALE;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let r = 0; r < BOARD_SCALE; r++) {
            for (let c = 0; c < BOARD_SCALE; c++) {
                const cx = zoneW * c + zoneW / 2 - cam.x;
                const cy = zoneH * r + zoneH / 2 - cam.y;

                if (cx > -300 && cx < W + 300 && cy > -200 && cy < H + 200) {
                    const world = EMOTION_WORLDS[r][c];

                    // Emoji above
                    ctx.font = "40px sans-serif";
                    ctx.fillStyle = world.label;
                    ctx.fillText(world.emoji, cx, cy - 20);

                    // World name
                    ctx.font = "bold 26px 'Nunito', 'Segoe UI', sans-serif";
                    ctx.fillStyle = world.label;
                    ctx.fillText(world.name, cx, cy + 20);
                }
            }
        }
    }

    function drawBoardBorder(cam) {
        ctx.strokeStyle = "rgba(123,31,162,0.3)";
        ctx.lineWidth = 4;
        ctx.strokeRect(-cam.x, -cam.y, boardW, boardH);
    }

    // ---- Minimap ----
    function drawMinimap(cam) {
        if (!minimapCtx) return;
        const mW = 140;
        const mH = 140;

        minimapCtx.clearRect(0, 0, mW, mH);

        const scX = mW / boardW;
        const scY = mH / boardH;
        const zoneW = mW / BOARD_SCALE;
        const zoneH = mH / BOARD_SCALE;

        // Colored zone backgrounds on minimap
        for (let r = 0; r < BOARD_SCALE; r++) {
            for (let c = 0; c < BOARD_SCALE; c++) {
                const world = EMOTION_WORLDS[r][c];
                minimapCtx.fillStyle = world.grass[0];
                minimapCtx.fillRect(zoneW * c, zoneH * r, zoneW + 1, zoneH + 1);
            }
        }

        // Water tiles
        minimapCtx.fillStyle = COLORS.water;
        const tileScaleX = scX;
        const tileScaleY = scY;
        for (let r = 0; r < tiles.length; r++) {
            for (let c = 0; tiles[r] && c < tiles[r].length; c++) {
                if (tiles[r][c] === "water") {
                    minimapCtx.fillRect(
                        c * TILE_SIZE * tileScaleX,
                        r * TILE_SIZE * tileScaleY,
                        Math.max(2, TILE_SIZE * tileScaleX),
                        Math.max(2, TILE_SIZE * tileScaleY)
                    );
                }
            }
        }

        // SVG paths on minimap
        if (svgLoaded) {
            for (const p of svgPaths) {
                minimapCtx.fillStyle = "rgba(196, 169, 106, 0.7)";
                minimapCtx.fillRect(
                    p.x * scX,
                    p.y * scY,
                    Math.max(1, p.w * scX),
                    Math.max(1, p.h * scY)
                );
            }
        }

        // Houses
        minimapCtx.fillStyle = "#d4a574";
        for (const h of houses) {
            minimapCtx.fillRect(h.x * scX - 1, h.y * scY - 1, 3, 3);
        }

        // Viewport indicator
        const vpX = cam.x * scX;
        const vpY = cam.y * scY;
        const vpW = W * scX;
        const vpH = H * scY;
        minimapCtx.strokeStyle = "rgba(255,255,255,0.6)";
        minimapCtx.lineWidth = 1.5;
        minimapCtx.strokeRect(vpX, vpY, vpW, vpH);

        // Player dot
        const px = player.x * scX;
        const py = player.y * scY;
        minimapCtx.fillStyle = "#ffcc00";
        minimapCtx.beginPath();
        minimapCtx.arc(px, py, 3, 0, Math.PI * 2);
        minimapCtx.fill();

        // NPC dots
        minimapCtx.fillStyle = "rgba(255,100,100,0.6)";
        for (const npc of npcs) {
            const nx = npc.x * scX;
            const ny = npc.y * scY;
            minimapCtx.beginPath();
            minimapCtx.arc(nx, ny, 1.5, 0, Math.PI * 2);
            minimapCtx.fill();
        }

        // Grid
        minimapCtx.strokeStyle = "rgba(255,255,255,0.15)";
        minimapCtx.lineWidth = 0.5;
        for (let i = 1; i < BOARD_SCALE; i++) {
            minimapCtx.beginPath();
            minimapCtx.moveTo((mW / BOARD_SCALE) * i, 0);
            minimapCtx.lineTo((mW / BOARD_SCALE) * i, mH);
            minimapCtx.stroke();
            minimapCtx.beginPath();
            minimapCtx.moveTo(0, (mH / BOARD_SCALE) * i);
            minimapCtx.lineTo(mW, (mH / BOARD_SCALE) * i);
            minimapCtx.stroke();
        }
    }

    // ---- HUD ----
    function drawCoords(cam) {
        const world = getWorldAt(player.x, player.y);
        const worldName = world ? world.name : "Unknown";
        const worldEmoji = world ? world.emoji : "";
        const worldAccent = world ? world.accent : "#fff";

        const boxH = svgLoaded ? 82 : 66;
        const boxW = 260;

        // HUD background with rounded feel
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.roundRect(12, 12, boxW, boxH, 10);
        ctx.fill();

        // Accent bar on left
        ctx.fillStyle = worldAccent;
        ctx.beginPath();
        ctx.roundRect(12, 12, 4, boxH, [10, 0, 0, 10]);
        ctx.fill();

        // Title
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px 'Nunito', 'Segoe UI', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("Hey Feelings", 24, 16);

        // World name with emoji
        ctx.fillStyle = worldAccent;
        ctx.font = "bold 14px 'Nunito', 'Segoe UI', sans-serif";
        ctx.fillText(`${worldEmoji} ${worldName}`, 24, 34);

        // Position
        ctx.font = "11px 'Segoe UI', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(`(${Math.round(player.x)}, ${Math.round(player.y)})`, 24, 54);

        if (svgLoaded) {
            ctx.fillStyle = "rgba(196, 169, 106, 0.7)";
            ctx.fillText(`Map: ${svgPaths.length} paths`, 140, 54);
        }
    }

    // ---- Render Callbacks (used by co-browsing layer) ----
    const renderCallbacks = [];

    // ---- Main Render ----
    function render() {
        const cam = getCameraOffset();

        ctx.clearRect(0, 0, W, H);

        drawGround(cam);
        drawWorldPaths(cam);
        drawSvgPaths(cam);
        drawFlowers(cam);
        drawCrystals(cam);
        drawRocks(cam);
        drawHouses(cam);
        drawBoardGrid(cam);
        drawZoneLabels(cam);

        // Collect all drawable entities and sort by Y for depth
        const entities = [];
        entities.push({ type: "player", y: player.y });
        for (const npc of npcs) {
            const sx = npc.x - cam.x;
            const sy = npc.y - cam.y;
            if (sx > -40 && sx < W + 40 && sy > -60 && sy < H + 40) {
                entities.push({ type: "npc", ref: npc, y: npc.y });
            }
        }
        for (const tree of trees) {
            const sx = tree.x - cam.x;
            const sy = tree.y - cam.y;
            if (sx > -50 && sx < W + 50 && sy > -70 && sy < H + 30) {
                entities.push({ type: "tree", ref: tree, y: tree.y });
            }
        }

        entities.sort((a, b) => a.y - b.y);

        for (const ent of entities) {
            if (ent.type === "player") {
                drawPlayer(cam);
            } else if (ent.type === "npc") {
                const npc = ent.ref;
                const sx = npc.x - cam.x;
                const sy = npc.y - cam.y;
                drawCharacter(sx, sy, npc.size, npc.color, npc.direction, npc.animFrame, false);
            } else if (ent.type === "tree") {
                const tree = ent.ref;
                const sx = tree.x - cam.x;
                const sy = tree.y - cam.y;
                const time = Date.now() * 0.001;
                const sway = Math.sin(time + tree.sway) * 2;

                ctx.fillStyle = "rgba(0,0,0,0.12)";
                ctx.beginPath();
                ctx.ellipse(sx + 3, sy + 3, tree.size * 0.6, tree.size * 0.25, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = COLORS.treeTrunk;
                ctx.fillRect(sx - 3, sy - tree.size * 1.2, 6, tree.size * 1.2);

                ctx.fillStyle = tree.leafColor;
                ctx.beginPath();
                ctx.arc(sx + sway, sy - tree.size * 1.3, tree.size * 0.7, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(sx - tree.size * 0.3 + sway, sy - tree.size * 1.1, tree.size * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(sx + tree.size * 0.3 + sway, sy - tree.size * 1.1, tree.size * 0.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "rgba(255,255,255,0.1)";
                ctx.beginPath();
                ctx.arc(sx + sway - 3, sy - tree.size * 1.4, tree.size * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Co-browsing layer: remote cursors, pawns, etc.
        for (const cb of renderCallbacks) {
            cb(ctx, cam);
        }

        drawBoardBorder(cam);
        drawCoords(cam);
        drawMinimap(cam);
    }

    // ---- Game Loop ----
    let lastTime = 0;

    function gameLoop(timestamp) {
        const dt = timestamp - lastTime;
        lastTime = timestamp;

        updatePlayer(dt);
        updateNPCs(dt);
        render();

        requestAnimationFrame(gameLoop);
    }

    // ---- Init ----
    function init() {
        resize();
        generateWorld();
        initPlayer();
        createNPCs();
        window.addEventListener("resize", () => {
            resize();
            generateWorld();
        });
        requestAnimationFrame(gameLoop);
        console.log(`%cHey Feelings%c - Worlds of Emotions`, "color:#7B1FA2;font-weight:bold;font-size:16px", "color:#F4D03F;font-size:14px");
        console.log(`Board: ${boardW}x${boardH} | Player: (${player.x}, ${player.y})`);
    }

    // ---- Public API for co-browsing integration ----
    window.HFGame = {
        init,
        player,
        getCamera: getCameraOffset,
        getBoardSize: () => ({ w: boardW, h: boardH }),
        getViewport: () => ({ w: W, h: H }),
        drawCharacter,
        addRenderCallback: (fn) => renderCallbacks.push(fn),
        canvas,
        ctx,
        COLORS,
        EMOTION_WORLDS,
        getWorldAt,
        parseSvgText: parseSvg,
        getLastSvgText: () => lastSvgText,
        constrainToPath,
    };
})();
