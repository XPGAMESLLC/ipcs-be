export default class Base64 {
    private static readonly _alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    private static readonly _pad = "=";

    /* UTF-8 encode/decode helpers for ES2023-only environments */
    public static utf8Encode(str: string): Uint8Array {
        const bytes: number[] = [];
        for (const ch of str) {
            const cp = ch.codePointAt(0)!;
            if (cp <= 0x7F) {
                bytes.push(cp);
            } else if (cp <= 0x7FF) {
                bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
            } else if (cp <= 0xFFFF) {
                bytes.push(
                    0xE0 | (cp >> 12),
                    0x80 | ((cp >> 6) & 0x3F),
                    0x80 | (cp & 0x3F)
                );
            } else {
                bytes.push(
                    0xF0 | (cp >> 18),
                    0x80 | ((cp >> 12) & 0x3F),
                    0x80 | ((cp >> 6) & 0x3F),
                    0x80 | (cp & 0x3F)
                );
            }
        }
        return new Uint8Array(bytes);
    }

    public static utf8Decode(bytes: Uint8Array): string {
        let str = "";
        for (let i = 0; i < bytes.length; ) {
            const b1 = bytes[i++];
            if (b1 < 0x80) {
                str += String.fromCodePoint(b1);
            } else if (b1 < 0xE0) {
                const b2 = bytes[i++];
                str += String.fromCodePoint(((b1 & 0x1F) << 6) | (b2 & 0x3F));
            } else if (b1 < 0xF0) {
                const b2 = bytes[i++], b3 = bytes[i++];
                str += String.fromCodePoint(
                    ((b1 & 0x0F) << 12) |
                    ((b2 & 0x3F) << 6) |
                    (b3 & 0x3F)
                );
            } else {
                const b2 = bytes[i++], b3 = bytes[i++], b4 = bytes[i++];
                str += String.fromCodePoint(
                    ((b1 & 0x07) << 18) |
                    ((b2 & 0x3F) << 12) |
                    ((b3 & 0x3F) << 6) |
                    (b4 & 0x3F)
                );
            }
        }
        return str;
    }

    /* ------------------------------------------------------------------ */
    /* Low-level byte-wise codec                                          */
    /* ------------------------------------------------------------------ */

    /** Encode raw bytes (Uint8Array) -> Base-64 text. */
    public static encodeBytes(bytes: Uint8Array): string {
        let out = "";
        let i = 0;
        while (i < bytes.length) {
            const b1 = bytes[i++] ?? NaN;
            const b2 = bytes[i++] ?? NaN;
            const b3 = bytes[i++] ?? NaN;

            const enc1 = b1 >> 2;
            const enc2 = ((b1 & 0x03) << 4) | (b2 >> 4);
            const enc3 = isNaN(b2) ? 64 : (((b2 & 0x0F) << 2) | (b3 >> 6));
            const enc4 = isNaN(b3) ? 64 : (b3 & 0x3F);

            out += Base64._alphabet.charAt(enc1);
            out += Base64._alphabet.charAt(enc2);
            out += enc3 === 64 ? Base64._pad : Base64._alphabet.charAt(enc3);
            out += enc4 === 64 ? Base64._pad : Base64._alphabet.charAt(enc4);
        }
        return out;
    }

    /** Decode Base-64 text -> raw bytes (Uint8Array). */
    public static decodeToBytes(base64: string): Uint8Array {
        // Remove whitespace & non-alphabet chars
        base64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
        const byteLen = (base64.length / 4) * 3 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
        const bytes = new Uint8Array(byteLen);
        let byteIdx = 0, i = 0;
        while (i < base64.length) {
            const enc1 = Base64._alphabet.indexOf(base64.charAt(i++));
            const enc2 = Base64._alphabet.indexOf(base64.charAt(i++));
            const enc3 = Base64._alphabet.indexOf(base64.charAt(i++));
            const enc4 = Base64._alphabet.indexOf(base64.charAt(i++));

            const b1 = (enc1 << 2) | (enc2 >> 4);
            const b2 = ((enc2 & 0x0F) << 4) | (enc3 >> 2);
            const b3 = ((enc3 & 0x03) << 6) | enc4;

            bytes[byteIdx++] = b1;
            if (enc3 !== 64 && byteIdx < byteLen) bytes[byteIdx++] = b2;
            if (enc4 !== 64 && byteIdx < byteLen) bytes[byteIdx++] = b3;
        }
        return bytes;
    }

    /* ------------------------------------------------------------------ */
    /* Convenience wrappers for regular JS strings (UTF-8)                */
    /* ------------------------------------------------------------------ */

    /** Encode a JS string to Base-64 using UTF-8. */
    public static encode(str: string): string {
        const bytes = Base64.utf8Encode(str);
        return Base64.encodeBytes(bytes);
    }

    /** Decode Base-64 to a JS string using UTF-8. */
    public static decode(base64: string): string {
        const bytes = Base64.decodeToBytes(base64);
        return Base64.utf8Decode(bytes);
    }

    /* ------------------------------------------------------------------ */
    /* Helper factories                                                   */
    /* ------------------------------------------------------------------ */

    public static createOutputStream(): Base64OutputStream {
        return new Base64OutputStream();
    }
    public static createInputStream(encoded: string): Base64InputStream {
        return new Base64InputStream(encoded);
    }
}

/* ===================================================================== */
/* Streaming writer                                                      */
/* ===================================================================== */
export class Base64OutputStream {
    private readonly _buf: number[] = [];
    public get length(): number { return this._buf.length; }

    public writeBytes(arr: Uint8Array): void {
        for (let i = 0; i < arr.length; i++) {
            this.writeByte(arr[i]);
        }
    }

    /* ---------- range-checked primitives ---------- */
    public writeByte(v: number): void {
        if (!Number.isInteger(v) || v < 0 || v > 0xFF) throw new RangeError("byte 0-255");
        this._buf.push(v);
    }
    public writeShort(v: number): void {
        if (!Number.isInteger(v) || v < 0 || v > 0xFFFF) throw new RangeError("short 0-65535");
        this.writeByte((v >>> 8) & 0xFF); this.writeByte(v & 0xFF);
    }
    public writeInt(v: number): void {
        if (!Number.isInteger(v) || v < 0 || v > 0xFFFFFFFF) throw new RangeError("int 0-4294967295");
        this.writeByte((v >>> 24) & 0xFF); this.writeByte((v >>> 16) & 0xFF); this.writeByte((v >>> 8) & 0xFF); this.writeByte(v & 0xFF);
    }

    /* ---------- IEEE-754 ---------- */
    public writeFloat(v: number): void {
        const dv = new DataView(new ArrayBuffer(4));
        dv.setFloat32(0, v, false);
        for (let i = 0; i < 4; i++) this.writeByte(dv.getUint8(i));
    }
    public writeDouble(v: number): void {
        const dv = new DataView(new ArrayBuffer(8));
        dv.setFloat64(0, v, false);
        for (let i = 0; i < 8; i++) this.writeByte(dv.getUint8(i));
    }

    /* ---------- strings ---------- */
    public writeUTF(str: string): void {
        const bytes = Base64.utf8Encode(str);
        this.writeShort(bytes.length);
        for (const b of bytes) this.writeByte(b);
    }

    /** Finalize & return Base-64. */
    public toString(): string {
        return Base64.encodeBytes(Uint8Array.from(this._buf));
    }
}

/* ===================================================================== */
/* Streaming reader                                                      */
/* ===================================================================== */
export class Base64InputStream {
    private readonly _bytes: Uint8Array;
    private _pos = 0;
    constructor(encoded: string) {
        this._bytes = Base64.decodeToBytes(encoded);
    }
    private _need(n: number) { if (this._pos + n > this._bytes.length) throw new RangeError("EOF"); }

    public readBytes(n: number): Uint8Array {
        const arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            arr[i] = this.readByte();
        }
        return arr;
    }
    public readByte(): number { this._need(1); return this._bytes[this._pos++]; }
    public readShort(): number { return (this.readByte() << 8) | this.readByte(); }
    public readInt(): number { return (this.readByte() << 24) | (this.readByte() << 16) | (this.readByte() << 8) | this.readByte(); }
    public readFloat(): number {
        this._need(4); const dv = new DataView(this._bytes.buffer, this._bytes.byteOffset + this._pos, 4);
        const v = dv.getFloat32(0, false); this._pos += 4; return v; }
    public readDouble(): number {
        this._need(8); const dv = new DataView(this._bytes.buffer, this._bytes.byteOffset + this._pos, 8);
        const v = dv.getFloat64(0, false); this._pos += 8; return v; }
    public readUTF(): string {
        const len = this.readShort(); this._need(len);
        const slice = this._bytes.subarray(this._pos, this._pos + len);
        this._pos += len; 
        return Base64.utf8Decode(slice);
    }
    public get remaining(): number { return this._bytes.length - this._pos; }
}