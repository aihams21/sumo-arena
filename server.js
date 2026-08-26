const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number(process.env.PORT) || 3000;
const ASSET_DIR = __dirname;
const INDEX_FILE = path.join(ASSET_DIR, 'index.html');
const ARENA_RADIUS = 240;
const TICK_RATE = 60;
const SNAPSHOT_RATE = 30;
const MAX_INPUT_AGE_MS = 250;
const rooms = new Map();

app.use(express.static(ASSET_DIR));
app.get('/', (_req, res) => res.sendFile(INDEX_FILE));

function send(socket, message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function broadcast(room, message) {
    for (const role of ['host', 'guest']) {
        send(room.players[role]?.socket, message);
    }
}

function generateRoomCode() {
    let code;

    do {
        code = String(Math.floor(1000 + Math.random() * 9000));
    } while (rooms.has(code));

    return code;
}

function emptyPlayer(role, socket) {
    return {
        role,
        socket,
        x: role === 'host' ? 280 : 520,
        y: 300,
        vx: 0,
        vy: 0,
        radius: 24,
        color: role === 'host' ? '#00e5ff' : '#ff0055',
        alive: true,
        input: {
            dx: 0,
            dy: 0
        },
        lastInputAt: 0,
        lastInputSeq: -1
    };
}

function publicPlayer(player) {
    if (!player) {
        return null;
    }

    return {
        x: Number(player.x) || 0,
        y: Number(player.y) || 0,
        vx: Number(player.vx) || 0,
        vy: Number(player.vy) || 0,
        radius: Number(player.radius) || 24,
        color: player.color,
        alive: player.alive !== false
    };
}

function publicState(room) {
    return {
        type: 'state',
        tick: room.tick,
        arenaRadius: Number(room.arenaRadius) || ARENA_RADIUS,
        scores: room.scores,
        players: {
            host: publicPlayer(room.players.host),
            guest: publicPlayer(room.players.guest)
        }
    };
}

function resetPlayer(player, role) {
    player.x = role === 'host' ? 280 : 520;
    player.y = 300;
    player.vx = 0;
    player.vy = 0;
    player.input = {
        dx: 0,
        dy: 0
    };
    player.lastInputAt = 0;
    player.lastInputSeq = -1;
    player.alive = true;
}

function startRound(room) {
    if (!room || !room.players.host || !room.players.guest) {
        return;
    }

    room.state = 'playing';
    room.tick = 0;
    room.arenaRadius = ARENA_RADIUS;

    resetPlayer(room.players.host, 'host');
    resetPlayer(room.players.guest, 'guest');

    broadcast(room, {
        type: 'start_round',
        scores: room.scores
    });

    if (room.loop) {
        clearInterval(room.loop);
    }

    room.loop = setInterval(() => simulate(room), 1000 / TICK_RATE);
}

function finishRound(room) {
    if (room.state !== 'playing') {
        return;
    }

    room.state = 'round_end';

    if (room.loop) {
        clearInterval(room.loop);
        room.loop = null;
    }

    const hostAlive = room.players.host?.alive;
    const guestAlive = room.players.guest?.alive;

    const winner =
        hostAlive === guestAlive
            ? null
            : hostAlive
                ? 'host'
                : 'guest';

    if (winner) {
        room.scores[winner] += 1;
    }

    broadcast(room, {
        type: 'round_over',
        winner,
        scores: room.scores,
        state: publicState(room)
    });
}

function simulate(room) {
    if (room.state !== 'playing') {
        return;
    }

    room.tick += 1;

    for (const role of ['host', 'guest']) {
        const player = room.players[role];

        if (!player || !player.alive) {
            continue;
        }

        if (Date.now() - player.lastInputAt > MAX_INPUT_AGE_MS) {
            player.input.dx = 0;
            player.input.dy = 0;
        }

        // These values match the responsive local prediction in index.html.
        player.vx += player.input.dx * 1.4;
        player.vy += player.input.dy * 1.4;
        player.vx *= 0.88;
        player.vy *= 0.88;
        player.x += player.vx;
        player.y += player.vy;
    }

    const host = room.players.host;
    const guest = room.players.guest;

    if (host?.alive && guest?.alive) {
        let dx = guest.x - host.x;
        let dy = guest.y - host.y;
        let distance = Math.hypot(dx, dy);

        if (distance < host.radius + guest.radius) {
            // Avoid NaN and give overlapping players a stable separating axis.
            if (distance < 0.0001) {
                dx = 1;
                dy = 0;
                distance = 1;
            }

            const nx = dx / distance;
            const ny = dy / distance;
            const overlap = host.radius + guest.radius - distance;

            host.x -= nx * overlap * 0.5;
            host.y -= ny * overlap * 0.5;
            guest.x += nx * overlap * 0.5;
            guest.y += ny * overlap * 0.5;

            const relativeSpeed = Math.max(
                0,
                (guest.vx - host.vx) * nx +
                (guest.vy - host.vy) * ny
            );

            const impulse = 8.5 + relativeSpeed * 0.45;

            host.vx -= nx * impulse;
            host.vy -= ny * impulse;
            guest.vx += nx * impulse;
            guest.vy += ny * impulse;
        }
    }

    if (room.arenaRadius > ARENA_RADIUS * 0.6) {
        room.arenaRadius -= 0.02;
    }

    for (const role of ['host', 'guest']) {
        const player = room.players[role];

        if (
            player?.alive &&
            Math.hypot(player.x - 400, player.y - 300) >
            room.arenaRadius
        ) {
            player.alive = false;
            player.vx = 0;
            player.vy = 0;
        }
    }

    if (room.tick % (TICK_RATE / SNAPSHOT_RATE) === 0) {
        broadcast(room, publicState(room));
    }

    if (
        !room.players.host?.alive ||
        !room.players.guest?.alive
    ) {
        finishRound(room);
    }
}

function leaveRoom(socket, notifyOpponent = false) {
    const code = socket.roomCode;
    const room = code && rooms.get(code);

    if (!room) {
        return;
    }

    const role = socket.role;

    if (room.loop) {
        clearInterval(room.loop);
    }

    room.loop = null;

    if (notifyOpponent) {
        const otherRole = role === 'host' ? 'guest' : 'host';

        send(room.players[otherRole]?.socket, {
            type: 'opponent_left'
        });
    }

    delete room.players[role];

    if (!room.players.host && !room.players.guest) {
        rooms.delete(code);
    } else {
        // A surviving host can reuse the same room after a disconnect.
        room.state = 'lobby';
        room.arenaRadius = ARENA_RADIUS;
    }

    socket.roomCode = null;
    socket.role = null;
}

wss.on('connection', socket => {
    socket.isAlive = true;

    socket.on('pong', () => {
        socket.isAlive = true;
    });

    socket.on('message', raw => {
        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch (_error) {
            return;
        }

        if (message.type === 'create') {
            leaveRoom(socket);

            const room = {
                code: generateRoomCode(),
                state: 'lobby',
                arenaRadius: ARENA_RADIUS,
                tick: 0,
                loop: null,
                scores: {
                    host: 0,
                    guest: 0
                },
                players: {}
            };

            room.players.host = emptyPlayer('host', socket);
            rooms.set(room.code, room);

            socket.roomCode = room.code;
            socket.role = 'host';

            send(socket, {
                type: 'created',
                room: room.code,
                role: 'host'
            });

            return;
        }

        if (message.type === 'join') {
            const code = String(message.room || '')
                .trim()
                .toUpperCase();

            const room = rooms.get(code);

            if (
                !room ||
                room.players.guest ||
                room.state !== 'lobby'
            ) {
                send(socket, {
                    type: 'error',
                    message: 'Room is full or not found.'
                });

                return;
            }

            leaveRoom(socket);

            room.players.guest = emptyPlayer('guest', socket);
            socket.roomCode = code;
            socket.role = 'guest';

            send(socket, {
                type: 'joined',
                room: code,
                role: 'guest'
            });

            send(room.players.host.socket, {
                type: 'player_joined',
                room: code
            });

            startRound(room);
            return;
        }

        const room =
            socket.roomCode &&
            rooms.get(socket.roomCode);

        const player =
            room &&
            socket.role &&
            room.players[socket.role];

        if (!room || !player) {
            return;
        }

        if (message.type === 'input') {
            const dx = Number(message.dx);
            const dy = Number(message.dy);
            const magnitude = Math.hypot(dx, dy);

            if (
                !Number.isFinite(dx) ||
                !Number.isFinite(dy)
            ) {
                return;
            }

            player.input =
                magnitude > 1
                    ? {
                        dx: dx / magnitude,
                        dy: dy / magnitude
                    }
                    : {
                        dx,
                        dy
                    };

            player.lastInputAt = Date.now();

            if (Number.isFinite(message.seq)) {
                player.lastInputSeq = message.seq;
            }

            if (Number.isFinite(message.radius)) {
                player.radius = Math.max(
                    18,
                    Math.min(40, message.radius)
                );
            }

            return;
        }

        if (message.type === 'start_round') {
            if (
                socket.role === 'host' &&
                room.players.guest &&
                room.state === 'round_end'
            ) {
                startRound(room);
            }

            return;
        }

        if (message.type === 'leave') {
            leaveRoom(socket, true);
        }
    });

    socket.on('close', () => {
        leaveRoom(socket, true);
    });

    socket.on('error', () => {
        leaveRoom(socket, true);
    });
});

// Terminate dead connections so stale rooms do not retain phantom players.
const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
        if (socket.isAlive === false) {
            socket.terminate();
            continue;
        }

        socket.isAlive = false;
        socket.ping();
    }
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeat);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(
        `Neon Sumo Arena server listening on port ${PORT}`
    );
});
