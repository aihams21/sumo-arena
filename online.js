const ONLINE_WS_URL = 'wss://sumo-server.onrender.com';

function isLocalHostname(hostname) {
    return (
        !hostname ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]'
    );
}

function getServerWsUrl() {
    const hostname = window.location.hostname;

    if (isLocalHostname(hostname)) {
        const protocol =
            window.location.protocol === 'https:'
                ? 'wss:'
                : 'ws:';

        return window.location.host
            ? `${protocol}//${window.location.host}`
            : 'ws://localhost:3000';
    }

    return ONLINE_WS_URL;
}

const SERVER_WS_URL = getServerWsUrl();

let ws = null;
let isHost = false;
let currentRoomCode = "";
let p2pArenaRadius = 240;
let netInterval = null;
let wsCallbacks = [];
let connectTimer = null;
let p2pInput = {
    dx: 0,
    dy: 0
};
let inputSequence = 0;
let leavingOnlineRoom = false;

let p2pPlayers = {
    host: {
        x: 280,
        y: 300,
        vx: 0,
        vy: 0,
        serverX: 280,
        serverY: 300,
        targetX: 280,
        targetY: 300,
        radius: 24,
        color: '#00e5ff',
        alive: true
    },
    guest: {
        x: 520,
        y: 300,
        vx: 0,
        vy: 0,
        serverX: 520,
        serverY: 300,
        targetX: 520,
        targetY: 300,
        radius: 24,
        color: '#ff0055',
        alive: true
    }
};

let p2pScores = {
    host: 0,
    guest: 0
};

function resetJoinButton() {
    const button = document.getElementById('btn-join');

    if (button) {
        button.innerText = "🚀 Join Room";
    }
}

function clearConnectTimer() {
    if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
    }
}

function handleSocketClosed() {
    clearConnectTimer();
    ws = null;
    wsCallbacks = [];
    resetJoinButton();

    if (leavingOnlineRoom) {
        leavingOnlineRoom = false;
        return;
    }

    const inOnlineMatch =
        typeof gameMode !== 'undefined' &&
        gameMode === 'p2p';

    const lobby = document.getElementById('menu-lobby');
    const waitingInLobby =
        lobby &&
        !lobby.classList.contains('hidden');

    if (inOnlineMatch || waitingInLobby) {
        alert("انقطع الاتصال بالسيرفر");

        if (typeof exitToMenu === 'function') {
            exitToMenu();
        }
    }
}

function connectWS(callback) {
    if (typeof callback === 'function') {
        if (ws && ws.readyState === WebSocket.OPEN) {
            callback();
            return;
        }

        wsCallbacks.push(callback);
    }

    if (
        ws &&
        (
            ws.readyState === WebSocket.CONNECTING ||
            ws.readyState === WebSocket.OPEN
        )
    ) {
        return;
    }

    leavingOnlineRoom = false;
    ws = new WebSocket(SERVER_WS_URL);

    clearConnectTimer();
    connectTimer = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    }, 45000);

    ws.onopen = () => {
        clearConnectTimer();
        const callbacks = wsCallbacks.splice(0);
        callbacks.forEach(fn => {
            if (typeof fn === 'function') {
                fn();
            }
        });
    };

    ws.onmessage = event => {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch (_error) {
            return;
        }

        if (!data || typeof data !== 'object') {
            return;
        }

        if (data.type === 'created') {
            currentRoomCode = data.room || "";
            isHost = data.role === 'host';

            const lobbyCode =
                document.getElementById('lobby-code');

            if (lobbyCode) {
                lobbyCode.innerText = data.room || "";
            }
        } else if (
            data.type === 'player_joined' ||
            data.type === 'joined'
        ) {
            currentRoomCode =
                data.room || currentRoomCode;

            if (data.role) {
                isHost = data.role === 'host';
            }

            startOnlineGame();
        } else if (data.type === 'start_round') {
            p2pScores = {
                ...p2pScores,
                ...(data.scores || {})
            };

            if (
                typeof gameMode === 'undefined' ||
                gameMode !== 'p2p'
            ) {
                startOnlineGame();
            }

            resetP2PRound();
        } else if (data.type === 'state') {
            applyOnlineState(data);
        } else if (data.type === 'round_over') {
            p2pScores = {
                ...p2pScores,
                ...(data.scores || {})
            };

            if (data.state) {
                applyOnlineState(data.state);
            }

            showOnlineEnd(
                data.winner ===
                (isHost ? 'host' : 'guest')
            );
        } else if (data.type === 'error') {
            alert(
                data.message ||
                'Unable to join room.'
            );

            resetJoinButton();
        } else if (data.type === 'opponent_left') {
            alert("خرج الخصم من الغرفة");
            leavingOnlineRoom = true;

            if (typeof exitToMenu === 'function') {
                exitToMenu();
            }
        }
    };

    ws.onclose = handleSocketClosed;

    ws.onerror = () => {
        // onclose presents the user-facing message.
    };
}

function disconnectWS() {
    leavingOnlineRoom = true;
    clearConnectTimer();

    if (netInterval) {
        clearInterval(netInterval);
        netInterval = null;
    }

    if (!ws) {
        leavingOnlineRoom = false;
        return;
    }

    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify({ type: 'leave' }));
        } catch (_error) {
            // Ignore send failures while closing.
        }
    }

    try {
        ws.close();
    } catch (_error) {
        // Ignore close failures.
    }

    ws = null;
}

function createOnlineRoom() {
    hideAllMenus();

    if (typeof bannerAd !== 'undefined' && bannerAd) {
        bannerAd.style.display = 'none';
    }

    isHost = true;

    const lobbyCode =
        document.getElementById('lobby-code');

    if (lobbyCode) {
        lobbyCode.innerText = "جاري الإنشاء...";
    }

    const lobby = document.getElementById('menu-lobby');

    if (lobby) {
        lobby.classList.remove('hidden');
    }

    connectWS(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'create' }));
        }
    });
}

function joinOnlineRoom(code) {
    const input = document.getElementById('room-input');
    const room = String(
        code ||
        (input && input.value) ||
        ''
    )
        .trim()
        .toUpperCase();

    if (!/^\d{4}$/.test(room)) {
        return alert(
            "أدخل كود الغرفة المكون من 4 أرقام"
        );
    }

    const button =
        document.getElementById('btn-join');

    if (button) {
        button.innerText = "Connecting...";
    }

    hideAllMenus();

    if (typeof bannerAd !== 'undefined' && bannerAd) {
        bannerAd.style.display = 'none';
    }

    isHost = false;

    connectWS(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: 'join',
                    room
                })
            );
        }
    });
}

function startOnlineGame() {
    gameMode = 'p2p';
    hideAllMenus();

    const hud = document.getElementById('hud');

    if (hud) {
        hud.classList.remove('hidden');
    }

    if (typeof touchBox !== 'undefined' && touchBox) {
        touchBox.style.display = 'block';
    }

    resetP2PRound();

    if (netInterval) {
        clearInterval(netInterval);
    }

    netInterval = setInterval(() => {
        if (
            !ws ||
            ws.readyState !== WebSocket.OPEN ||
            gameMode !== 'p2p'
        ) {
            return;
        }

        const me = isHost
            ? p2pPlayers.host
            : p2pPlayers.guest;

        if (!me) {
            return;
        }

        ws.send(
            JSON.stringify({
                type: 'input',
                dx: p2pInput.dx,
                dy: p2pInput.dy,
                seq: inputSequence++,
                radius: me.radius
            })
        );
    }, 33);
}

function applyOnlineState(data) {
    if (!data || typeof data !== 'object') {
        return;
    }

    if (Number.isFinite(data.arenaRadius) && data.arenaRadius > 0) {
        p2pArenaRadius = data.arenaRadius;
    }

    p2pScores = {
        ...p2pScores,
        ...(data.scores || {})
    };

    for (const role of ['host', 'guest']) {
        const incoming =
            data.players &&
            data.players[role];

        const local = p2pPlayers[role];

        if (!incoming || !local) {
            continue;
        }

        const serverX = Number(incoming.x);
        const serverY = Number(incoming.y);

        if (
            !Number.isFinite(serverX) ||
            !Number.isFinite(serverY)
        ) {
            continue;
        }

        local.serverX = serverX;
        local.serverY = serverY;
        local.targetX = serverX;
        local.targetY = serverY;

        const vx = Number(incoming.vx);
        const vy = Number(incoming.vy);
        local.vx = Number.isFinite(vx) ? vx : 0;
        local.vy = Number.isFinite(vy) ? vy : 0;

        const radius = Number(incoming.radius);

        if (Number.isFinite(radius) && radius > 0) {
            local.radius = radius;
        }

        local.alive = incoming.alive !== false;

        const isMe =
            (isHost && role === 'host') ||
            (!isHost && role === 'guest');

        if (isMe) {
            const errorX = local.serverX - local.x;
            const errorY = local.serverY - local.y;

            if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) {
                local.x = local.serverX;
                local.y = local.serverY;
            } else if (Math.hypot(errorX, errorY) > 70) {
                local.x = local.serverX;
                local.y = local.serverY;
            } else {
                local.x += errorX * 0.35;
                local.y += errorY * 0.35;
            }
        } else if (
            !Number.isFinite(local.x) ||
            !Number.isFinite(local.y)
        ) {
            local.x = local.serverX;
            local.y = local.serverY;
        }
    }

    updateP2PHud();
}

function resetP2PRound() {
    p2pArenaRadius = 240;

    p2pInput = {
        dx: 0,
        dy: 0
    };

    const host = p2pPlayers.host;
    const guest = p2pPlayers.guest;

    Object.assign(host, {
        x: 280,
        y: 300,
        vx: 0,
        vy: 0,
        serverX: 280,
        serverY: 300,
        targetX: 280,
        targetY: 300,
        alive: true
    });

    Object.assign(guest, {
        x: 520,
        y: 300,
        vx: 0,
        vy: 0,
        serverX: 520,
        serverY: 300,
        targetX: 520,
        targetY: 300,
        alive: true
    });

    stageEnded = false;
    hideAllMenus();

    const hud = document.getElementById('hud');

    if (hud) {
        hud.classList.remove('hidden');
    }

    if (typeof touchBox !== 'undefined' && touchBox) {
        touchBox.style.display = 'block';
    }

    updateP2PHud();
}

function setP2PInput(dx, dy) {
    const safeDx = Number(dx);
    const safeDy = Number(dy);

    p2pInput = {
        dx: Number.isFinite(safeDx) ? safeDx : 0,
        dy: Number.isFinite(safeDy) ? safeDy : 0
    };
}

function showOnlineEnd(won) {
    stageEnded = true;

    const title =
        document.getElementById('round-title');

    if (title) {
        title.innerText = won
            ? "ROUND WON! 🏆"
            : "ROUND LOST! 💀";

        title.style.color = won
            ? "#00ff66"
            : "#ff3366";
    }

    const myScore = isHost
        ? p2pScores.host
        : p2pScores.guest;

    const opponentScore = isHost
        ? p2pScores.guest
        : p2pScores.host;

    const scoreEl =
        document.getElementById('round-score');

    if (scoreEl) {
        scoreEl.innerText =
            `${myScore || 0}  -  ${opponentScore || 0}`;
    }

    hideAllMenus();

    if (typeof bannerAd !== 'undefined' && bannerAd) {
        bannerAd.style.display = 'none';
    }

    const modal = document.getElementById('modal-round');

    if (modal) {
        modal.classList.remove('hidden');
    }
}

function restartOnlineRound() {
    if (!isHost) {
        return alert(
            "بانتظار المضيف لبدء الجولة..."
        );
    }

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(
            JSON.stringify({
                type: 'start_round'
            })
        );
    }
}

function updateP2PHud() {
    const hudLeft = document.getElementById('hud-left');

    if (!hudLeft) {
        return;
    }

    const myScore = isHost
        ? p2pScores.host
        : p2pScores.guest;

    const opponentScore = isHost
        ? p2pScores.guest
        : p2pScores.host;

    hudLeft.innerText =
        `YOU: ${myScore || 0} | OPP: ${opponentScore || 0}`;
}

function shareRoomWhatsApp() {
    const link =
        `${window.location.origin}` +
        `${window.location.pathname}` +
        `#room=${currentRoomCode}`;

    window.open(
        `https://api.whatsapp.com/send?text=` +
        `${encodeURIComponent(
            '🔥 تحداني في Neon Sumo! اضغط للدخول: ' +
            link
        )}`,
        '_blank'
    );
}

function copyRoomLink() {
    navigator.clipboard
        .writeText(
            `${window.location.origin}` +
            `${window.location.pathname}` +
            `#room=${currentRoomCode}`
        )
        .then(() => alert("✅ تم نسخ الرابط!"));
}
