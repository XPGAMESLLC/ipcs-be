import { buildEnvelope, RS, ETX } from "./envelope";

describe("buildEnvelope", () => {
  test("constructs envelope with meta, RS, enc header, ETX, and chunk", () => {
    const meta = { version: 1, encoding: "text" };
    const enc = "id123|5|0|1";
    const chunk = "hello";
    const env = buildEnvelope(meta, enc, chunk);
    const expected = `1|text${RS}${enc}${ETX}${chunk}`;
    expect(env).toBe(expected);
  });
});
