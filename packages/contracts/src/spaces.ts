import { z } from "zod";

const Name = z.string().trim().min(1).max(120);
const Description = z.string().trim().max(2000);
const Id = z.string().uuid();
/** Upper bound keeps positions far from unsafe integers even after many appends. */
export const MAX_TOPIC_POSITION = 100_000;

export const Topic = z.object({
  id: Id,
  spaceId: Id,
  name: Name,
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Topic = z.infer<typeof Topic>;

export const Space = z.object({
  id: Id,
  name: Name,
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  topicCount: z.number().int().nonnegative(),
});
export type Space = z.infer<typeof Space>;

export const SpaceDetail = Space.extend({ topics: z.array(Topic), archivedTopics: z.array(Topic) });
export type SpaceDetail = z.infer<typeof SpaceDetail>;

export const SpaceList = z.object({ spaces: z.array(Space) });
export type SpaceList = z.infer<typeof SpaceList>;

export const CreateSpace = z.object({ name: Name, description: Description.default("") });
export type CreateSpace = z.infer<typeof CreateSpace>;

export const UpdateSpace = z.object({
  name: Name.optional(),
  description: Description.optional(),
  archived: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "empty update");
export type UpdateSpace = z.infer<typeof UpdateSpace>;

export const CreateTopic = z.object({ name: Name });
export type CreateTopic = z.infer<typeof CreateTopic>;

export const UpdateTopic = z.object({
  name: Name.optional(),
  archived: z.boolean().optional(),
  position: z.number().int().nonnegative().max(MAX_TOPIC_POSITION).optional(),
}).refine((v) => Object.keys(v).length > 0, "empty update");
export type UpdateTopic = z.infer<typeof UpdateTopic>;

export const IdParam = z.object({ id: Id });
