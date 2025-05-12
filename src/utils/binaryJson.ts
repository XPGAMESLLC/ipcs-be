import { Base64OutputStream, Base64InputStream } from "./base64";

const enum Tag {
  Null = 0,
  Boolean = 1,
  Number = 2,
  String = 3,
  Array = 4,
  Object = 5,
  End = 6,
}

export class BinaryJSON {
  /** Serialize a JS value to Base64 using simple binary JSON spec. */
  public static serialize(obj: Record<string, any>): string {
    const stream = new Base64OutputStream();
    const seen = new WeakSet<any>();
    this.writeValue(stream, obj, seen);
    return stream.toString();
  }

  /** Deserialize a Base64 string into a JS value. */
  public static deserialize(encoded: string): any {
    const stream = new Base64InputStream(encoded);
    const tag = stream.readByte();
    const value = this.readFromTag(tag, stream);
    if (stream.remaining !== 0) throw new RangeError("Truncated input");
    return value;
  }

  private static writeValue(
    stream: Base64OutputStream,
    value: any,
    seen: WeakSet<any>
  ): void {
    if (value === null) {
      stream.writeByte(Tag.Null);
    } else if (typeof value === "boolean") {
      stream.writeByte(Tag.Boolean);
      stream.writeByte(value ? 1 : 0);
    } else if (typeof value === "number") {
      stream.writeByte(Tag.Number);
      stream.writeDouble(value);
    } else if (typeof value === "string") {
      stream.writeByte(Tag.String);
      stream.writeUTF(value);
    } else if (Array.isArray(value)) {
      if (seen.has(value)) throw new Error("Circular reference");
      seen.add(value);
      stream.writeByte(Tag.Array);
      for (const item of value) this.writeValue(stream, item, seen);
      stream.writeByte(Tag.End);
    } else if (typeof value === "object") {
      if (seen.has(value)) throw new Error("Circular reference");
      seen.add(value);
      stream.writeByte(Tag.Object);
      for (const key of Object.keys(value)) {
        stream.writeByte(Tag.String);
        stream.writeUTF(key);
        this.writeValue(stream, value[key], seen);
      }
      stream.writeByte(Tag.End);
    } else {
      throw new Error(`Unsupported type: ${typeof value}`);
    }
  }

  private static readFromTag(tag: number, stream: Base64InputStream): any {
    switch (tag) {
      case Tag.Null:
        return null;
      case Tag.Boolean: {
        const b = stream.readByte();
        return b === 1;
      }
      case Tag.Number:
        return stream.readDouble();
      case Tag.String:
        return stream.readUTF();
      case Tag.Array: {
        const arr: any[] = [];
        for (;;) {
          const next = stream.readByte();
          if (next === Tag.End) break;
          arr.push(this.readFromTag(next, stream));
        }
        return arr;
      }
      case Tag.Object: {
        const obj: Record<string, any> = {};
        for (;;) {
          const next = stream.readByte();
          if (next === Tag.End) break;
          if (next !== Tag.String)
            throw new Error("Invalid object key tag: " + next);
          const key = stream.readUTF();
          const valTag = stream.readByte();
          obj[key] = this.readFromTag(valTag, stream);
        }
        return obj;
      }
      default:
        throw new Error("Unknown tag: " + tag);
    }
  }
}
