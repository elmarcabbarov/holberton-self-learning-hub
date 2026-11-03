import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BackupCreated, BackupList } from "@hub/contracts";
import { apiJson } from "../api.ts";
import { Button } from "./ui.tsx";

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Settings → Data: create, list and download backups; restore is a CLI step (D-058). */
export function BackupPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["backups"], queryFn: () => apiJson("/api/backups", BackupList) });
  const create = useMutation({
    mutationFn: () => apiJson("/api/backups", BackupCreated, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });

  return (
    <section aria-labelledby="data-title" className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-8">
      <h2 id="data-title" className="hub-display text-[22px]">{t("backup.title")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("backup.intro")}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? t("backup.creating") : t("backup.create")}
        </Button>
        {create.isSuccess ? (
          <span role="status" className="text-[14px] text-muted">
            {t("backup.created", { notes: create.data.counts.notes, cards: create.data.counts.cards, files: create.data.files })}
          </span>
        ) : null}
      </div>
      {create.isError ? <p role="alert" className="mt-3 text-[14px]">{t("backup.failed")}</p> : null}

      {list.data && list.data.backups.length > 0 ? (
        <ul className="mt-6 divide-y divide-line" aria-label={t("backup.listLabel")}>
          {list.data.backups.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{b.name}</span>
              <span className="text-[13px] text-muted">{new Date(b.createdAt).toLocaleString(i18n.language)} · {formatSize(b.size)}</span>
              <a href={`/api/backups/${encodeURIComponent(b.name)}`} download className="text-[14px] underline decoration-line underline-offset-4 hover:decoration-fg">{t("backup.download")}</a>
            </li>
          ))}
        </ul>
      ) : list.isSuccess ? <p className="mt-6 text-[14px] text-muted">{t("backup.none")}</p> : null}

      <h3 className="mt-8 text-[15px] font-medium">{t("backup.restoreTitle")}</h3>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("backup.restoreBody")}</p>
      <pre className="mt-3 overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-3 font-mono text-[13px]">{`node apps/server/src/cli.ts inspect hub-backup-….zip
HUB_DATA=/path/to/empty/folder node apps/server/src/cli.ts restore hub-backup-….zip`}</pre>
    </section>
  );
}
