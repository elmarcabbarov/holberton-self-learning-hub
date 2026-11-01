import { watch, type FSWatcher } from "chokidar";
import type { Vault } from "./service.ts";

export const FULL_RECONCILE_MS = 5 * 60_000;

/**
 * File events are only hints (D-030): they schedule a debounced reconcile.
 * A periodic full reconcile covers missed events (bind mounts, polling gaps).
 */
export function startWatching(vault: Vault, opts: { polling: boolean; log: (msg: string) => void }) {
  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void vault.reconcile().catch((e) => opts.log(`reconcile failed: ${String(e)}`)); }, 300);
  };
  const watcher: FSWatcher = watch(vault.root, {
    ignoreInitial: true,
    followSymlinks: false,
    usePolling: opts.polling,
    interval: 1000,
    ignored: (path: string) => /(^|[/\\])\.(?!$)/.test(path.slice(vault.root.length)),
  });
  watcher.on("all", schedule);
  watcher.on("error", (e) => opts.log(`watcher error: ${String(e)}`));
  const periodic = setInterval(() => void vault.reconcile().catch(() => undefined), FULL_RECONCILE_MS);
  return async () => {
    clearInterval(periodic);
    if (timer) clearTimeout(timer);
    await watcher.close();
  };
}
