import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ImportProjectResult } from "@hub/contracts";
import { apiJson } from "../api.ts";
import { Button, Card, PageTitle, TextInput } from "../components/ui.tsx";
import { parseProject, type ParsedProject } from "../features/import/parseProject.ts";
import { allObjectiveKeys, buildImport, type ImportTexts } from "../features/import/buildImport.ts";

export function ImportProject() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedProject | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withNote, setWithNote] = useState(true);

  const texts: ImportTexts = useMemo(() => ({
    cardFront: (o) => t("import.cardFront", { objective: o }),
    cardBack: (r) => (r.length ? t("import.cardBackWithResources", { resources: r.slice(0, 5).join(" · ") }) : t("import.cardBack")),
    ungroupedTopic: t("import.ungrouped"),
    taskPlaceholder: (n) => t("import.taskPlaceholder", { n }),
    noteIntro: (d) => t("import.noteIntro", { date: d }),
    headings: { concepts: t("import.concepts"), resources: t("import.resources"), objectives: t("import.objectives"), requirements: t("import.requirements"), tasks: t("import.tasks") },
  }), [t]);

  const run = useMutation({
    mutationFn: () => apiJson("/api/import/project", ImportProjectResult, {
      method: "POST",
      body: buildImport(parsed!, { spaceName, selected, withNote }, texts, new Date().toLocaleDateString(i18n.language)),
    }),
    onSuccess: () => { void qc.invalidateQueries(); },
  });

  const read = () => {
    const p = parseProject(raw);
    setParsed(p);
    setSpaceName(p.title ?? "");
    setSelected(allObjectiveKeys(p));
    run.reset();
  };
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const objectiveCount = parsed?.groups.reduce((n, g) => n + g.objectives.length, 0) ?? 0;

  if (run.isSuccess) {
    return (
      <section aria-labelledby="import-title">
        <PageTitle id="import-title">{t("import.title")}</PageTitle>
        <Card className="mt-8">
          <h2 className="text-[20px] font-medium" role="status">{t("import.done", { cards: run.data.cards, topics: run.data.topics })}</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/spaces/$spaceId" params={{ spaceId: run.data.spaceId }} className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-dark">{t("import.openSpace")}</Link>
            {run.data.noteId ? <Link to="/notes/$noteId" params={{ noteId: run.data.noteId }} className="inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-[14px] font-medium hover:bg-surface">{t("import.openNote")}</Link> : null}
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="import-title">
      <PageTitle id="import-title">{t("import.title")}</PageTitle>
      <p className="mt-2 max-w-prose text-muted">{t("import.intro")}</p>

      <Card className="mt-8">
        <ol className="list-decimal space-y-1 pl-5 text-[14px] text-muted">
          <li>{t("import.step1")}</li><li>{t("import.step2")}</li><li>{t("import.step3")}</li>
        </ol>
        <label className="mt-5 flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t("import.pasteLabel")}</span>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} maxLength={500_000}
            className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 font-mono text-[13px] text-fg" />
        </label>
        <Button className="mt-4" variant={parsed ? "secondary" : "primary"} onClick={read} disabled={!raw.trim()}>{t("import.read")}</Button>
      </Card>

      {parsed ? (
        objectiveCount === 0 ? (
          <p role="alert" className="mt-6">{t("import.nothingFound")}</p>
        ) : (
          <Card className="mt-6">
            <h2 className="text-[20px] font-medium">{t("import.preview")}</h2>
            <TextInput className="mt-5" label={t("import.spaceName")} value={spaceName} onChange={(e) => setSpaceName(e.target.value)} maxLength={120} required />

            <fieldset className="mt-6">
              <legend className="text-[14px] font-medium">{t("import.objectivesLegend", { selected: selected.size, total: objectiveCount })}</legend>
              {parsed.groups.map((g, gi) => (
                <div key={gi} className="mt-4">
                  <p className="text-[13px] text-muted">{g.name ?? t("import.ungrouped")}</p>
                  <ul className="mt-1 space-y-1">
                    {g.objectives.map((o, oi) => (
                      <li key={oi}>
                        <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
                          <input type="checkbox" className="mt-1 accent-[var(--color-brand)]" checked={selected.has(`${gi}:${oi}`)} onChange={() => toggle(`${gi}:${oi}`)} />
                          <span>{o}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </fieldset>

            <dl className="mt-6 grid gap-4 text-[14px] sm:grid-cols-3">
              <div><dt className="text-muted">{t("import.concepts")}</dt><dd>{parsed.concepts.length}</dd></div>
              <div><dt className="text-muted">{t("import.resources")}</dt><dd>{parsed.resources.length}</dd></div>
              <div><dt className="text-muted">{t("import.tasks")}</dt><dd>{parsed.tasks.length}</dd></div>
            </dl>

            <label className="mt-6 flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" className="accent-[var(--color-brand)]" checked={withNote} onChange={(e) => setWithNote(e.target.checked)} />
              {t("import.withNote")}
            </label>

            <Button variant="primary" className="mt-6" onClick={() => run.mutate()} disabled={run.isPending || !spaceName.trim() || selected.size === 0}>
              {t("import.import", { count: selected.size })}
            </Button>
            {run.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}
          </Card>
        )
      ) : null}
    </section>
  );
}
