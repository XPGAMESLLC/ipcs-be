import { EncHeader } from "../envelope";
import { IEncoder } from "./encoding";

/**
 * Text encoding implementation for IPCS-BE (UTF-16 JSON).
 */
export class TextPacketEncoder implements IEncoder {
  encoding = "text";

  encode(payload: Record<string, any>): string {
    return JSON.stringify(payload);
  }

  encodeHeader(header: EncHeader): string {
    const parts: string[] = [header.id];
    if (header.frag !== undefined && header.last !== undefined) {
      parts.push(header.frag.toString(), (header.last ? 1 : 0).toString());
    }
    return parts.join("|");
  }

  decode(raw: string): Record<string, any> | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  decodeHeader(raw: string): EncHeader | null {
    const parts = raw.split("|");
    const id = parts[0];
    const header: EncHeader = { id };
    if (parts.length === 3) {
      const frag = parseInt(parts[1], 10);
      const last = parseInt(parts[2], 10);
      if (isNaN(frag) || isNaN(last)) return null;
      header.frag = frag;
      header.last = last === 1;
    } else if (parts.length !== 1) {
      return null;
    }
    return header;
  }
}