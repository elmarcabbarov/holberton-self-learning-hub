import { z } from "zod";

const Name = z.string().trim().min(1).max(120);
const CardText = z.string().trim().min(1).max(5000);

export const ImportProjectRequest = z.object({
  spaceName: Name,
  topics: z.array(z.object({ name: Name, cards: z.array(z.object({ front: CardText, back: CardText })).max(200) })).max(50),
  note: z.object({ path: z.string().min(1).max(512), content: z.string().max(200_000) }).nullable(),
}).refine((r) => r.topics.reduce((n, t) => n + t.cards.length, 0) <= 500, "too many cards");
export type ImportProjectRequest = z.infer<typeof ImportProjectRequest>;

export const ImportProjectResult = z.object({
  spaceId: z.string().uuid(),
  topics: z.number().int(),
  cards: z.number().int(),
  noteId: z.string().uuid().nullable(),
  notePath: z.string().nullable(),
});
export type ImportProjectResult = z.infer<typeof ImportProjectResult>;
