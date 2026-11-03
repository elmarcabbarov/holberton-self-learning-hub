/** File-safe note name (OBSIDIAN_STRATEGY §5); shared by the web import and the server (HSLH-028): no reserved characters, no trailing dot/space. */
export function noteFileName(title: string): string {
  const noControl = [...title].map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? " " : c)).join("");
  const cleaned = noControl.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  // Match the vault's path rules (D-052): no leading dot, no Windows-reserved stems.
  let name = cleaned.replace(/^\.+/, "").trim().slice(0, 120).replace(/[. ]+$/, "") || "Project";
  // Windows checks the part before the first dot: `CON.notes` is reserved too, so rename the stem.
  if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i.test(name)) name = name.replace(/^[^.]*/, (stem) => `${stem} project`);
  return name;
}
