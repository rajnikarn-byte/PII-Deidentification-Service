/**
 * Strict dotted-quad IPv4 validation: four decimal octets 0-255, no leading zeros
 * (leading zeros are ambiguous - some parsers treat them as octal).
 */
export function isValidIPv4(candidate: string): boolean {
  const octets = candidate.split('.');
  if (octets.length !== 4) {
    return false;
  }
  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false;
    }
    if (octet.length > 1 && octet.startsWith('0')) {
      return false;
    }
    return Number(octet) <= 255;
  });
}
