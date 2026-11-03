import { z } from "zod";

/** Limits for goals (D-063). */
export const GOAL_LIMITS = { goalsPerSpace: 200, tasksPerGoal: 100, topicsPerNote: 20, spacesPerNote: 20 } as const;

const Id = z.string().uuid();
const Title = z.string().trim().min(1).max(200);
const Criteria = z.string().trim().max(2000);
const TaskText = z.string().trim().min(1).max(500);

/** `doneAt` is the first time the task was checked; it survives unchecking. */
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

/** Spaces a note is linked to directly (HSLH-028). */
export const SpaceRef = z.object({ id: Id, name: z.string() });
export const SpaceRefList = z.object({ spaces: z.array(SpaceRef) });
export type SpaceRefList = z.infer<typeof SpaceRefList>;
export const SetNoteSpaces = z.object({ spaceIds: z.array(Id).max(GOAL_LIMITS.spacesPerNote) });
export type SetNoteSpaces = z.infer<typeof SetNoteSpaces>;

/** A new note created from a space: placed in the space's folder and linked to it (and to a topic, if given). */
export const CreateSpaceNote = z.object({ title: z.string().trim().min(1).max(120), topicId: Id.optional() });
export type CreateSpaceNote = z.infer<typeof CreateSpaceNote>;
export const CreatedSpaceNote = z.object({ noteId: Id, path: z.string() });

/** Notes of a space: linked to the space directly and/or through its topics. */
export const SpaceNote = z.object({ id: Id, title: z.string(), path: z.string(), vault: z.enum(["hub", "linked"]), direct: z.boolean(), topicIds: z.array(Id) });
export const SpaceNoteList = z.object({ notes: z.array(SpaceNote) });
export type SpaceNoteList = z.infer<typeof SpaceNoteList>;
