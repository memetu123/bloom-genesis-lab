/**
 * Plan Colors Utility
 * Generates consistent, subtle background colors for 90-day plans
 * Uses a limited neutral-friendly palette for accessibility
 */

// Neutral-friendly color palette (HSL values)
// These are muted colors that work well as subtle backgrounds
const PLAN_COLORS = [
  "210 40% 50%",   // Muted blue
  "160 35% 45%",   // Muted teal
  "280 30% 50%",   // Muted purple
  "30 45% 50%",    // Muted amber
  "340 35% 50%",   // Muted rose
  "190 40% 45%",   // Muted cyan
  "100 30% 45%",   // Muted green
  "250 35% 50%",   // Muted indigo
];

/**
 * Generates a consistent color index for a plan ID
 * Uses simple hash to ensure same plan always gets same color
 */
function hashPlanId(planId: string): number {
  let hash = 0;
  for (let i = 0; i < planId.length; i++) {
    const char = planId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get the HSL color string for a plan
 */
export function getPlanColor(planId: string): string {
  const index = hashPlanId(planId) % PLAN_COLORS.length;
  return PLAN_COLORS[index];
}

/**
 * Get the background style for a plan (desktop - 8% opacity for visibility)
 */
export function getPlanBgStyle(planId: string): string {
  const color = getPlanColor(planId);
  return `hsl(${color} / 0.08)`;
}

/**
 * Get the background style for a plan (mobile - 12% opacity for visibility)
 */
export function getPlanBgStyleMobile(planId: string): string {
  const color = getPlanColor(planId);
  return `hsl(${color} / 0.12)`;
}

/**
 * Create a map of plan IDs to their titles for tooltip display
 */
export function createPlanMap(goals: Array<{ id: string; title: string; goal_type: string }>): Map<string, string> {
  const planMap = new Map<string, string>();
  goals
    .filter(g => g.goal_type === "ninety_day")
    .forEach(g => planMap.set(g.id, g.title));
  return planMap;
}
