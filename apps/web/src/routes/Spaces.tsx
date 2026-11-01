import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useArchivedSpaces, useCreateSpace, useRestoreSpace, useSpaces } from "../features/spaces.ts";
import { Button, Card, PageTitle, TextInput } from "../components/ui.tsx";

export function Spaces() {
  const { t } = useTranslation();
  const spaces = useSpaces();
  const create = useCreateSpace();
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archived = useArchivedSpaces(showArchived);
  const restore = useRestoreSpace();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name, description: "" }, { onSuccess: () => setName("") });
  };

  return (
    <section aria-labelledby="spaces-title">
      <PageTitle id="spaces-title">{t("spaces.title")}</PageTitle>
      <p className="mt-2 max-w-prose text-muted">{t("spaces.intro")}</p>
      <Link to="/import" className="mt-4 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-[14px] font-medium hover:bg-surface">{t("import.cta")}</Link>

      <Card className="mt-8">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label={t("spaces.nameLabel")} placeholder={t("spaces.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="flex-1" required />
          <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>{t("spaces.create")}</Button>
        </form>
        {create.isError ? <p role="alert" className="mt-3 text-[14px] text-fg">{t("errors.saveFailed")}</p> : null}
      </Card>

      <div className="mt-8">
        {spaces.isPending ? <p className="text-muted" role="status">{t("common.loading")}</p> : null}
        {spaces.isError ? <p role="alert">{t("errors.loadFailed")}</p> : null}
        {spaces.isSuccess && spaces.data.spaces.length === 0 ? <p className="text-muted">{t("spaces.empty")}</p> : null}
        {spaces.isSuccess && spaces.data.spaces.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {spaces.data.spaces.map((s) => (
              <li key={s.id}>
                <Link to="/spaces/$spaceId" params={{ spaceId: s.id }} className="block rounded-[var(--radius-card)] border border-line bg-surface p-6 transition-colors hover:border-muted">
                  <span className="block text-[18px] font-medium">{s.name}</span>
                  <span className="mt-1 block text-[14px] text-muted">{t("spaces.topicCount", { count: s.topicCount })}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="mt-10">
        <Button variant="ghost" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? t("archive.hideSpaces") : t("archive.showSpaces")}
        </Button>
        {showArchived ? (
          archived.data && archived.data.spaces.length > 0 ? (
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface" aria-label={t("archive.spacesLabel")}>
              {archived.data.spaces.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                  <Button onClick={() => restore.mutate(s.id)} disabled={restore.isPending} aria-label={t("archive.restoreNamed", { name: s.name })}>{t("archive.restore")}</Button>
                </li>
              ))}
            </ul>
          ) : archived.isSuccess ? <p className="mt-3 text-[14px] text-muted">{t("archive.noneSpaces")}</p> : null
        ) : null}
        {restore.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}
      </div>
    </section>
  );
}
