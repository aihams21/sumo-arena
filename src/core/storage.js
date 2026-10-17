/* Nexus Corp — localStorage persistence, offline progress, save import/export */

export const SAVE_KEY = 'nexus_corp_save_v1';
export const SAVE_VERSION = 1;
export const AUTOSAVE_MS = 5000;

/** Offline earnings are capped so the player cannot idle-bank forever. */
export const OFFLINE_CAP_SECONDS = 60 * 60 * 8; // 8 hours
/** Only automated departments produce anything while offline. */
export const OFFLINE_EFFICIENCY = 0.5;          // 50% of online rate

export function nowMs() { return Date.now(); }

/** Compute offline earnings purely from (rate, elapsedSeconds). Pure fn — unit tested. */
export function computeOfflineEarnings(ratePerSec, elapsedSeconds, capSeconds = OFFLINE_CAP_SECONDS, efficiency = OFFLINE_EFFICIENCY) {
  const s = Math.max(0, Number(elapsedSeconds) || 0);
  const capped = Math.min(s, Math.max(0, capSeconds));
  const earned = Math.max(0, Number(ratePerSec) || 0) * capped * efficiency;
  return { earned, usedSeconds: capped, wasCapped: s > capped, realSeconds: s };
}

export function saveRaw(state) {
  try {
    const payload = { v: SAVE_VERSION, t: nowMs(), s: state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('[Storage] save failed', e);
    return false;
  }
}

export function loadRaw() {
  try {
    const txt = localStorage.getItem(SAVE_KEY);
    if (!txt) return null;
    const payload = JSON.parse(txt);
    if (!payload || payload.v !== SAVE_VERSION || !payload.s) return null;
    return { state: payload.s, savedAt: payload.t || nowMs() };
  } catch (e) {
    console.warn('[Storage] load failed', e);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
}

/** Export as a portable base64 string (btoa over UTF-8 safe encoding). */
export function exportSave(state) {
  const json = JSON.stringify({ v: SAVE_VERSION, t: nowMs(), s: state });
  const utf8 = unescape(encodeURIComponent(json));
  return btoa(utf8);
}

/** Inverse of exportSave. Returns the state object or throws. */
export function importSave(str) {
  if (!str || typeof str !== 'string') throw new Error('empty save string');
  const cleaned = str.trim().replace(/^NEXUS:/i, '');
  const json = decodeURIComponent(escape(atob(cleaned)));
  const payload = JSON.parse(json);
  if (!payload || payload.v !== SAVE_VERSION || !payload.s || typeof payload.s !== 'object') {
    throw new Error('bad save payload');
  }
  return { state: payload.s, savedAt: payload.t || nowMs() };
}