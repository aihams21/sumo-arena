/**
 * Neon Sumo Arena — static host + leaderboard API.
 *
 * Zero dependencies: node:http only. The previous package.json declared
 * express + ws and a "start" script pointing at a server.js that did not
 * exist, so `npm start` could never work. This replaces both: there is no
 * WebSocket client anywhere in the game, so `ws` was dead weight, and express
 * was only ever going to serve files.
 *
 *   node server.js           -> http://localhost:8080
 *   PORT=3000 node server.js
 *
 * API
 *   GET  /api/health            -> { ok: true, players: n }
 *   GET  /api/leaderboard        -> { players: [...] }   (real, persisted)
 *   POST /api/leaderboard/sync   <- { id, name, level, stage, coins, skin, avatar }
 *
 * The store is a plain JSON file. It starts empty on purpose: an empty
 * leaderboard is the truth until real players post their own scores.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE = path.join(DATA_DIR, 'leaderboard.json');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf'
};

// ---------------------------------------------------------------- store ----

/** Cap the store so a spammy client cannot grow the file without bound. */
const MAX_PLAYERS = 500;

async function readStore() {
    try {
        const raw = await fsp.readFile(STORE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.players) ? parsed.players : [];
    } catch (_error) {
        return [];
    }
}

async function writeStore(players) {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = STORE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify({ players }, null, 2), 'utf8');
    await fsp.rename(tmp, STORE);
}

/**
 * A player row is only accepted if it has a real identity and a real score.
 * Anything else would be a fabricated row, which is exactly what this
 * endpoint exists to stop.
 */
function sanitisePlayer(input) {
    if (!input || typeof input !== 'object') return null;
    const id = typeof input.id === 'string' ? input.id.trim().slice(0, 64) : '';
    if (!id) return null;
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 24) : '';
    if (!name) return null;
    const num = (value, min, max, fallback) => {
        const v = Number(value);
        return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
    };
    return {
        id,
        name,
        level: num(input.level, 1, 9999, 1),
        stage: num(input.stage, 1, 9999, 1),
        coins: num(input.coins, 0, 9999999, 0),
        skin: typeof input.skin === 'string' ? input.skin.trim().slice(0, 32) : 'Pulse Core',
        avatar: typeof input.avatar === 'string' ? input.avatar.slice(0, 20480) : ''
    };
}

async function upsertPlayer(row) {
    const players = await readStore();
    const index = players.findIndex(p => p.id === row.id);
    // Keep the best score so a player cannot lose progress by replaying an
    // easier stage; the rest of the row always reflects the latest sync.
    if (index === -1) {
        players.push(row);
    } else {
        const old = players[index];
        players[index] = {
            ...row,
            level: Math.max(old.level || 1, row.level),
            stage: Math.max(old.stage || 1, row.stage),
            coins: Math.max(old.coins || 0, row.coins)
        };
    }
    players.sort((a, b) => b.stage - a.stage || b.coins - a.coins);
    await writeStore(players.slice(0, MAX_PLAYERS));
    return players.length;
}

// ----------------------------------------------------------------- http ----

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readBody(req, limitBytes = 64 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** Resolve a URL path inside ROOT, refusing anything that escapes it. */
function resolveStatic(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const target = path.resolve(ROOT, relative);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
    return target;
}

async function serveStatic(req, res, urlPath) {
    const target = resolveStatic(urlPath);
    if (!target) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }
    try {
        const stat = await fsp.stat(target);
        const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
        const data = await fsp.readFile(file);
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': data.length,
            // The game is edited constantly during development; never let a
            // stale shell hide a fix.
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    } catch (_error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    }
}

const server = http.createServer(async (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/api/health') {
        const players = await readStore();
        return sendJson(res, 200, { ok: true, players: players.length });
    }

    if (urlPath === '/api/leaderboard') {
        const players = await readStore();
        return sendJson(res, 200, { players });
    }

    if (urlPath === '/api/leaderboard/sync') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' });
        let parsed;
        try {
            parsed = JSON.parse(await readBody(req));
        } catch (_error) {
            return sendJson(res, 400, { error: 'Invalid JSON body' });
        }
        const row = sanitisePlayer(parsed);
        if (!row) return sendJson(res, 400, { error: 'id and name are required' });
        const count = await upsertPlayer(row);
        return sendJson(res, 200, { ok: true, players: count });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }
    return serveStatic(req, res, urlPath);
});

// A stale lock file from a killed process must never block startup.
if (fs.existsSync(path.join(DATA_DIR, 'leaderboard.json.lock'))) {
    try { fs.unlinkSync(path.join(DATA_DIR, 'leaderboard.json.lock')); } catch (_e) {}
}

server.listen(PORT, () => {
    console.log('Neon Sumo Arena  ->  http://localhost:' + PORT);
    console.log('Leaderboard API ->  http://localhost:' + PORT + '/api/leaderboard');
});