export const DEFAULT_BONUS_EXCLUSIONS = ['Shift-Incharge', 'Security', 'Housekeeping'];
export const normalizeBonusRole = (role: string) =>
  role
    .trim()
    .toLowerCase()
    .replace(/^fr[_ -]+/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace('securiity', 'security');
export const exactBonusRole = (role: string) => role.trim().toLowerCase();
export function roleEarnsBonus(role: string, exclusions = DEFAULT_BONUS_EXCLUSIONS, exact = false) {
  if (exact) return !exclusions.some((entry) => exactBonusRole(entry) === exactBonusRole(role));
  const normalized = normalizeBonusRole(role);
  return !exclusions.some((entry) => normalized.includes(normalizeBonusRole(entry)));
}
export function validateBonusExclusions(roles: string[], exact = false) {
  const cleaned = roles.map((role) => role.trim());
  if (cleaned.some((role) => !normalizeBonusRole(role) || role.length > 100))
    throw new Error('Enter a role name of 1–100 characters.');
  if (new Set(cleaned.map(exact ? exactBonusRole : normalizeBonusRole)).size !== cleaned.length)
    throw new Error('This role is already listed.');
  return cleaned;
}
