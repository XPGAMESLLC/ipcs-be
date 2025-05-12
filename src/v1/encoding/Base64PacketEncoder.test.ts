import { Base64PacketEncoder } from "./Base64PacketEncoder";
import { EncHeader } from "../envelope";
import Base64 from "../../utils/base64";

describe("Base64PacketEncoder", () => {
  const encoder = new Base64PacketEncoder();
  const headerId = "00112233445566778899aabbccddeeff"; // 16 bytes hex
  test("encode/decode payload roundtrip", () => {
    const payload = { foo: "bar", n: 123 };
    const encoded = encoder.encode(payload);
    // raw JSON to Base64
    const expected = Base64.encode(JSON.stringify(payload));
    expect(encoded).toBe(expected);
    const decoded = encoder.decode(encoded);
    expect(decoded).toEqual(payload);
  });

  test("encodeHeader/decodeHeader without fragment", () => {
    const header: EncHeader = { id: headerId };
    const rawHdr = encoder.encodeHeader(header);
    const parsed = encoder.decodeHeader(rawHdr);
    expect(parsed).toEqual({ id: headerId });
  });

  test("encodeHeader/decodeHeader with fragment", () => {
    const fragHeader: EncHeader = { id: headerId, frag: 2, last: false };
    const rawHdr = encoder.encodeHeader(fragHeader);
    const parsed = encoder.decodeHeader(rawHdr);
    expect(parsed).toEqual({ id: headerId, frag: 2, last: false });
  });

  test("decodeHeader returns null on invalid data", () => {
    expect(encoder.decodeHeader("notbase64")).toBeNull();
  });
});
