(() => {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  /**
   * Linear interpolation toward a target value.
   * Uses a time constant approach for smooth, predictable acceleration.
   * @param {number} current - Current value
   * @param {number} target - Target value to approach
   * @param {number} timeConstant - Time constant in seconds (0.3-0.5 for realistic feel)
   * @param {number} dt - Delta time in seconds
   * @returns {number} - New interpolated value
   */
  function lerp(current, target, timeConstant, dt) {
    const factor = 1 - Math.exp(-dt / Math.max(0.001, timeConstant));
    return current + (target - current) * factor;
  }

  /**
   * Apply friction to velocity - body slides then stops, doesn't dead-stop.
   * @param {number} vx - Current X velocity
   * @param {number} vy - Current Y velocity
   * @param {number} friction - Friction coefficient (higher = more drag, 0-1 range)
   * @returns {{vx: number, vy: number}} - New velocity after friction
   */
  function applyFriction(vx, vy, friction) {
    const speed = Math.hypot(vx, vy);
    if (speed < 0.01) return { vx: 0, vy: 0 };
    const newSpeed = Math.max(0, speed - friction);
    const ratio = speed > 0 ? newSpeed / speed : 0;
    return { vx: vx * ratio, vy: vy * ratio };
  }

  /**
   * Rotate current angle toward target angle at max rotation speed.
   * @param {number} current - Current angle in radians
   * @param {number} target - Target angle in radians
   * @param {number} maxRotation - Maximum rotation per second (radians)
   * @param {number} dt - Delta time in seconds
   * @returns {number} - New angle
   */
  function rotateToward(current, target, maxRotation, dt) {
    let diff = target - current;
    // Normalize difference to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // Clamp rotation
    const maxRot = maxRotation * dt;
    diff = clamp(diff, -maxRot, maxRot);
    return current + diff;
  }

  /**
   * Calculate acceleration based on input direction and body stats.
   * @param {number} inputX - Normalized input X (-1 to 1)
   * @param {number} inputY - Normalized input Y (-1 to 1)
   * @param {number} accel - Acceleration rate (units per second squared)
   * @param {number} maxSpeed - Maximum speed (units per second)
   * @param {number} currentVx - Current velocity X
   * @param {number} currentVy - Current velocity Y
   * @param {number} dt - Delta time in seconds
   * @returns {{vx: number, vy: number}} - New velocity after acceleration
   */
  function accelerate(inputX, inputY, accel, maxSpeed, currentVx, currentVy, dt) {
    if (inputX === 0 && inputY === 0) {
      // No input - apply drag, but let physics module handle friction separately
      return { vx: currentVx, vy: currentVy };
    }

    // Calculate desired velocity from input
    const desiredVx = inputX * maxSpeed;
    const desiredVy = inputY * maxSpeed;

    // Apply acceleration as lerp toward desired velocity
    // Time constant gives us smooth 0.3-0.5s approach to top speed
    const timeConstant = 0.4; // seconds to reach ~63% of target
    const newVx = lerp(currentVx, desiredVx, timeConstant, dt);
    const newVy = lerp(currentVy, desiredVy, timeConstant, dt);

    // Clamp to max speed
    const speed = Math.hypot(newVx, newVy);
    if (speed > maxSpeed && speed > 0.001) {
      const scale = maxSpeed / speed;
      return { vx: newVx * scale, vy: newVy * scale };
    }

    return { vx: newVx, vy: newVy };
  }

  /**
   * Clamp velocity magnitude to a maximum.
   * @param {number} vx - Velocity X
   * @param {number} vy - Velocity Y
   * @param {number} maxSpeed - Maximum speed
   * @returns {{vx: number, vy: number}} - Clamped velocity
   */
  function clampVelocity(vx, vy, maxSpeed) {
    const speed = Math.hypot(vx, vy);
    if (speed > maxSpeed && speed > 0.001) {
      const scale = maxSpeed / speed;
      return { vx: vx * scale, vy: vy * scale };
    }
    return { vx, vy };
  }

  /**
   * Calculate the relative facing angle for impact calculation.
   * Returns the cosine of the angle between facing direction and impact direction.
   * @param {number} facingAngle - Body's facing angle in radians
   * @param {number} impactAngle - Angle of impact (direction from attacker to defender)
   * @returns {number} - Cosine of angle (-1 to 1), where 1 = direct front hit
   */
  function impactAngleFactor(facingAngle, impactAngle) {
    // Impact comes from the direction of the other body
    // Facing direction points where the body is moving/traveling
    // Cosine tells us how direct the hit is based on orientation
    const relAngle = Math.abs(facingAngle - impactAngle);
    const normalizedAngle = Math.min(relAngle, Math.PI * 2 - relAngle);
    // Cosine of angle: 1 = same direction, 0 = perpendicular, -1 = opposite
    // For impact: we want 1 when attacker faces the target directly
    return Math.cos(normalizedAngle);
  }

  /**
   * Calculate impact force based on physical properties.
   * @param {number} relativeSpeed - Closing speed between bodies
   * @param {number} impactFactor - Impact angle factor (0 to 1, where 1 is direct hit)
   * @param {number} attackerMass - Attacker's mass
   * @param {number} targetMass - Target's mass
   * @param {number} basePower - Base power multiplier
   * @returns {number} - Calculated impact force
   */
  function calculateImpactForce(relativeSpeed, impactFactor, attackerMass, targetMass, basePower) {
    // Only apply force if impact is from the front (positive factor)
    if (impactFactor <= 0) return 0;

    // Force = speed × angle × mass ratio × power
    // Mass ratio: heavier attacks push more against lighter targets
    const massRatio = attackerMass / Math.max(0.5, targetMass);
    const force = relativeSpeed * impactFactor * massRatio * basePower;

    return Math.max(0, force);
  }

  /**
   * Apply knockback impulse to both attacker and target.
   * @param {object} attacker - Attacker body object
   * @param {object} target - Target body object
   * @param {number} impactAngle - Angle of impact (from attacker to target)
   * @param {number} force - Impact force magnitude
   */
  function applyKnockback(attacker, target, impactAngle, force) {
    const cos = Math.cos(impactAngle);
    const sin = Math.sin(impactAngle);

    // Target receives full knockback
    const targetImpulse = force / Math.max(0.1, target.mass || 1);
    target.vx = (target.vx || 0) + cos * targetImpulse;
    target.vy = (target.vy || 0) + sin * targetImpulse;

    // Attacker receives recoil based on their mass (lighter = more recoil)
    const attackerRecoil = force / Math.max(0.5, attacker.mass || 1) * 0.25; // 25% recoil
    attacker.vx = (attacker.vx || 0) - cos * attackerRecoil;
    attacker.vy = (attacker.vy || 0) - sin * attackerRecoil;
  }

  // Keep existing helper functions for compatibility
  function resolveImpulse(body, force, direction, resistance = 1) {
    const length = Math.hypot(direction.x, direction.y) || 1;
    const scale = force / length / Math.max(.1, resistance);
    body.vx += direction.x * scale;
    body.vy += direction.y * scale;
    return body;
  }

  function keepInside(body, center, radius, padding = 0) {
    const dx = body.x - center.x;
    const dy = body.y - center.y;
    const distance = Math.hypot(dx, dy);
    const limit = Math.max(0, radius - padding);
    if (distance > limit) {
      const scale = limit / distance;
      body.x = center.x + dx * scale;
      body.y = center.y + dy * scale;
      body.vx *= .25;
      body.vy *= .25;
      return false;
    }
    return true;
  }

  function damp(body, factor, delta = 1) {
    const amount = Math.pow(clamp(factor, 0, 1), delta);
    body.vx *= amount;
    body.vy *= amount;
    return body;
  }

  // Export enhanced physics system
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.physics = {
    clamp,
    lerp,
    applyFriction,
    rotateToward,
    accelerate,
    clampVelocity,
    impactAngleFactor,
    calculateImpactForce,
    applyKnockback,
    resolveImpulse,
    keepInside,
    damp
  };
})();