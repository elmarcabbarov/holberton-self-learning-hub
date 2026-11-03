import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ImportSources, VaultImport, VaultImportList, type ImportSkipReason } from "@hub/contracts";
import { z } from "zod";
import { ApiError, apiJson, apiUpload } from "../api.ts";
import { Button, TextInput } from "./ui.tsx";

type Source = { kind: "zip"; file: File } | { kind: "folder"; folder: string };

/** Settings → import Markdown notes (a zip or a folder under HUB_IMPORT_DIR) into the Hub vault (D-061). */
export function VaultImportPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["vault-import-sources"], queryFn: () => apiJson("/api/vault/import-sources", ImportSources) });
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("");
  const [prefix, setPrefix] = useState("");
  const [picked, setPicked] = useState<VaultImport | null>(null);
  // Imports still waiting for a decision survive navigation and restarts: the server lists them.
  const open = useQuery({ queryKey: ["vault-imports"], queryFn: () => apiJson("/api/vault/imports", VaultImportList) });
  const current = picked ?? open.data?.imports[0] ?? null;
  const setCurrent = (imp: VaultImport | null) => { setPicked(imp); void qc.invalidateQueries({ queryKey: ["vault-imports"] }); };

  const preview = useMutation({
    mutationFn: (src: Source) => {
      const p = prefix.trim();
      if (src.kind === "folder") return apiJson("/api/vault/imports/folder", VaultImport, { method: "POST", body: { folder: src.folder, ...(p ? { prefix: p } : {}) } });
      const qs = new URLSearchParams({ name: src.file.name, ...(p ? { prefix: p } : {}) });
      return apiUpload(`/api/vault/imports?${qs.toString()}`, VaultImport, src.file, "application/zip");
    },
    onSuccess: setCurrent,
  });
  const commit = useMutation({
    mutationFn: (id: string) => apiJson(`/api/vault/imports/${id}/commit`, VaultImport, { method: "POST" }),
    onSuccess: (imp) => { setCurrent(imp); void qc.invalidateQueries({ queryKey: ["notes"] }); },
    // A failed commit is interrupted on the server: show that state, so it can be resumed or discarded.
    onError: (_e, id) => { void apiJson(`/api/vault/imports/${id}`, VaultImport).then(setPicked, () => undefined); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/api/vault/imports/${id}`, z.null(), { method: "DELETE" }),
    onSuccess: () => setCurrent(null),
  });

  const error = preview.error ?? commit.error ?? cancel.error;
  const errorText = error instanceof ApiError && error.messageKey.startsWith("vaultImport.") ? t(error.messageKey) : error ? t("vaultImport.failed") : null;

  const submit = (e: FormEvent, src: Source | null) => {
    e.preventDefault();
    if (src) { commit.reset(); preview.mutate(src); }
  };

  return (
    <section aria-labelledby="vault-import-title" className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-8">
      <h2 id="vault-import-title" className="hub-display text-[22px]">{t("vaultImport.title")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("vaultImport.intro")}</p>

      {!current || current.state === "done" ? (
        <div className="mt-5 flex flex-col gap-5">
          <TextInput label={t("vaultImport.prefix")} placeholder={t("vaultImport.prefixPlaceholder")} value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={200} className="max-w-md" />
          <form aria-label={t("vaultImport.zipForm")} onSubmit={(e) => submit(e, file ? { kind: "zip", file } : null)} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">{t("vaultImport.zipLabel")}</span>
              <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[14px] file:mr-3 file:h-10 file:rounded-[var(--radius-control)] file:border file:border-line file:bg-surface-2 file:px-4 file:text-fg" />
            </label>
            <Button type="submit" disabled={!file || preview.isPending}>{preview.isPending ? t("vaultImport.reading") : t("vaultImport.preview")}</Button>
          </form>
          {sources.data?.folderImport ? (
            sources.data.folders.length > 0 ? (
              <form aria-label={t("vaultImport.folderForm")} onSubmit={(e) => submit(e, folder ? { kind: "folder", folder } : null)} className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-muted">{t("vaultImport.folderLabel")}</span>
                  <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-10 min-w-48 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px]">
                    <option value="">{t("vaultImport.chooseFolder")}</option>
                    {sources.data.folders.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <Button type="submit" disabled={!folder || preview.isPending}>{t("vaultImport.preview")}</Button>
              </form>
            ) : <p className="text-[14px] text-muted">{t("vaultImport.noFolders")}</p>
          ) : null}
        </div>
      ) : null}

      {errorText ? <p role="alert" className="mt-4 text-[14px]">{errorText}</p> : null}
      {current ? <ImportView imp={current} committing={commit.isPending} onCommit={() => commit.mutate(current.id)} onCancel={() => cancel.mutate(current.id)} /> : null}
    </section>
  );
}

function ImportView({ imp, committing, onCommit, onCancel }: { imp: VaultImport; committing: boolean; onCommit: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const skipped = new Map<ImportSkipReason, string[]>();
  for (const e of imp.entries) if (e.action === "skip" && e.reason) skipped.set(e.reason, [...(skipped.get(e.reason) ?? []), e.source]);
  const readOnly = imp.entries.filter((e) => e.action === "import" && e.readOnlyReason).length;

  if (imp.state === "done") {
    return (
      <div role="status" className="mt-6 rounded-[var(--radius-control)] border border-line bg-surface-2 p-4 text-[14px]">
        <p className="font-medium">{t("vaultImport.done", { created: imp.counts.created, prefix: imp.prefix })}</p>
        {imp.counts.exists > 0 ? <p className="mt-1 text-muted">{t("vaultImport.doneExists", { count: imp.counts.exists })}</p> : null}
        {imp.counts.failed > 0 ? <p className="mt-1">{t("vaultImport.doneFailed", { count: imp.counts.failed })}</p> : null}
        <Link to="/notes" className="mt-2 inline-block underline decoration-line underline-offset-4 hover:decoration-fg">{t("vaultImport.openNotes")}</Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-[15px] font-medium">{t("vaultImport.previewTitle", { name: imp.sourceName })}</h3>
      <p className="mt-1 text-[14px]">{t("vaultImport.willImport", { count: imp.counts.import, prefix: imp.prefix })}</p>
      {readOnly > 0 ? <p className="mt-1 text-[14px] text-muted">{t("vaultImport.readOnly", { count: readOnly })}</p> : null}
      {imp.state === "interrupted" ? <p className="mt-1 text-[14px]">{t("vaultImport.interrupted")}</p> : null}
      <p className="mt-3 max-w-prose text-[13px] text-muted">{t("vaultImport.linkWarning")}</p>

      {skipped.size > 0 ? (
        <ul aria-label={t("vaultImport.skippedLabel")} className="mt-4 divide-y divide-line rounded-[var(--radius-control)] border border-line">
          {[...skipped].map(([reason, files]) => (
            <li key={reason} className="px-3 py-2 text-[14px]">
              <details>
                <summary className="cursor-pointer">{t(`vaultImport.reason.${reason}`, { count: files.length })}</summary>
                <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-[12px] text-muted">
                  {files.slice(0, 200).map((f) => <li key={f} className="truncate">{f}</li>)}
                  {files.length > 200 ? <li>{t("vaultImport.more", { count: files.length - 200 })}</li> : null}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" onClick={onCommit} disabled={committing || imp.counts.import === 0}>
          {committing ? t("vaultImport.importing") : t("vaultImport.commit", { count: imp.counts.import })}
        </Button>
        {imp.state === "preview" || imp.state === "interrupted" ? <Button variant="ghost" onClick={onCancel} disabled={committing}>{t("vaultImport.cancel")}</Button> : null}
      </div>
    </div>
  );
}
