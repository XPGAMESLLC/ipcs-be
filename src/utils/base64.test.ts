import Base64, { Base64OutputStream, Base64InputStream } from './base64';

describe('Base64', () => {
  it('should encode and decode ASCII strings', () => {
    const str = 'Hello, World!';
    const encoded = Base64.encode(str);
    expect(encoded).toBe('SGVsbG8sIFdvcmxkIQ==');
    const decoded = Base64.decode(encoded);
    expect(decoded).toBe(str);
  });

  it('should handle empty string', () => {
    expect(Base64.encode('')).toBe('');
    expect(Base64.decode('')).toBe('');
  });

  it('should encode and decode bytes correctly', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const encoded = Base64.encodeBytes(bytes);
    const decoded = Base64.decodeToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('should handle padding correctly', () => {
    expect(Base64.encode('A')).toBe('QQ==');
    expect(Base64.decode('QQ==')).toBe('A');
    expect(Base64.decode('QQ')).toBe('A');
    expect(Base64.encode('AB')).toBe('QUI=');
    expect(Base64.decode('QUI=')).toBe('AB');
    expect(Base64.decode('QUI')).toBe('AB');
  });
});

describe('Base64OutputStream and InputStream', () => {
  it('should write and read primitive types', () => {
    const out = new Base64OutputStream();
    out.writeByte(255);
    out.writeShort(256);
    out.writeInt(65536);
    out.writeFloat(3.14);
    out.writeDouble(2.718281828459045);
    out.writeUTF('test');
    const encoded = out.toString();

    const inp = new Base64InputStream(encoded);
    expect(inp.readByte()).toBe(255);
    expect(inp.readShort()).toBe(256);
    expect(inp.readInt()).toBe(65536);
    expect(inp.readFloat()).toBeCloseTo(3.14, 5);
    expect(inp.readDouble()).toBeCloseTo(2.718281828459045, 10);
    expect(inp.readUTF()).toBe('test');
    expect(inp.remaining).toBe(0);
  });

  it('should throw on out-of-range writes and EOF reads', () => {
    const out = new Base64OutputStream();
    expect(() => out.writeByte(256)).toThrow(RangeError);
    expect(() => out.writeShort(-1)).toThrow(RangeError);
    expect(() => out.writeInt(1.5)).toThrow(RangeError);

    const inp = new Base64InputStream('');
    expect(() => inp.readByte()).toThrow(RangeError);
    expect(inp.remaining).toBe(0);
  });

  // Add tests for writeBytes and readBytes
  it('should writeBytes and readBytes arrays correctly', () => {
    const arr = new Uint8Array([10, 20, 30, 40, 50]);
    const out = new Base64OutputStream();
    out.writeBytes(arr);
    const encoded = out.toString();

    const inp = new Base64InputStream(encoded);
    const result = inp.readBytes(arr.length);
    expect(result).toEqual(arr);
    expect(inp.remaining).toBe(0);
  });

  it('readBytes should throw on EOF when requesting too many bytes', () => {
    const arr = new Uint8Array([1, 2, 3]);
    const out = new Base64OutputStream();
    out.writeBytes(arr);
    const encoded = out.toString();

    const inp = new Base64InputStream(encoded);
    expect(() => inp.readBytes(arr.length + 1)).toThrow(RangeError);
    expect(inp.remaining).toBe(0);
  });

  it('should handle empty writeBytes and readBytes', () => {
    const out = new Base64OutputStream();
    out.writeBytes(new Uint8Array([]));
    const encoded = out.toString();
    expect(encoded).toBe('');

    const inp = new Base64InputStream(encoded);
    const result = inp.readBytes(0);
    expect(result).toEqual(new Uint8Array());
    expect(inp.remaining).toBe(0);
  });
});