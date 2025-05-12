import { EncHeader } from "../envelope";

export const MAX_CHUNK = 2047;
export const SPEC_VERSION = 1;

/**
 * Encoder interface for IPCS-BE payloads.
 */
export interface IEncoder {
  /** Unique encoding name (e.g. 'text', 'b64', 'struct'). */
  encoding: string;
  /**
   * Split and serialize payload into header chunks.
   * @param payload Data to send
   * @param opts.id Optional message UUID
   * @returns Encoded payload
   */
  encode(payload: Record<string, any>): string;

  /**
   * Serialize a single header into a string.
   * @param header Header to serialize
   * @returns String representation of header
   */
  encodeHeader(header: EncHeader): string;

  /**
   * Parse a payload string into decoded payload.
   * @param raw Raw body extracted from envelope
   * @returns Parsed data or null if not applicable
   */
  decode(raw: string): Record<string, any> | null;

  /**
   * Parse a header string into metadata.
   * @param raw Raw header extracted from envelope
   * @returns Parsed data or null if not applicable
   */
  decodeHeader(raw: string): EncHeader | null;
}
