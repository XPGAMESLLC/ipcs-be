import { TextPacketEncoder } from "./TextPacketEncoder";

describe("TextPacketEncoder", () => {
  const encoder = new TextPacketEncoder();

  test("encode serializes object to JSON string", () => {
    const obj = { foo: "bar", n: 123 };
    const result = encoder.encode(obj);
    expect(result).toBe(JSON.stringify(obj));
  });

  test("encodeHeader produces id without fragments", () => {
    const header = { id: "abc123" };
    const hdr = encoder.encodeHeader(header);
    expect(hdr).toBe("abc123");
  });

  test("encodeHeader includes frag and last when present", () => {
    const header = { id: "xyz789", frag: 2, last: false };
    const hdr = encoder.encodeHeader(header);
    expect(hdr).toBe("xyz789|2|0");
  });

  test("decodeHeader parses id correctly", () => {
    const raw = "msgid";
    const hdr = encoder.decodeHeader(raw);
    expect(hdr).toEqual({ id: "msgid" });
  });

  test("decodeHeader parses frag and tot correctly", () => {
    const raw = "uid|1|0";
    const hdr = encoder.decodeHeader(raw);
    expect(hdr).toEqual({ id: "uid", frag: 1, last: false });
  });

  test("decodeHeader returns null for invalid input", () => {
    expect(encoder.decodeHeader("bad|header|data|extra|field")).toBeNull();
  });

  test("decode parses valid JSON body", () => {
    const body = JSON.stringify({ a: 1, b: "c" });
    expect(encoder.decode(body)).toEqual({ a: 1, b: "c" });
  });

  test("decode returns null on invalid JSON", () => {
    expect(encoder.decode("not json")).toBeNull();
  });
});