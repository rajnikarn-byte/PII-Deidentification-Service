/**
 * Structural SSN validation based on SSA rules:
 * area 000, 666 and 900-999 are never issued, group 00 and serial 0000 are invalid.
 */
export function isValidSsn(candidate: string): boolean {
  const digits = candidate.replace(/\D/gu, '');
  if (digits.length !== 9) {
    return false;
  }
  const area = Number(digits.slice(0, 3));
  const group = Number(digits.slice(3, 5));
  const serial = Number(digits.slice(5));
  if (area === 0 || area === 666 || area >= 900) {
    return false;
  }
  return group !== 0 && serial !== 0;
}
