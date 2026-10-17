/* =============================================================
   NEXUS CORP — Executive Managers
   Hiring a manager permanently AUTOMATES a department: it auto-buys
   levels whenever affordable, and unlocks that department to auto-level.
   ============================================================= */

import { DEPARTMENTS, deptCost } from './departments.js';

export const MANAGER_HIRE_COST = 750000;   // $750K cash to hire any manager
export const MANAGER_COST_GROWTH = 2.6;    // each additional hire in the same company

/** Every manager maps 1:1 onto a department, and costs more as you hire more. */
export function managerCost(hiredCount) {
  return MANAGER_HIRE_COST * Math.pow(MANAGER_COST_GROWTH, hiredCount);
}

const TITLES = [
  'Founder / Freelancer',
  'Agency Director',
  'Studio Head',
  'Chief SaaS Officer',
  'Security Director',
  'AI Lab Principal',
  'Quantum Lead',
  'Robotics Plant Chief',
  'Orbital Network GM',
  'Singularity Custodian'
];

const TITLES_AR = [
  'المؤسس / مستقل',
  'مدير وكالة',
  'رئيس الاستوديو',
  'مدير SaaS التنفيذي',
  'مدير الأمن',
  'رئيس مختبر الذكاء الاصطناعي',
  'مسؤول الكم',
  'رئيس مصنع الروبوتات',
  'مدير شبكة المدار',
  'أمين التفرد'
];

const SIGILS = ['👤', '📊', '🎬', '☁️', '🔐', '🔬', '⚛️', '🏭', '🛰️', '🌌'];

export const MANAGER_BY_DEPT = Object.fromEntries(DEPARTMENTS.map((d, i) => [d.id, {
  deptId: d.id,
  title: TITLES[i],
  titleAr: TITLES_AR[i],
  sigil: SIGILS[i]
}]));

/**
 * Auto-buys one level for every automated department when affordable.
 * Mutates { cash, deptLevels }. Returns the departments that were bought.
 * One level per department per tick keeps the maths deterministic and testable.
 */
export function runAutoBuyers(cash, deptLevels, hired, costGrowth = MANAGER_COST_GROWTH) {
  const bought = [];
  let spent = 0;
  for (const def of DEPARTMENTS) {
    if (!hired[def.id]) continue;
    const cost = deptCost(def, deptLevels[def.id] || 0) * costGrowth;
    if (spent + cost <= cash) {
      spent += cost;
      deptLevels[def.id] = (deptLevels[def.id] || 0) + 1;
      bought.push(def.id);
    }
  }
  return { cash: cash - spent, bought };
}