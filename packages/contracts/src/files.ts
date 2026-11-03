/** File-safe note name (OBSIDIAN_STRATEGY §5); shared by the web import and the server (HSLH-028): no reserved characters, no trailing dot/space. */
export function noteFileName(title: string): string {
  const noControl = [...title].map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? " " : c)).join("");
  const cleaned = noControl.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  // Match the vault's path rules (D-052): no leading dot, no Windows-reserved stems.
  let name = cleaned.replace(/^\.+/, "").trim().slice(0, 120).replace(/[. ]+$/, "") || "Project";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) name = `${name} project`;
  return name;
}
