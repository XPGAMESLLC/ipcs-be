import { makeUUID, uuidToBytes, bytesToUuid } from './uuid';

describe('UUID Utils', () => {
  it('makeUUID returns a valid UUID format', () => {
    const uuid = makeUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uuidToBytes and bytesToUuid round-trip correctly', () => {
    const original = '123e4567e89b12d3a456426614174000';
    const bytes = uuidToBytes(original);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(16);
    const reconstructed = bytesToUuid(bytes);
    expect(reconstructed).toBe(original);
  });

  it('uuidToBytes throws on invalid UUID string', () => {
    expect(() => uuidToBytes('invalid-uuid')).toThrow(Error);
    expect(() => uuidToBytes('1234')).toThrow(/Invalid UUID/);
  });

  it('bytesToUuid throws on invalid byte array length', () => {
    expect(() => bytesToUuid(new Uint8Array(15))).toThrow(Error);
    expect(() => bytesToUuid(new Uint8Array(17))).toThrow(/Invalid byte array/);
  });

  it('uuidToBytes converts zero UUID to zero byte array', () => {
    const zeroUuid = '00000000-0000-0000-0000-000000000000';
    const bytes = uuidToBytes(zeroUuid);
    expect(Array.from(bytes)).toEqual(Array(16).fill(0));
  });
});