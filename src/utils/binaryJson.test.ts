import { BinaryJSON } from "./binaryJson";
import { Base64OutputStream } from "./base64";

describe("binaryJson", () => {
  it("roundtrips simple object with primitive values", () => {
    const obj = { num: 42, str: "hello", bool: true, nil: null };
    const b64 = BinaryJSON.serialize(obj);
    const out = BinaryJSON.deserialize(b64);
    expect(out).toEqual(obj);
  });

  it("handles nested objects and arrays", () => {
    const obj = {
      arr: [1, "two", false, null, [3, 4], { nested: "x" }],
      inner: { a: { b: [true, { c: 5 }] } },
    };
    const round = BinaryJSON.deserialize(BinaryJSON.serialize(obj));
    expect(round).toEqual(obj);
  });

  it("serializes and deserializes empty object and array values", () => {
    const obj = { emptyObj: {}, emptyArr: [] };
    expect(BinaryJSON.deserialize(BinaryJSON.serialize(obj))).toEqual(obj);
  });

  it("throws on unsupported types in serialize", () => {
    const bad = { fn: () => {} } as any;
    expect(() => BinaryJSON.serialize(bad)).toThrow(/Unsupported type/);
  });

  it("throws on unknown root tag", () => {
    // create a stream with an invalid initial tag
    const out = new Base64OutputStream();
    out.writeByte(99);
    const b64 = out.toString();
    expect(() => BinaryJSON.deserialize(b64)).toThrow(/Unknown tag/);
  });

  it("throws on invalid object key tag", () => {
    // build object: Object tag, then non-string tag instead of key, then End
    const out = new Base64OutputStream();
    out.writeByte(5); // Tag.Object
    out.writeByte(2); // Tag.Number: invalid key
    out.writeDouble(123);
    out.writeByte(6); // Tag.End
    const b64 = out.toString();
    expect(() => BinaryJSON.deserialize(b64)).toThrow(/Invalid object key tag/);
  });

  it("throws on truncated input (EOF)", () => {
    const full = BinaryJSON.serialize({ a: 1, b: 2 });
    // remove more than just padding so data is truly truncated
    const truncated = full.slice(0, full.length - 4);
    expect(() => BinaryJSON.deserialize(truncated)).toThrow(RangeError);
  });

  it("preserves number precision (to close tolerance)", () => {
    const obj = { pi: 3.141592653589793, e: 2.718281828459045 };
    const out = BinaryJSON.deserialize(BinaryJSON.serialize(obj));
    expect(out.pi).toBeCloseTo(obj.pi, 12);
    expect(out.e).toBeCloseTo(obj.e, 12);
  });

  it("throws on circular references", () => {
    const a: any = {};
    a.self = a;
    expect(() => BinaryJSON.serialize(a)).toThrow(/Circular reference/);

    const x: any[] = [];
    x.push(x);
    expect(() => BinaryJSON.serialize({ arr: x })).toThrow(
      /Circular reference/
    );
  });
});
