const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_LABEL_LENGTH = 63;

/** Length and label checks (RFC 5321 / RFC 1035) on a regex-matched address. */
export function isValidEmail(candidate: string): boolean {
  if (candidate.length > MAX_EMAIL_LENGTH) {
    return false;
  }
  const at = candidate.lastIndexOf('@');
  if (at <= 0 || at === candidate.length - 1) {
    return false;
  }
  const local = candidate.slice(0, at);
  const domain = candidate.slice(at + 1);
  if (local.length > MAX_LOCAL_PART_LENGTH) {
    return false;
  }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }
  const labels = domain.split('.');
  if (labels.length < 2) {
    return false;
  }
  const tld = labels[labels.length - 1] ?? '';
  if (/^\d+$/u.test(tld)) {
    return false;
  }
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= MAX_LABEL_LENGTH &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}
