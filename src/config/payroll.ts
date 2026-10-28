/** Confirmed business defaults. Amounts are stored in paise. */
export const PAYROLL_DEFAULTS = {
  country: 'IN',
  currency: 'INR',
  timeZone: 'Asia/Kolkata',
  paymentDayOfFollowingMonth: 8,
  attendanceBonus: {
    amountMinor: 100_000,
    minimumFullPresentDays: 26,
    countHalfDays: false,
  },
} as const;

/** Only FR_ roles are included; add other eligible report roles to exactRoles. */
export const PAYROLL_ROLE_INCLUSIONS = {
  prefixes: ['FR_'],
  exactRoles: [] as string[],
} as const;

/** Canonical app categories, mapped separately from source report labels. */
export const ATTENDANCE_BONUS_EXCLUDED_CATEGORIES = [
  'shift-incharge',
  'security',
  'housekeeping',
] as const;
