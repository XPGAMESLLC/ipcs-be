export function makeUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Converts a UUID string (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) into a 16-byte Uint8Array.
 * @param uuid A valid UUID string.
 * @throws If the input is not a 36-char UUID.
 */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: expected 36 chars with hyphens, got "${uuid}"`);
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Converts a 16-byte Uint8Array back into a UUID string.
 * @param bytes A Uint8Array of length 16.
 * @throws If the input array is not exactly 16 bytes.
 */
export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`Invalid byte array: expected length 16, got ${bytes.length}`);
  }

  // Convert each byte to hex, pad single-digit with leading zero
  const hex: string[] = Array.from(bytes, b => b.toString(16).padStart(2, '0'));

  return hex.join('');
}