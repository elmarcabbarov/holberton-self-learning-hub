import { crc32 } from "node:zlib";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

/** Minimal stored (uncompressed) zip, enough for the import flow. */
function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const fname = Buffer.from(name);
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fname.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fname, data);
    centrals.push(central, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test.beforeEach(async ({ page }) => { await signIn(page); });

test("import a zip of notes: preview first, then copy into the vault", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Import notes" });
  await panel.getByLabel("Put them in folder").fill(`Imported/e2e ${stamp}`);
  await panel.getByLabel("Zip file (up to 100 MB)").setInputFiles({
    name: "notes.zip", mimeType: "application/zip",
    buffer: storedZip({ "Shell/pipes.md": "# Pipes\nSee [[quoting]].\n", "Shell/quoting.md": "# Quoting\n", "diagram.png": "png" }),
  });
  await panel.getByRole("button", { name: "Preview" }).click();
  await expect(panel.getByText(`2 notes will be copied into Imported/e2e ${stamp}.`)).toBeVisible();
  await expect(panel.getByRole("list", { name: "Not imported" })).toContainText("1 file that is not Markdown");

  await panel.getByRole("button", { name: "Import 2 notes" }).click();
  await expect(panel.getByRole("status")).toContainText(`2 notes imported into Imported/e2e ${stamp}.`);
  await panel.getByRole("link", { name: "Open notes" }).click();
  await expect(page.getByText(`Imported/e2e ${stamp}/Shell/pipes.md`).or(page.getByRole("link", { name: /pipes/i })).first()).toBeVisible();
});
