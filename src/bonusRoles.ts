export const DEFAULT_BONUS_EXCLUSIONS = ['Shift-Incharge', 'Security', 'Housekeeping'];
export const normalizeBonusRole = (role: string) =>
  role
    .trim()
    .toLowerCase()
    .replace(/^fr[_ -]+/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace('securiity', 'security');
export function roleEarnsBonus(role: string, exclusions = DEFAULT_BONUS_EXCLUSIONS) {
  const normalized = normalizeBonusRole(role);
  return !exclusions.some((entry) => normalized.includes(normalizeBonusRole(entry)));
}
export function validateBonusExclusions(roles: string[]) {
  const cleaned = roles.map((role) => role.trim());
  if (cleaned.some((role) => !normalizeBonusRole(role) || role.length > 100))
    throw new Error('Enter a role name of 1–100 characters.');
  if (new Set(cleaned.map(normalizeBonusRole)).size !== cleaned.length)
    throw new Error('This role is already listed (spacing and FR_ prefixes are ignored).');
  return cleaned;
}
