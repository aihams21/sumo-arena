/**
 * Neon Sumo Arena — physics core.
 *
 * Unit convention: velocity is in WORLD UNITS PER REFERENCE FRAME (60fps),
 * which is what game.js stores in `vx`/`vy`. Every helper that takes `n`
 * expects that same unit, so damping and impulses stay consistent with the
 * caller's `n = dt * 60`.
 *
 * Circle-vs-circle resolution is inverse-mass weighted with real
 * restitution; wall contact mirrors the velocity component along the
 * normal instead of teleporting the body.
 */
(() => {
    'use strict';

    const EPS = 1e-6;
    const REF = 60; // reference frames per second

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    /** Mass of a body, defaulting to 1 so older callers keep working. */
    const massOf = (body) => (Number.isFinite(body.mass) && body.mass > 0 ? body.mass : 1);

    /**
     * Apply an impulse of `force` along `direction` to `body`, optionally
     * resisted by the body it is colliding with.
     *
     * `direction.x * (force / |direction|)` is exactly `force * unit(dir)`,
     * so the result depends only on `force` and never on the length of the
     * direction vector that was passed in.
     */
    function resolveImpulse(body, force, direction, resistance = 1) {
        const dx = direction && Number.isFinite(direction.x) ? direction.x : 0;
        const dy = direction && Number.isFinite(direction.y) ? direction.y : 0;
        const length = Math.hypot(dx, dy);
        if (!(length > EPS)) return body;
        const nx = dx / length;
        const ny = dy / length;
        const scale = force / Math.max(0.1, resistance || 1);
        body.vx += nx * scale;
        body.vy += ny * scale;
        return body;
    }

    /**
     * Frame-rate independent damping.
     * `factor` is the fraction of velocity remaining after ONE reference
     * frame; `n` is the number of reference frames elapsed (game.js: n = dt*60).
     */
    function damp(body, factor, n = 1) {
        const amount = Math.pow(clamp(factor, 0, 1), Math.max(0, n));
        body.vx *= amount;
        body.vy *= amount;
        return body;
    }

    /** Frame-rate independent damping expressed in seconds. */
    function dampSeconds(body, factorPerSecond, dtSeconds) {
        const frames = Math.max(0, dtSeconds * REF);
        return damp(body, Math.pow(clamp(factorPerSecond, 0, 1), 1 / REF), frames);
    }

    /** Clamp a body's speed magnitude without changing its direction. */
    function capSpeed(body, max) {
        const speed = Math.hypot(body.vx, body.vy);
        if (speed > max && speed > EPS) {
            body.vx = (body.vx / speed) * max;
            body.vy = (body.vy / speed) * max;
        }
        return body;
    }

    /**
     * Resolve a circle-vs-circle contact.
     *
     * - Positional correction is split by inverse mass, so a heavy body is
     *   displaced less than a light one.
     * - The velocity response is a proper normal impulse with restitution,
     *   so contacting bodies bounce instead of merely sliding apart.
     * - `push` optionally adds extra separation (used for hazards, which
     *   should shove bodies clear rather than merely de-penetrate them).
     *
     * Returns true when the pair was in contact.
     */
    function resolveCirclePair(a, b, options) {
        const opts = options || {};
        const restitution = Number.isFinite(opts.restitution) ? opts.restitution : 0.35;
        const extra = Number.isFinite(opts.push) ? opts.push : 0;
        const positional = Number.isFinite(opts.positional) ? opts.positional : 1;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const sum = (a.radius || 0) + (b.radius || 0);
        if (distSq >= sum * sum) return false;

        const dist = Math.sqrt(distSq);
        // Perfectly concentric bodies have no defined normal; pick one.
        const nx = dist > EPS ? dx / dist : 1;
        const ny = dist > EPS ? dy / dist : 0;
        const overlap = sum - dist;

        const ma = massOf(a);
        const mb = massOf(b);
        const invA = 1 / ma;
        const invB = 1 / mb;
        const invSum = invA + invB;

        // --- positional correction, inverse-mass weighted ---
        const correction = overlap * positional * (1 + extra);
        a.x -= nx * correction * (invA / invSum);
        a.y -= ny * correction * (invA / invSum);
        b.x += nx * correction * (invB / invSum);
        b.y += ny * correction * (invB / invSum);

        // --- velocity response, normal impulse with restitution ---
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const along = rvx * nx + rvy * ny;
        if (along > 0) return true;               // already separating
        const impulse = (-(1 + restitution) * along) / invSum;
        a.vx -= impulse * nx * invA;
        a.vy -= impulse * ny * invA;
        b.vx += impulse * nx * invB;
        b.vy += impulse * ny * invB;
        return true;
    }

    /**
     * Push a circle back inside a circular arena and mirror its velocity
     * along the inward normal. Returns true when a wall was hit.
     *
     * Unlike a positional clamp this reflects the tangential velocity, so a
     * body shoved at a wall slides along it instead of sticking to it.
     */
    function reflectCircleFromWall(body, center, arenaRadius, restitution = 0.6) {
        const dx = body.x - center.x;
        const dy = body.y - center.y;
        const dist = Math.hypot(dx, dy);
        const limit = Math.max(0, arenaRadius - (body.radius || 0));
        if (dist <= limit || dist < EPS) return false;

        const nx = dx / dist;
        const ny = dy / dist;
        body.x = center.x + nx * limit;
        body.y = center.y + ny * limit;

        const along = body.vx * nx + body.vy * ny;
        if (along > 0) {
            // Remove the outward component, mirror it back in.
            body.vx -= (1 + restitution) * along * nx;
            body.vy -= (1 + restitution) * along * ny;
        }
        return true;
    }

    /**
     * Legacy helper kept for existing callers: hard-clamp a body inside a
     * circle. Prefer `reflectCircleFromWall`, which also preserves motion.
     */
    function keepInside(body, center, radius, padding = 0) {
        const dx = body.x - center.x;
        const dy = body.y - center.y;
        const distance = Math.hypot(dx, dy);
        const limit = Math.max(0, radius - padding);
        if (distance > limit) {
            const scale = distance > EPS ? limit / distance : 0;
            body.x = center.x + dx * scale;
            body.y = center.y + dy * scale;
            body.vx *= 0.25;
            body.vy *= 0.25;
            return false;
        }
        return true;
    }

    /**
     * Map a world point to screen pixels.
     *
     * The arena centre is always pinned to the canvas centre, whatever the
     * render scale is. Scaling raw coordinates about the top-left origin
     * would drag every body toward the corner as soon as the arena grew
     * large enough for `arenaFitScale` to return < 1.
     */
    function worldToScreen(wx, wy, cx, cy, scale) {
        const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
        return [cx + (wx - 400) * s, cy + (wy - 300) * s];
    }

    window.NeonSystems = window.NeonSystems || {};
    window.NeonSystems.physics = {
        clamp,
        resolveImpulse,
        resolveCirclePair,
        reflectCircleFromWall,
        keepInside,
        damp,
        dampSeconds,
        capSpeed,
        worldToScreen
    };
})();