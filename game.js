// ============================================================
// HF Board Game - Main Game Engine
// ============================================================

(function () {
    "use strict";

    // ---- Constants ----
    const BOARD_SCALE = 3; // Board is 3x3 viewports
    const PLAYER_SPEED = 3.5;
    const NPC_COUNT = 25;
    const NPC_MIN_SPEED = 0.4;
    const NPC_MAX_SPEED = 1.4;
    const TILE_SIZE = 64;
    const TREE_COUNT = 80;
    const ROCK_COUNT = 40;
    const HOUSE_COUNT = 12;
    const FLOWER_COUNT = 120;

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
        minimapCanvas.width = 120;
        minimapCanvas.height = 120;
        minimapCanvas.style.width = "100%";
        minimapCanvas.style.height = "100%";
        minimapCanvas.style.borderRadius = "6px";
        minimapCtx = minimapCanvas.getContext("2d");
    }

    // ---- Seeded Random for Consistent World ----
    let seed = 42;
    function seededRandom() {
        seed = (seed * 16807 + 0) % 2147483647;
        return (seed - 1) / 2147483646;
    }

    function randomRange(min, max, rng = Math.random) {
        return min + rng() * (max - min);
    }

    // ---- Color Palette ----
    const COLORS = {
        grassLight: "#4a7c3f",
        grassDark: "#3d6b34",
        pathLight: "#c4a96a",
        pathDark: "#b09858",
        water: "#3a7bd5",
        waterLight: "#5a9bf5",
        treeTrunk: "#6b4226",
        treeLeaves: ["#2d7a2d", "#35912e", "#28732a", "#3da83a"],
        rock: ["#8a8a8a", "#7a7a7a", "#9a9a9a"],
        houseWall: ["#d4a574", "#c9956a", "#deb887", "#e8c9a0"],
        houseRoof: ["#8b3a3a", "#6b2a2a", "#9b4a4a", "#7a3535"],
        flowerColors: ["#ff6b8a", "#ffaa00", "#ff55aa", "#aa88ff", "#55ccff", "#ff4444", "#ffdd44"],
        playerBody: "#3498db",
        playerOutline: "#2980b9",
        npcColors: ["#e74c3c", "#e67e22", "#f1c40f", "#1abc9c", "#9b59b6", "#e84393", "#00b894", "#fd79a8"],
    };

    // ---- World Generation ----
    let tiles = [];
    let trees = [];
    let rocks = [];
    let houses = [];
    let flowers = [];
    let paths = [];

    function generateWorld() {
        seed = 42;

        const cols = Math.ceil(boardW / TILE_SIZE) + 1;
        const rows = Math.ceil(boardH / TILE_SIZE) + 1;
        tiles = [];
        for (let r = 0; r < rows; r++) {
            tiles[r] = [];
            for (let c = 0; c < cols; c++) {
                const noise = seededRandom();
                tiles[r][c] = noise < 0.06 ? "water" : "grass";
            }
        }

        // Generate winding paths
        paths = [];
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
            paths.push(path);
        }

        // Generate trees
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

        // Generate rocks
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

        // Generate houses
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

        // Generate flowers
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
    }

    // ---- Player ----
    const player = {
        x: 0,
        y: 0,
        size: 18,
        direction: 0, // 0=down, 1=left, 2=up, 3=right
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
            const npc = {
                x: Math.random() * boardW,
                y: Math.random() * boardH,
                size: 14 + Math.random() * 6,
                speed: NPC_MIN_SPEED + Math.random() * (NPC_MAX_SPEED - NPC_MIN_SPEED),
                color: COLORS.npcColors[Math.floor(Math.random() * COLORS.npcColors.length)],
                direction: Math.floor(Math.random() * 4),
                targetX: 0,
                targetY: 0,
                waitTimer: 0,
                animFrame: 0,
                animTimer: 0,
                state: "walking", // walking, waiting
                name: `NPC-${i + 1}`,
            };
            pickNewTarget(npc);
            npcs.push(npc);
        }
    }

    function pickNewTarget(npc) {
        const range = 200 + Math.random() * 400;
        const angle = Math.random() * Math.PI * 2;
        npc.targetX = Math.max(40, Math.min(boardW - 40, npc.x + Math.cos(angle) * range));
        npc.targetY = Math.max(40, Math.min(boardH - 40, npc.y + Math.sin(angle) * range));
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

    // ---- Update Logic ----
    function updatePlayer(dt) {
        let dx = 0;
        let dy = 0;

        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;

        // Click-to-move
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

        // Normalize diagonal movement
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            dx = (dx / len) * PLAYER_SPEED;
            dy = (dy / len) * PLAYER_SPEED;
            player.moving = true;

            // Determine direction for animation
            if (Math.abs(dx) > Math.abs(dy)) {
                player.direction = dx > 0 ? 3 : 1;
            } else {
                player.direction = dy > 0 ? 0 : 2;
            }
        } else {
            player.moving = false;
        }

        player.x = Math.max(player.size, Math.min(boardW - player.size, player.x + dx));
        player.y = Math.max(player.size, Math.min(boardH - player.size, player.y + dy));

        // Animation
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

            const dx = npc.targetX - npc.x;
            const dy = npc.targetY - npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                npc.state = "waiting";
                npc.waitTimer = 1000 + Math.random() * 4000;
                continue;
            }

            const mx = (dx / dist) * npc.speed;
            const my = (dy / dist) * npc.speed;

            npc.x += mx;
            npc.y += my;

            // Clamp to board
            npc.x = Math.max(20, Math.min(boardW - 20, npc.x));
            npc.y = Math.max(20, Math.min(boardH - 20, npc.y));

            // Direction
            if (Math.abs(mx) > Math.abs(my)) {
                npc.direction = mx > 0 ? 3 : 1;
            } else {
                npc.direction = my > 0 ? 0 : 2;
            }

            // Animation
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

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const sx = c * TILE_SIZE - cam.x;
                const sy = r * TILE_SIZE - cam.y;

                const tileType = tiles[r] && tiles[r][c] ? tiles[r][c] : "grass";

                if (tileType === "water") {
                    const shimmer = Math.sin(Date.now() * 0.002 + c * 0.5 + r * 0.3) * 0.15;
                    ctx.fillStyle = shimmer > 0 ? COLORS.water : COLORS.waterLight;
                    ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1);

                    // Water ripple detail
                    ctx.strokeStyle = "rgba(255,255,255,0.15)";
                    ctx.lineWidth = 1;
                    const rippleOffset = Math.sin(Date.now() * 0.003 + c + r) * 5;
                    ctx.beginPath();
                    ctx.moveTo(sx + 5, sy + TILE_SIZE / 2 + rippleOffset);
                    ctx.quadraticCurveTo(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + rippleOffset - 4, sx + TILE_SIZE - 5, sy + TILE_SIZE / 2 + rippleOffset);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = (c + r) % 2 === 0 ? COLORS.grassLight : COLORS.grassDark;
                    ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1);
                }
            }
        }
    }

    function drawPaths(cam) {
        for (const path of paths) {
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

            // Inner path
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

    function drawFlowers(cam) {
        const time = Date.now() * 0.001;
        for (const f of flowers) {
            const sx = f.x - cam.x;
            const sy = f.y - cam.y;
            if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

            const sway = Math.sin(time * 2 + f.phase) * 1.5;

            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(sx + sway, sy, f.size, 0, Math.PI * 2);
            ctx.fill();

            // Center
            ctx.fillStyle = "#fff5";
            ctx.beginPath();
            ctx.arc(sx + sway, sy, f.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
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

            // Highlight
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.beginPath();
            ctx.ellipse(sx - rock.size * 0.2, sy - rock.size * 0.2, rock.size * 0.4, rock.size * 0.3, -0.3, 0, Math.PI * 2);
            ctx.fill();

            // Shadow
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

            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.15)";
            ctx.fillRect(sx - h.w / 2 + 5, sy - h.h + 5, h.w, h.h);

            // Wall
            ctx.fillStyle = h.wallColor;
            ctx.fillRect(sx - h.w / 2, sy - h.h, h.w, h.h);

            // Wall outline
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - h.w / 2, sy - h.h, h.w, h.h);

            // Door
            ctx.fillStyle = "#5a3a1a";
            const doorW = h.w * 0.2;
            const doorH = h.h * 0.5;
            ctx.fillRect(sx - doorW / 2, sy - doorH, doorW, doorH);

            // Window
            ctx.fillStyle = "#87CEEB";
            const winSize = h.w * 0.15;
            ctx.fillRect(sx - h.w / 2 + 8, sy - h.h + 8, winSize, winSize);
            ctx.fillRect(sx + h.w / 2 - 8 - winSize, sy - h.h + 8, winSize, winSize);

            // Window cross
            ctx.strokeStyle = "#5a3a1a";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - h.w / 2 + 8 + winSize / 2, sy - h.h + 8);
            ctx.lineTo(sx - h.w / 2 + 8 + winSize / 2, sy - h.h + 8 + winSize);
            ctx.moveTo(sx - h.w / 2 + 8, sy - h.h + 8 + winSize / 2);
            ctx.lineTo(sx - h.w / 2 + 8 + winSize, sy - h.h + 8 + winSize / 2);
            ctx.stroke();

            // Roof
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

    function drawTrees(cam) {
        const time = Date.now() * 0.001;
        for (const tree of trees) {
            const sx = tree.x - cam.x;
            const sy = tree.y - cam.y;
            if (sx < -50 || sx > W + 50 || sy < -70 || sy > H + 30) continue;

            const sway = Math.sin(time + tree.sway) * 2;

            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.12)";
            ctx.beginPath();
            ctx.ellipse(sx + 3, sy + 3, tree.size * 0.6, tree.size * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();

            // Trunk
            ctx.fillStyle = COLORS.treeTrunk;
            ctx.fillRect(sx - 3, sy - tree.size * 1.2, 6, tree.size * 1.2);

            // Leaves (layered circles)
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

            // Highlight
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.beginPath();
            ctx.arc(sx + sway - 3, sy - tree.size * 1.4, tree.size * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawCharacter(sx, sy, size, color, direction, animFrame, isPlayer) {
        const bobY = animFrame % 2 === 1 ? -2 : 0;

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(sx, sy + size * 0.8, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(sx, sy - size * 0.2 + bobY, size * 0.55, size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body outline
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy - size * 0.2 + bobY, size * 0.55, size * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Head
        const headColor = isPlayer ? "#ffd5a8" : "#ffc999";
        ctx.fillStyle = headColor;
        ctx.beginPath();
        ctx.arc(sx, sy - size * 0.85 + bobY, size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy - size * 0.85 + bobY, size * 0.4, 0, Math.PI * 2);
        ctx.stroke();

        // Eyes
        const eyeOffsetX = size * 0.12;
        const eyeY = sy - size * 0.9 + bobY;
        if (direction === 2) {
            // Facing up - no eyes visible
        } else {
            ctx.fillStyle = "#333";
            if (direction === 1) {
                ctx.beginPath();
                ctx.arc(sx - eyeOffsetX - 2, eyeY, 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (direction === 3) {
                ctx.beginPath();
                ctx.arc(sx + eyeOffsetX + 2, eyeY, 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(sx - eyeOffsetX, eyeY, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(sx + eyeOffsetX, eyeY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Player indicator (small arrow above head)
        if (isPlayer) {
            const arrowY = sy - size * 1.5 + bobY + Math.sin(Date.now() * 0.005) * 3;
            ctx.fillStyle = "#ffcc00";
            ctx.beginPath();
            ctx.moveTo(sx, arrowY + 6);
            ctx.lineTo(sx - 5, arrowY);
            ctx.lineTo(sx + 5, arrowY);
            ctx.closePath();
            ctx.fill();
        }

        // Legs (walking animation)
        if (animFrame % 2 === 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            const legSpread = animFrame === 1 ? 4 : -4;
            ctx.beginPath();
            ctx.moveTo(sx - 3, sy + size * 0.3 + bobY);
            ctx.lineTo(sx - 3 + legSpread, sy + size * 0.7);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + 3, sy + size * 0.3 + bobY);
            ctx.lineTo(sx + 3 - legSpread, sy + size * 0.7);
            ctx.stroke();
        }
    }

    function drawPlayer(cam) {
        const sx = player.x - cam.x;
        const sy = player.y - cam.y;
        drawCharacter(sx, sy, player.size, COLORS.playerBody, player.direction, player.animFrame, true);
    }

    function drawNPCs(cam) {
        for (const npc of npcs) {
            const sx = npc.x - cam.x;
            const sy = npc.y - cam.y;
            if (sx < -40 || sx > W + 40 || sy < -60 || sy > H + 40) continue;
            drawCharacter(sx, sy, npc.size, npc.color, npc.direction, npc.animFrame, false);
        }
    }

    // ---- Grid Overlay for Board Sections ----
    function drawBoardGrid(cam) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        // Vertical lines (dividing board into 3 columns)
        for (let i = 1; i < BOARD_SCALE; i++) {
            const x = (boardW / BOARD_SCALE) * i - cam.x;
            if (x > 0 && x < W) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, H);
                ctx.stroke();
            }
        }

        // Horizontal lines (dividing board into 3 rows)
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

    // ---- Zone Labels ----
    function drawZoneLabels(cam) {
        const zoneW = boardW / BOARD_SCALE;
        const zoneH = boardH / BOARD_SCALE;
        const zoneNames = [
            ["Enchanted Forest", "Northern Plains", "Mountain Pass"],
            ["Western Marsh", "Central Village", "Eastern Desert"],
            ["Southern Beach", "Mystic Lake", "Dark Caves"],
        ];

        ctx.font = "bold 28px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let r = 0; r < BOARD_SCALE; r++) {
            for (let c = 0; c < BOARD_SCALE; c++) {
                const cx = zoneW * c + zoneW / 2 - cam.x;
                const cy = zoneH * r + zoneH / 2 - cam.y;

                if (cx > -200 && cx < W + 200 && cy > -200 && cy < H + 200) {
                    ctx.fillStyle = "rgba(255,255,255,0.08)";
                    ctx.fillText(zoneNames[r][c], cx, cy);
                }
            }
        }
    }

    // ---- Board Border ----
    function drawBoardBorder(cam) {
        ctx.strokeStyle = "rgba(255,100,100,0.3)";
        ctx.lineWidth = 4;
        ctx.strokeRect(-cam.x, -cam.y, boardW, boardH);
    }

    // ---- Minimap ----
    function drawMinimap(cam) {
        if (!minimapCtx) return;
        const mW = 120;
        const mH = 120;

        minimapCtx.clearRect(0, 0, mW, mH);

        // Background
        minimapCtx.fillStyle = "#2a5a2a";
        minimapCtx.fillRect(0, 0, mW, mH);

        // Water tiles (simplified)
        minimapCtx.fillStyle = COLORS.water;
        const tileScaleX = mW / boardW;
        const tileScaleY = mH / boardH;
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

        // Houses on minimap
        minimapCtx.fillStyle = "#d4a574";
        for (const h of houses) {
            minimapCtx.fillRect(h.x * tileScaleX - 1, h.y * tileScaleY - 1, 3, 3);
        }

        // Viewport indicator
        const vpX = (cam.x / boardW) * mW;
        const vpY = (cam.y / boardH) * mH;
        const vpW = (W / boardW) * mW;
        const vpH = (H / boardH) * mH;
        minimapCtx.strokeStyle = "rgba(255,255,255,0.6)";
        minimapCtx.lineWidth = 1.5;
        minimapCtx.strokeRect(vpX, vpY, vpW, vpH);

        // Player dot
        const px = (player.x / boardW) * mW;
        const py = (player.y / boardH) * mH;
        minimapCtx.fillStyle = "#ffcc00";
        minimapCtx.beginPath();
        minimapCtx.arc(px, py, 3, 0, Math.PI * 2);
        minimapCtx.fill();

        // NPC dots
        minimapCtx.fillStyle = "rgba(255,100,100,0.6)";
        for (const npc of npcs) {
            const nx = (npc.x / boardW) * mW;
            const ny = (npc.y / boardH) * mH;
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

    // ---- Coordinate Display ----
    function drawCoords(cam) {
        const zoneW = boardW / BOARD_SCALE;
        const zoneH = boardH / BOARD_SCALE;
        const zoneCol = Math.floor(player.x / zoneW);
        const zoneRow = Math.floor(player.y / zoneH);
        const zoneNames = [
            ["Enchanted Forest", "Northern Plains", "Mountain Pass"],
            ["Western Marsh", "Central Village", "Eastern Desert"],
            ["Southern Beach", "Mystic Lake", "Dark Caves"],
        ];
        const zoneName = zoneNames[Math.min(zoneRow, 2)]?.[Math.min(zoneCol, 2)] || "Unknown";

        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(12, 12, 220, 52);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px 'Segoe UI', monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`Zone: ${zoneName}`, 20, 18);
        ctx.font = "12px 'Segoe UI', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(`Position: (${Math.round(player.x)}, ${Math.round(player.y)})`, 20, 40);
    }

    // ---- Main Render ----
    function render() {
        const cam = getCameraOffset();

        ctx.clearRect(0, 0, W, H);

        // Draw layers in order
        drawGround(cam);
        drawPaths(cam);
        drawFlowers(cam);
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

                // Shadow
                ctx.fillStyle = "rgba(0,0,0,0.12)";
                ctx.beginPath();
                ctx.ellipse(sx + 3, sy + 3, tree.size * 0.6, tree.size * 0.25, 0, 0, Math.PI * 2);
                ctx.fill();

                // Trunk
                ctx.fillStyle = COLORS.treeTrunk;
                ctx.fillRect(sx - 3, sy - tree.size * 1.2, 6, tree.size * 1.2);

                // Leaves
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

                // Highlight
                ctx.fillStyle = "rgba(255,255,255,0.1)";
                ctx.beginPath();
                ctx.arc(sx + sway - 3, sy - tree.size * 1.4, tree.size * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
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
        console.log(`Board size: ${boardW}x${boardH} (${BOARD_SCALE}x${BOARD_SCALE} viewports)`);
        console.log(`Player starts at: (${player.x}, ${player.y})`);
    }

    init();
})();
