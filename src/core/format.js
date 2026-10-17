/* Nexus Corp — Number & Time Formatting Kernel */

const TIERS = [
  { v: 1e18, s: 'Qa' },
  { v: 1e15, s: 'Qi' },
  { v: 1e12, s: 'T' },
  { v: 1e9,  s: 'B' },
  { v: 1e6,  s: 'M' },
  { v: 1e3,  s: 'K' }
];

/**
 * Format a number into compact tiered notation: $1.25K, $4.50M, $8.90B, $1.20T, $5.00Qa
 */
export function formatMoney(n, opts = {}) {
  const { prefix = '$', signed = false, decimals = null } = opts;
  if (!isFinite(n)) return prefix + '∞';
  const neg = n < 0;
  let v = Math.abs(n);

  if (v < 1000) {
    let out;
    if (v < 10) out = trimZeros(v.toFixed(2));
    else if (v < 100) out = trimZeros(v.toFixed(1));
    else out = Math.floor(v).toString();
    return (neg ? '-' : signed ? '+' : '') + prefix + out;
  }

  let tier = null;
  for (const t of TIERS) {
    if (v >= t.v) { tier = t; break; }
  }
  const scaled = v / tier.v;
  const dec = decimals !== null ? decimals : (scaled < 10 ? 2 : scaled < 100 ? 1 : 0);
  const out = scaled.toFixed(dec) + tier.s;
  return (neg ? '-' : signed ? '+' : '') + prefix + out;
}

/** Per-second variant */
export function formatRate(n) { return formatMoney(n) + '/s'; }

/** Format a plain number (no currency) with same tiers */
export function formatNum(n) { return formatMoney(n, { prefix: '' }); }

/** Format raw multiplier like x1.25 */
export function formatMult(n) {
  return '×' + (Math.round(n * 1000) / 1000).toString();
}

/** mm:ss / h:mm:ss for durations */
export function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (x) => (x < 10 ? '0' + x : '' + x);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human readable "2h 15m" */
export function formatDurationLong(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function trimZeros(s) {
  return s.indexOf('.') === -1 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
}

/** Percentage 0-100 with 1 decimal */
export function formatPct(x) { return (Math.round(x * 10) / 10).toFixed(1) + '%'; }