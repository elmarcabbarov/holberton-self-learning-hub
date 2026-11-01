export type Eol = "lf" | "crlf" | "none" | "mixed";

export interface DecodedNote {
  /** Text with LF line endings and without BOM, as shown in the editor. */
  text: string;
  eol: Eol;
  bom: boolean;
  /** Set when Hub must not write this file in v1 (D-053). */
  readOnlyReason: "invalid_utf8" | "mixed_eol" | null;
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const decoder = new TextDecoder("utf-8", { fatal: true });

export function decodeNote(bytes: Buffer): DecodedNote {
  const bom = bytes.subarray(0, 3).equals(BOM);
  let raw: string;
  try {
    raw = decoder.decode(bom ? bytes.subarray(3) : bytes);
  } catch {
    return { text: Buffer.from(bytes).toString("latin1"), eol: "none", bom, readOnlyReason: "invalid_utf8" };
  }
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lf = (raw.match(/\n/g) ?? []).length - crlf;
  const eol: Eol = crlf === 0 && lf === 0 ? "none" : crlf > 0 && lf > 0 ? "mixed" : crlf > 0 ? "crlf" : "lf";
  return { text: raw.replace(/\r\n/g, "\n"), eol, bom, readOnlyReason: eol === "mixed" ? "mixed_eol" : null };
}

/** Re-applies the file's original EOL and BOM to editor text (which uses LF). */
export function encodeNote(text: string, eol: Eol, bom: boolean): Buffer {
  const normalized = text.replace(/\r\n/g, "\n");
  const body = eol === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
  const buf = Buffer.from(body, "utf8");
  return bom ? Buffer.concat([BOM, buf]) : buf;
}
