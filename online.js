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

    ws.onopen = () => cb();
    ws.onmessage = (e) => {
        let msg = e.data;

        // Fast CSV Stream Handling
        if (typeof msg === 'string' && msg.startsWith('S:')) {
            let p = msg.substring(2).split(',');
            if (isHost) {
                // Host receives Guest Input: S:dx,dy
                guestInput.dx = parseFloat(p[0]) || 0;
                guestInput.dy = parseFloat(p[1]) || 0;
            } else {
                // Guest receives World State: S:hx,hy,gx,gy,rad,hAlive,gAlive,scH,scG
                p2pPlayers.host.targetX = parseFloat(p[0]);
                p2pPlayers.host.targetY = parseFloat(p[1]);
                p2pPlayers.guest.targetX = parseFloat(p[2]);
                p2pPlayers.guest.targetY = parseFloat(p[3]);
                p2pArenaRadius = parseFloat(p[4]);
                p2pPlayers.host.alive = (p[5] === '1');
                p2pPlayers.guest.alive = (p[6] === '1');
                p2pScores.host = parseInt(p[7]) || 0;
                p2pScores.guest = parseInt(p[8]) || 0;
                updateP2PHud();

                if (!p2pPlayers.host.alive || !p2pPlayers.guest.alive) {
                    showOnlineEnd(p2pPlayers.guest.alive);
                }
            }
            return;
        }

        try {
            let d = JSON.parse(msg);
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
                let b = document.getElementById('btn-join'); if (b) b.innerText = "🚀 Join Room";
            } else if (d.type === 'opponent_left') {
                alert("خرج الخصم من الغرفة"); exitToMenu();
            }
        } catch (err) {}
    };

    ws.onclose = () => { if (gameMode === 'p2p') { alert("انقطع الاتصال بالسيرفر"); exitToMenu(); } };
}

function createOnlineRoom() {
    hideAllMenus(); bannerAd.style.display = 'none'; isHost = true;
    document.getElementById('lobby-code').innerText = "جاري الإنشاء...";
    document.getElementById('menu-lobby').classList.remove('hidden');
    connectWS(() => ws.send(JSON.stringify({ type: 'create' })));
}

function joinOnlineRoom(code) {
    let r = code || document.getElementById('room-input').value.trim();
    if (!r) return alert("أدخل كود الغرفة المكون من 4 أرقام");
    let b = document.getElementById('btn-join'); if (b) b.innerText = "Connecting...";
    hideAllMenus(); bannerAd.style.display = 'none'; isHost = false;
    connectWS(() => ws.send(JSON.stringify({ type: 'join', room: r })));
}

function startOnlineGame() {
    gameMode = 'p2p'; hideAllMenus();
    document.getElementById('hud').classList.remove('hidden');
    touchBox.style.display = 'block';
    resetP2PRound();

    if (netInterval) clearInterval(netInterval);
    
    // Fixed 30Hz ultra lightweight CSV Sync
    netInterval = setInterval(() => {
        if (!ws || ws.readyState !== 1 || gameMode !== 'p2p') return;
        if (isHost) {
            let payload = `S:${Math.round(p2pPlayers.host.x)},${Math.round(p2pPlayers.host.y)},${Math.round(p2pPlayers.guest.x)},${Math.round(p2pPlayers.guest.y)},${Math.round(p2pArenaRadius)},${p2pPlayers.host.alive?1:0},${p2pPlayers.guest.alive?1:0},${p2pScores.host},${p2pScores.guest}`;
            ws.send(payload);
        } else {
            let dx = touchVec.x || (keys['arrowright']||keys['d']?1:keys['arrowleft']||keys['a']?-1:0);
            let dy = touchVec.y || (keys['arrowdown']||keys['s']?1:keys['arrowup']||keys['w']?-1:0);
            ws.send(`S:${dx.toFixed(2)},${dy.toFixed(2)}`);
        }
    }, 33);
}

function resetP2PRound() {
    p2pArenaRadius = 240;
    p2pPlayers.host.x = 280; p2pPlayers.host.y = 300; p2pPlayers.host.vx = 0; p2pPlayers.host.vy = 0; p2pPlayers.host.alive = true;
    p2pPlayers.guest.x = 520; p2pPlayers.guest.y = 300; p2pPlayers.guest.vx = 0; p2pPlayers.guest.vy = 0; p2pPlayers.guest.alive = true;
    p2pPlayers.host.targetX = 280; p2pPlayers.host.targetY = 300;
    p2pPlayers.guest.targetX = 520; p2pPlayers.guest.targetY = 300;
    guestInput.dx = 0; guestInput.dy = 0;
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
