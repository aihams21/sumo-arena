const SERVER_WS_URL = "wss://sumo-server.onrender.com";
let ws = null, isHost = false, currentRoomCode = "", p2pArenaRadius = 240, netInterval = null;
let p2pPlayers = {
    host: { x: 280, y: 300, vx: 0, vy: 0, targetX: 280, targetY: 300, radius: 24, color: '#00e5ff', alive: true },
    guest: { x: 520, y: 300, vx: 0, vy: 0, targetX: 520, targetY: 300, radius: 24, color: '#ff0055', alive: true }
};
let p2pScores = { host: 0, guest: 0 };

function connectWS(cb) {
    if (ws && ws.readyState === 1) return cb();
    ws = new WebSocket(SERVER_WS_URL);
    ws.onopen = () => cb();
    ws.onmessage = (e) => {
        let d = JSON.parse(e.data);
        if (d.type === 'created') {
            currentRoomCode = d.room;
            document.getElementById('lobby-code').innerText = d.room;
        } else if (d.type === 'player_joined') {
            startOnlineGame();
        } else if (d.type === 'joined') {
            currentRoomCode = d.room;
            startOnlineGame();
        } else if (d.type === 'state') {
            if (isHost) {
                p2pPlayers.guest.targetX = d.x; p2pPlayers.guest.targetY = d.y;
                p2pPlayers.guest.vx = d.vx; p2pPlayers.guest.vy = d.vy;
            } else {
                p2pPlayers.host.targetX = d.hx; p2pPlayers.host.targetY = d.hy;
                p2pPlayers.host.vx = d.hvx; p2pPlayers.host.vy = d.hvy;
                p2pArenaRadius = d.rad; p2pPlayers.host.alive = d.hAlive;
                p2pPlayers.guest.alive = d.gAlive; p2pScores = d.scores;
                updateP2PHud();
                if (!d.hAlive || !d.gAlive) showOnlineEnd(d.gAlive);
            }
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
    document.getElementById('lobby-code').innerText = "جاري الاتصال بالسيرفر...";
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
    netInterval = setInterval(() => {
        if (!ws || ws.readyState !== 1 || gameMode !== 'p2p') return;
        if (isHost) {
            ws.send(JSON.stringify({
                type: 'state', hx: +p2pPlayers.host.x.toFixed(1), hy: +p2pPlayers.host.y.toFixed(1),
                hvx: +p2pPlayers.host.vx.toFixed(2), hvy: +p2pPlayers.host.vy.toFixed(2),
                rad: +p2pArenaRadius.toFixed(1), hAlive: p2pPlayers.host.alive,
                gAlive: p2pPlayers.guest.alive, scores: p2pScores
            }));
        } else {
            ws.send(JSON.stringify({
                type: 'state', x: +p2pPlayers.guest.x.toFixed(1), y: +p2pPlayers.guest.y.toFixed(1),
                vx: +p2pPlayers.guest.vx.toFixed(2), vy: +p2pPlayers.guest.vy.toFixed(2)
            }));
        }
    }, 16);
}

function resetP2PRound() {
    p2pArenaRadius = 240;
    p2pPlayers.host.x = 280; p2pPlayers.host.y = 300; p2pPlayers.host.targetX = 280; p2pPlayers.host.targetY = 300; p2pPlayers.host.alive = true;
    p2pPlayers.guest.x = 520; p2pPlayers.guest.y = 300; p2pPlayers.guest.targetX = 520; p2pPlayers.guest.targetY = 300; p2pPlayers.guest.alive = true;
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
