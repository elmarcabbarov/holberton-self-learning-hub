import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Archive, ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import type { Goal } from "@hub/contracts";
import { useAddTask, useCreateGoal, useDeleteTask, useGoals, useReorderTasks, useUpdateGoal, useUpdateTask } from "../features/goals.ts";
import { Button, Card, ConfirmButton, TextInput } from "./ui.tsx";

const textareaClass = "min-h-20 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg placeholder:text-muted";

/** Space → goals with checklist tasks (HSLH-007). Progress is "tasks completed", never mastery (D-063). */
export function SpaceGoals({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const goals = useGoals(spaceId);
  const [showArchived, setShowArchived] = useState(false);
  const archived = useGoals(spaceId, true, showArchived);
  const create = useCreateGoal(spaceId);
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title, criteria }, { onSuccess: () => { setTitle(""); setCriteria(""); } });
  };

  return (
    <Card className="mt-6">
      <h2 className="text-[20px] font-medium">{t("goals.title")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("goals.intro")}</p>
      <form aria-label={t("goals.newGoal")} onSubmit={onCreate} className="mt-5 flex flex-col gap-3">
        <TextInput label={t("goals.goalTitle")} placeholder={t("goals.goalTitlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t("goals.criteria")}</span>
          <textarea className={textareaClass} placeholder={t("goals.criteriaPlaceholder")} value={criteria} onChange={(e) => setCriteria(e.target.value)} maxLength={2000} />
        </label>
        <div><Button type="submit" variant="primary" disabled={create.isPending || !title.trim()}>{t("goals.create")}</Button></div>
      </form>
      {create.isError ? <p role="alert" className="mt-3 text-[14px]">{t("errors.saveFailed")}</p> : null}

      {goals.data && goals.data.goals.length > 0 ? (
        <ul className="mt-6 space-y-4" aria-label={t("goals.listLabel")}>
          {goals.data.goals.map((g) => <GoalItem key={g.id} goal={g} />)}
        </ul>
      ) : goals.isSuccess ? <p className="mt-6 text-muted">{t("goals.empty")}</p> : null}

      <details className="mt-6" onToggle={(e) => setShowArchived((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-[14px] text-muted">{t("goals.archivedSummary")}</summary>
        {archived.data && archived.data.goals.length > 0 ? (
          <ul className="mt-3 divide-y divide-line" aria-label={t("goals.archivedLabel")}>
            {archived.data.goals.map((g) => <ArchivedGoal key={g.id} goal={g} />)}
          </ul>
        ) : archived.isSuccess ? <p className="mt-3 text-[14px] text-muted">{t("goals.noArchived")}</p> : null}
      </details>
    </Card>
  );
}

function ArchivedGoal({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const update = useUpdateGoal(goal.id);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="flex-1 text-muted">{goal.title} · {t("goals.progress", { done: goal.progress.done, total: goal.progress.total })}</span>
      <Button onClick={() => update.mutate({ archived: false })} disabled={update.isPending} aria-label={t("archive.restoreNamed", { name: goal.title })}>{t("archive.restore")}</Button>
    </li>
  );
}

/** The checkbox answers the click at once; the server's answer (or a rollback) syncs it afterwards. */
function TaskCheck({ text, done, onToggle }: { text: string; done: boolean; onToggle: (done: boolean) => void }) {
  const [checked, setChecked] = useState(done);
  useEffect(() => setChecked(done), [done]);
  return (
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => { setChecked(e.target.checked); onToggle(e.target.checked); }} className="size-4 accent-fg" />
      <span className={checked ? "text-muted line-through" : ""}>{text}</span>
    </label>
  );
}

function GoalItem({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const update = useUpdateGoal(goal.id);
  const addTask = useAddTask(goal.id);
  const updateTask = useUpdateTask(goal.id);
  const deleteTask = useDeleteTask(goal.id);
  const reorder = useReorderTasks(goal.id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [criteria, setCriteria] = useState(goal.criteria);
  const [task, setTask] = useState("");
  const failed = update.isError || addTask.isError || updateTask.isError || deleteTask.isError || reorder.isError;

  const move = (index: number, by: -1 | 1) => {
    const ids = goal.tasks.map((x) => x.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    reorder.mutate(ids);
  };

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    addTask.mutate(task, { onSuccess: () => setTask("") });
  };

  const titleId = `goal-${goal.id}`;
  return (
    <li aria-labelledby={titleId} className="rounded-[var(--radius-control)] border border-line p-5">
      {editing ? (
        <form aria-label={t("goals.editGoal")} className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (title.trim()) update.mutate({ title, criteria }, { onSuccess: () => setEditing(false) }); }}>
          <TextInput label={t("goals.goalTitle")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">{t("goals.criteria")}</span>
            <textarea className={textareaClass} value={criteria} onChange={(e) => setCriteria(e.target.value)} maxLength={2000} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={update.isPending}>{t("common.save")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setTitle(goal.title); setCriteria(goal.criteria); setEditing(false); }}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[17px] font-medium">{goal.title}</h3>
            <p className="mt-0.5 text-[13px] text-muted">{t("goals.progress", { done: goal.progress.done, total: goal.progress.total })}</p>
            {goal.criteria ? <p className="mt-2 max-w-prose whitespace-pre-wrap text-[14px]"><span className="text-muted">{t("goals.criteriaShort")} </span>{goal.criteria}</p> : null}
          </div>
          <Button variant="ghost" aria-label={t("goals.edit", { name: goal.title })} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden /></Button>
          <ConfirmButton
            ariaLabel={t("goals.archive", { name: goal.title })}
            confirmAriaLabel={t("goals.archiveConfirm", { name: goal.title })}
            confirmLabel={t("common.confirmArchive")}
            onConfirm={() => update.mutate({ archived: true })}
          ><Archive size={16} aria-hidden /></ConfirmButton>
        </div>
      )}

      {goal.tasks.length > 0 ? (
        <ul className="mt-4 space-y-1" aria-label={t("goals.tasksLabel", { name: goal.title })}>
          {goal.tasks.map((x, i) => (
            <li key={x.id} className="group flex items-center gap-2">
              <TaskCheck text={x.text} done={x.done} onToggle={(done) => updateTask.mutate({ id: x.id, done })} />
              <Button variant="ghost" className="h-8 px-2" aria-label={t("goals.moveUp", { name: x.text })} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}><ArrowUp size={14} aria-hidden /></Button>
              <Button variant="ghost" className="h-8 px-2" aria-label={t("goals.moveDown", { name: x.text })} disabled={i === goal.tasks.length - 1 || reorder.isPending} onClick={() => move(i, 1)}><ArrowDown size={14} aria-hidden /></Button>
              <Button variant="ghost" className="h-8 px-2" aria-label={t("goals.deleteTask", { name: x.text })} onClick={() => deleteTask.mutate(x.id)}><Trash2 size={14} aria-hidden /></Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={onAdd} className="mt-3 flex gap-2">
        <input aria-label={t("goals.newTask", { name: goal.title })} placeholder={t("goals.newTaskPlaceholder")} value={task} onChange={(e) => setTask(e.target.value)} maxLength={500}
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-[14px] text-fg placeholder:text-muted" />
        <Button type="submit" className="h-9" disabled={addTask.isPending || !task.trim()}>{t("goals.addTask")}</Button>
      </form>
      {failed ? <p role="alert" className="mt-2 text-[13px]">{t("errors.saveFailed")}</p> : null}
    </li>
  );
}
