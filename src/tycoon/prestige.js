/* Nexus Corp — Prestige ("IPO / Going Public") */

export const PRESTIGE_REQUIREMENT = 1_000_000;   // $1M net worth
export const SHARE_GAIN_DIVISOR = 1_000_000;      // 1 share per $1M of current net worth
export const PER_SHARE_BONUS = 0.10;              // +10% per share

/** Permanent global income multiplier from Executive Shares. */
export function prestigeMultiplier(shares) {
  return 1 + Math.max(0, shares) * PER_SHARE_BONUS;
}

/** Shares awarded for resetting with the given net worth. */
export function sharesFor(netWorth) {
  if (!isFinite(netWorth) || netWorth < PRESTIGE_REQUIREMENT) return 0;
  return Math.max(1, Math.floor(netWorth / SHARE_GAIN_DIVISOR));
}

/** Can the player file an IPO right now? */
export function canPrestige(netWorth, shares) {
  return netWorth >= PRESTIGE_REQUIREMENT && sharesFor(netWorth) >= 1;
}

/** Fraction (0-1) of the requirement met — drives the progress bar. */
export function prestigeProgress(netWorth) {
  return Math.max(0, Math.min(1, netWorth / PRESTIGE_REQUIREMENT));
}

/** What a reset keeps vs wipes. */
export function prestigeResetShape() {
  return {
    keeps: ['shares', 'totalScoreAllTime', 'lang', 'settings', 'gameBest'],
    wipes: ['cash', 'deptLevels', 'upgradeLevels', 'hired', 'clickTotal', 'overclockUntil']
  };
}