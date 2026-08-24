const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const ARENA_RADIUS = 240;
let rooms = {};

function genCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', socket => {
    socket.on('createRoom', () => {
        let code = genCode();
        rooms[code] = {
            code,
            players: {},
            scores: {},
            arenaRadius: ARENA_RADIUS,
            state: 'lobby',
            loop: null
        };
        join(socket, code);
    });

    socket.on('joinRoom', code => {
        code = (code || '').toUpperCase().trim();
        if (rooms[code] && Object.keys(rooms[code].players).length < 2) {
            join(socket, code);
        } else {
            socket.emit('errorMsg', 'Room is full or not found!');
        }
    });

    function join(s, code) {
        let r = rooms[code];
        s.join(code);
        s.roomCode = code;

        r.scores[s.id] = 0;
        let pCount = Object.keys(r.players).length;

        r.players[s.id] = {
            id: s.id,
            x: pCount === 0 ? 300 : 500,
            y: 300,
            vx: 0, vy: 0,
            radius: 24,
            color: pCount === 0 ? '#00e5ff' : '#ff0055',
            alive: true,
            input: { dx: 0, dy: 0 }
        };

        s.emit('roomJoined', { code, myId: s.id });

        if (Object.keys(r.players).length === 2) {
            startMatch(code);
        }
    }

    function startMatch(code) {
        let r = rooms[code];
        if (!r) return;
        r.state = 'playing';
        r.arenaRadius = ARENA_RADIUS;

        let ids = Object.keys(r.players);
        r.players[ids[0]].x = 300; r.players[ids[0]].y = 300; r.players[ids[0]].vx = 0; r.players[ids[0]].vy = 0; r.players[ids[0]].alive = true;
        r.players[ids[1]].x = 500; r.players[ids[1]].y = 300; r.players[ids[1]].vx = 0; r.players[ids[1]].vy = 0; r.players[ids[1]].alive = true;

        io.to(code).emit('roundStarted', { scores: r.scores });

        if (r.loop) clearInterval(r.loop);
        r.loop = setInterval(() => {
            if (r.state !== 'playing') return;

            let aliveCount = 0;
            let lastAlive = null;

            for (let id in r.players) {
                let p = r.players[id];
                if (!p.alive) continue;

                p.vx += p.input.dx * 0.75;
                p.vy += p.input.dy * 0.75;
                p.vx *= 0.92;
                p.vy *= 0.92;
                p.x += p.vx;
                p.y += p.vy;

                if (Math.hypot(p.x - 400, p.y - 300) > r.arenaRadius) {
                    p.alive = false;
                } else {
                    aliveCount++;
                    lastAlive = id;
                }
            }

            if (r.arenaRadius > ARENA_RADIUS * 0.6) {
                r.arenaRadius -= 0.02;
            }

            let ids = Object.keys(r.players);
            if (ids.length === 2 && r.players[ids[0]].alive && r.players[ids[1]].alive) {
                let p1 = r.players[ids[0]];
                let p2 = r.players[ids[1]];
                let dx = p2.x - p1.x;
                let dy = p2.y - p1.y;
                let dist = Math.hypot(dx, dy);

                if (dist < p1.radius + p2.radius) {
                    let overlap = (p1.radius + p2.radius) - dist;
                    let ang = Math.atan2(dy, dx);
                    p1.x -= Math.cos(ang) * (overlap * 0.5);
                    p1.y -= Math.sin(ang) * (overlap * 0.5);
                    p2.x += Math.cos(ang) * (overlap * 0.5);
                    p2.y += Math.sin(ang) * (overlap * 0.5);

                    let push = 10;
                    p1.vx -= Math.cos(ang) * push;
                    p1.vy -= Math.sin(ang) * push;
                    p2.vx += Math.cos(ang) * push;
                    p2.vy += Math.sin(ang) * push;
                }
            }

            io.to(code).emit('onlineState', { players: r.players, arenaRadius: r.arenaRadius });

            if (aliveCount <= 1) {
                r.state = 'round_end';
                clearInterval(r.loop);
                if (lastAlive) r.scores[lastAlive] = (r.scores[lastAlive] || 0) + 1;
                io.to(code).emit('roundEnded', { winnerId: lastAlive, scores: r.scores });
            }
        }, 1000 / 60);
    }

    socket.on('input', data => {
        let code = socket.roomCode;
        if (code && rooms[code] && rooms[code].players[socket.id]) {
            rooms[code].players[socket.id].input = data;
        }
    });

    socket.on('nextRound', () => {
        let code = socket.roomCode;
        if (code && rooms[code]) startMatch(code);
    });

    socket.on('disconnect', () => {
        let code = socket.roomCode;
        if (code && rooms[code]) {
            delete rooms[code].players[socket.id];
            delete rooms[code].scores[socket.id];
            if (rooms[code].loop) clearInterval(rooms[code].loop);
            io.to(code).emit('opponentLeft');
            if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
        }
    });
});

server.listen(PORT, () => console.log(`Server online on port ${PORT}`));
