import { z } from "zod";

const Id = z.string().uuid();
const Text = z.string().trim().min(1).max(5000);

export const CardState = z.enum(["new", "learning", "review", "relearning"]);
export type CardState = z.infer<typeof CardState>;

export const Card = z.object({
  id: Id,
  topicId: Id.nullable(),
  noteId: Id.nullable(),
  front: z.string(),
  back: z.string(),
  origin: z.enum(["manual", "ai", "import"]),
  suspended: z.boolean(),
  state: CardState,
  due: z.string(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Card = z.infer<typeof Card>;

export const CardList = z.object({ cards: z.array(Card) });
export type CardList = z.infer<typeof CardList>;

export const CreateCard = z.object({ topicId: Id.nullable().default(null), noteId: Id.nullable().default(null), front: Text, back: Text });
export type CreateCard = z.input<typeof CreateCard>;

export const UpdateCard = z.object({
  front: Text.optional(), back: Text.optional(), topicId: Id.nullable().optional(),
  suspended: z.boolean().optional(), archived: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "empty update");
export type UpdateCard = z.infer<typeof UpdateCard>;

export const Rating = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Rating = z.infer<typeof Rating>;

export const ReviewRequest = z.object({ rating: Rating, eventId: Id });
export type ReviewRequest = z.infer<typeof ReviewRequest>;

/** What each rating would schedule next, for the buttons (seconds until due). */
export const IntervalPreview = z.object({ again: z.number(), hard: z.number(), good: z.number(), easy: z.number() });

export const QueueItem = Card.extend({ preview: IntervalPreview, topicName: z.string().nullable() });
export const ReviewQueue = z.object({ items: z.array(QueueItem), dueTotal: z.number().int().nonnegative() });
export type ReviewQueue = z.infer<typeof ReviewQueue>;

export const ReviewSummary = z.object({ due: z.number().int().nonnegative(), reviewedToday: z.number().int().nonnegative() });
export type ReviewSummary = z.infer<typeof ReviewSummary>;
