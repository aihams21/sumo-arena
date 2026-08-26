// The game and relay are served by the same Replit process. This avoids a
// hard-coded external relay that can sleep, use the wrong protocol, or add
// unnecessary latency.
const SERVER_WS_URL = (() => {
    const protocol =
        window.location.protocol === 'https:'
            ? 'wss:'
            : 'ws:';

    return window.location.host
        ? `${protocol}//${window.location.host}`
        : 'ws://localhost:3000';
})();

let ws = null;
let isHost = false;
let currentRoomCode = "";
let p2pArenaRadius = 240;
let netInterval = null;
let wsCallbacks = [];
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

function connectWS(callback) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        callback();
        return;
    }

    wsCallbacks.push(callback);

    if (
        ws &&
        ws.readyState === WebSocket.CONNECTING
    ) {
        return;
    }

    leavingOnlineRoom = false;
    ws = new WebSocket(SERVER_WS_URL);

    ws.onopen = () => {
        const callbacks = wsCallbacks.splice(0);
        callbacks.forEach(fn => fn());
    };

    ws.onmessage = event => {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch (_error) {
            return;
        }

        if (data.type === 'created') {
            currentRoomCode = data.room;
            isHost = data.role === 'host';

            document.getElementById('lobby-code').innerText =
                data.room;
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

            if (gameMode !== 'p2p') {
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

            const button =
                document.getElementById('btn-join');

            if (button) {
                button.innerText = "🚀 Join Room";
            }
        } else if (data.type === 'opponent_left') {
            alert("خرج الخصم من الغرفة");
            exitToMenu();
        }
    };

    ws.onclose = () => {
        ws = null;
        wsCallbacks = [];

        if (
            !leavingOnlineRoom &&
            gameMode === 'p2p'
        ) {
            alert("انقطع الاتصال بالسيرفر");
            exitToMenu();
        }
    };

    ws.onerror = () => {
        // onclose presents the user-facing message.
        // Keeping this handler prevents an uncaught browser
        // WebSocket error in the console.
    };
}

function createOnlineRoom() {
    hideAllMenus();
    bannerAd.style.display = 'none';
    isHost = true;

    document.getElementById('lobby-code').innerText =
        "جاري الإنشاء...";

    document
        .getElementById('menu-lobby')
        .classList
        .remove('hidden');

    connectWS(() => {
        ws.send(
            JSON.stringify({
                type: 'create'
            })
        );
    });
}

function joinOnlineRoom(code) {
    const room = String(
        code ||
        document.getElementById('room-input').value
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
    bannerAd.style.display = 'none';
    isHost = false;

    connectWS(() => {
        ws.send(
            JSON.stringify({
                type: 'join',
                room
            })
        );
    });
}

function startOnlineGame() {
    gameMode = 'p2p';
    hideAllMenus();

    document
        .getElementById('hud')
        .classList
        .remove('hidden');

    touchBox.style.display = 'block';

    resetP2PRound();

    if (netInterval) {
        clearInterval(netInterval);
    }

    // Inputs are sent frequently enough for responsive server
    // simulation, while snapshots arrive independently at the
    // server's fixed tick rate.
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
    p2pArenaRadius =
        Number.isFinite(data.arenaRadius)
            ? data.arenaRadius
            : p2pArenaRadius;

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

        local.serverX = Number(incoming.x);
        local.serverY = Number(incoming.y);
        local.targetX = local.serverX;
        local.targetY = local.serverY;
        local.vx = Number(incoming.vx) || 0;
        local.vy = Number(incoming.vy) || 0;
        local.radius =
            Number(incoming.radius) ||
            local.radius;
        local.alive = incoming.alive !== false;

        const isMe =
            (isHost && role === 'host') ||
            (!isHost && role === 'guest');

        if (isMe) {
            // Preserve prediction for low input latency,
            // but continuously remove server error so pushes
            // and ring-outs cannot ghost apart.
            const errorX =
                local.serverX - local.x;

            const errorY =
                local.serverY - local.y;

            if (Math.hypot(errorX, errorY) > 70) {
                local.x = local.serverX;
                local.y = local.serverY;
            } else {
                local.x += errorX * 0.3;
                local.y += errorY * 0.3;
            }
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

    document
        .getElementById('hud')
        .classList
        .remove('hidden');

    touchBox.style.display = 'block';
    updateP2PHud();
}

function setP2PInput(dx, dy) {
    p2pInput = {
        dx,
        dy
    };
}

function showOnlineEnd(won) {
    stageEnded = true;

    const title =
        document.getElementById('round-title');

    title.innerText = won
        ? "ROUND WON! 🏆"
        : "ROUND LOST! 💀";

    title.style.color = won
        ? "#00ff66"
        : "#ff3366";

    const myScore = isHost
        ? p2pScores.host
        : p2pScores.guest;

    const opponentScore = isHost
        ? p2pScores.guest
        : p2pScores.host;

    document.getElementById('round-score').innerText =
        `${myScore}  -  ${opponentScore}`;

    hideAllMenus();
    bannerAd.style.display = 'none';

    document
        .getElementById('modal-round')
        .classList
        .remove('hidden');
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
    const myScore = isHost
        ? p2pScores.host
        : p2pScores.guest;

    const opponentScore = isHost
        ? p2pScores.guest
        : p2pScores.host;

    document.getElementById('hud-left').innerText =
        `YOU: ${myScore} | OPP: ${opponentScore}`;
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
