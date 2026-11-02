import { z } from "zod";

/** Limits for goals (D-063). */
export const GOAL_LIMITS = { goalsPerSpace: 200, tasksPerGoal: 100, topicsPerNote: 20 } as const;

const Id = z.string().uuid();
const Title = z.string().trim().min(1).max(200);
const Criteria = z.string().trim().max(2000);
const TaskText = z.string().trim().min(1).max(500);

export const GoalTask = z.object({ id: Id, text: z.string(), done: z.boolean(), doneAt: z.string().nullable() });
export type GoalTask = z.infer<typeof GoalTask>;

export const Goal = z.object({
  id: Id,
  spaceId: Id,
  title: z.string(),
  criteria: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  tasks: z.array(GoalTask),
  /** "N of M tasks completed" — counts, never a mastery score. */
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
});
export type Goal = z.infer<typeof Goal>;

export const GoalList = z.object({ goals: z.array(Goal) });
export type GoalList = z.infer<typeof GoalList>;

export const CreateGoal = z.object({ title: Title, criteria: Criteria.default("") });
export type CreateGoal = z.infer<typeof CreateGoal>;

export const UpdateGoal = z.object({ title: Title.optional(), criteria: Criteria.optional(), archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "empty update");
export type UpdateGoal = z.infer<typeof UpdateGoal>;

export const CreateTask = z.object({ text: TaskText });
export const UpdateTask = z.object({ text: TaskText.optional(), done: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "empty update");
export type UpdateTask = z.infer<typeof UpdateTask>;
/** New order of all tasks of a goal. */
export const ReorderTasks = z.object({ taskIds: z.array(Id).max(GOAL_LIMITS.tasksPerGoal) });

/** Topic as seen from a note: with its space, for pickers and chips. */
export const TopicRef = z.object({ id: Id, name: z.string(), spaceId: Id, spaceName: z.string() });
export type TopicRef = z.infer<typeof TopicRef>;
export const TopicRefList = z.object({ topics: z.array(TopicRef) });
export type TopicRefList = z.infer<typeof TopicRefList>;
export const SetNoteTopics = z.object({ topicIds: z.array(Id).max(GOAL_LIMITS.topicsPerNote) });
export type SetNoteTopics = z.infer<typeof SetNoteTopics>;

/** Notes linked to a space's topics. */
export const SpaceNote = z.object({ id: Id, title: z.string(), path: z.string(), vault: z.enum(["hub", "linked"]), topicIds: z.array(Id) });
export const SpaceNoteList = z.object({ notes: z.array(SpaceNote) });
export type SpaceNoteList = z.infer<typeof SpaceNoteList>;
