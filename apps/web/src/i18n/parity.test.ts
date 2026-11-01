import { describe, expect, it } from "vitest";
import en from "./en.json";
import az from "./az.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("i18n parity", () => {
  it("en and az define the same keys", () => {
    expect(keys(az).sort()).toEqual(keys(en).sort());
  });
});
