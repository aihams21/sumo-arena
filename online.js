const SERVER_WS_URL = "wss://sumo-server.onrender.com";
let ws = null, isHost = false, currentRoomCode = "", p2pArenaRadius = 240, netInterval = null;
let p2pPlayers = {
    host: { x: 280, y: 300, vx: 0, vy: 0, targetX: 280, targetY: 300, radius: 24, color: '#00e5ff', alive: true },
    guest: { x: 520, y: 300, vx: 0, vy: 0, targetX: 520, targetY: 300, radius: 24, color: '#ff0055', alive: true }
};
let p2pScores = { host: 0, guest: 0 };
let guestInput = { dx: 0, dy: 0 };

function connectWS(cb) {
    if (ws && ws.readyState === 1) return cb();
    ws = new WebSocket(SERVER_WS_URL);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => cb();
    ws.onmessage = (e) => {
        // Fast Binary Packet Processing
        if (e.data instanceof ArrayBuffer) {
            let view = new Int16Array(e.data);
            if (isHost) {
                // Host receives Guest Input: [dx * 100, dy * 100]
                guestInput.dx = view[0] / 100;
                guestInput.dy = view[1] / 100;
            } else {
                // Guest receives World State: [hx, hy, gx, gy, rad, hAlive, gAlive, scoreH, scoreG]
                p2pPlayers.host.targetX = view[0];
                p2pPlayers.host.targetY = view[1];
                p2pPlayers.guest.targetX = view[2];
                p2pPlayers.guest.targetY = view[3];
                p2pArenaRadius = view[4];
                p2pPlayers.host.alive = (view[5] === 1);
                p2pPlayers.guest.alive = (view[6] === 1);
                p2pScores.host = view[7];
                p2pScores.guest = view[8];
                updateP2PHud();
                if (!p2pPlayers.host.alive || !p2pPlayers.guest.alive) {
                    showOnlineEnd(p2pPlayers.guest.alive);
                }
            }
            return;
        }

        let d = JSON.parse(e.data);
        if (d.type === 'created') {
            currentRoomCode = d.room;
            document.getElementById('lobby-code').innerText = d.room;
        } else if (d.type === 'player_joined') {
            startOnlineGame();
        } else if (d.type === 'joined') {
            currentRoomCode = d.room;
            startOnlineGame();
        } else if (d.type === 'start_round') {
            resetP2PRound();
        } else if (d.type === 'error') {
            alert(d.message);
            let b = document.getElementById('btn-join'); if(b) b.innerText = "🚀 Join Room";
        } else if (d.type === 'opponent_left') {
            alert("خرج الخصم من اللعبة"); exitToMenu();
        }
    };
    ws.onclose = () => { if (gameMode === 'p2p') { alert("انقطع الاتصال بالسيرفر"); exitToMenu(); } };
}

function createOnlineRoom() {
    hideAllMenus(); bannerAd.style.display = 'none'; isHost = true;
    document.getElementById('lobby-code').innerText = "جاري الاتصال...";
    document.getElementById('menu-lobby').classList.remove('hidden');
    connectWS(() => ws.send(JSON.stringify({ type: 'create' })));
}

function joinOnlineRoom(code) {
    let r = code || document.getElementById('room-input').value.trim();
    if (!r) return alert("أدخل كود الغرفة المكون من 4 أرقام");
    let b = document.getElementById('btn-join'); if(b) b.innerText = "Connecting...";
    hideAllMenus(); bannerAd.style.display = 'none'; isHost = false;
    connectWS(() => ws.send(JSON.stringify({ type: 'join', room: r })));
}

function startOnlineGame() {
    gameMode = 'p2p'; hideAllMenus();
    document.getElementById('hud').classList.remove('hidden');
    touchBox.style.display = 'block';
    resetP2PRound();

    if (netInterval) clearInterval(netInterval);
    
    // Smooth 30Hz Packet Stream
    netInterval = setInterval(() => {
        if (!ws || ws.readyState !== 1 || gameMode !== 'p2p') return;
        if (isHost) {
            let buffer = new Int16Array([
                Math.round(p2pPlayers.host.x),
                Math.round(p2pPlayers.host.y),
                Math.round(p2pPlayers.guest.x),
                Math.round(p2pPlayers.guest.y),
                Math.round(p2pArenaRadius),
                p2pPlayers.host.alive ? 1 : 0,
                p2pPlayers.guest.alive ? 1 : 0,
                p2pScores.host,
                p2pScores.guest
            ]);
            ws.send(buffer.buffer);
        } else {
            let buffer = new Int16Array([
                Math.round(touchVec.x * 100 || (keys['arrowright']||keys['d']?100:keys['arrowleft']||keys['a']?-100:0)),
                Math.round(touchVec.y * 100 || (keys['arrowdown']||keys['s']?100:keys['arrowup']||keys['w']?-100:0))
            ]);
            ws.send(buffer.buffer);
        }
    }, 33);
}

function resetP2PRound() {
    p2pArenaRadius = 240;
    p2pPlayers.host.x = 280; p2pPlayers.host.y = 300; p2pPlayers.host.vx = 0; p2pPlayers.host.vy = 0; p2pPlayers.host.alive = true;
    p2pPlayers.guest.x = 520; p2pPlayers.guest.y = 300; p2pPlayers.guest.vx = 0; p2pPlayers.guest.vy = 0; p2pPlayers.guest.alive = true;
    p2pPlayers.host.targetX = 280; p2pPlayers.host.targetY = 300;
    p2pPlayers.guest.targetX = 520; p2pPlayers.guest.targetY = 300;
    stageEnded = false; hideAllMenus();
    document.getElementById('hud').classList.remove('hidden');
    touchBox.style.display = 'block'; updateP2PHud();
}

function showOnlineEnd(won) {
    let t = document.getElementById('round-title');
    t.innerText = won ? "ROUND WON! 🏆" : "ROUND LOST! 💀";
    t.style.color = won ? "#00ff66" : "#ff3366";
    document.getElementById('round-score').innerText = `${p2pScores.host}  -  ${p2pScores.guest}`;
    hideAllMenus(); bannerAd.style.display = 'none';
    document.getElementById('modal-round').classList.remove('hidden');
}

function restartOnlineRound() {
    if (isHost) { ws.send(JSON.stringify({ type: 'start_round' })); resetP2PRound(); }
    else alert("بانتظار المضيف لبدء الجولة...");
}

function updateP2PHud() {
    let myScore = isHost ? p2pScores.host : p2pScores.guest;
    let oppScore = isHost ? p2pScores.guest : p2pScores.host;
    document.getElementById('hud-left').innerText = `YOU: ${myScore} | OPP: ${oppScore}`;
}

function shareRoomWhatsApp() {
    let link = `${window.location.origin}${window.location.pathname}#room=${currentRoomCode}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent('🔥 تحداني في Neon Sumo! اضغط للدخول: ' + link)}`, '_blank');
}
function copyRoomLink() {
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#room=${currentRoomCode}`).then(() => alert("✅ تم نسخ الرابط!"));
}
