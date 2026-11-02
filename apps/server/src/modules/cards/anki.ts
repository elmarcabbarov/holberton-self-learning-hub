import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../lib/db/index.ts";
import { cards, spaces, topics } from "../../lib/db/schema.ts";

/**
 * Anki text import (2.1.54+ file headers, https://docs.ankiweb.net/importing/text-files.html).
 * Tab-separated, plain text (no HTML), Basic note type. Deck = "Holberton Hub::<space>::<topic>".
 */
const HEADER = ["#separator:Tab", "#html:false", "#notetype:Basic", "#deck column:3", "#tags column:4", "#columns:Front\tBack\tDeck\tTags"];
export const ROOT_DECK = "Holberton Hub";

/** A field is quoted when it holds a tab, newline or quote; quotes are doubled. */
export function ankiField(v: string): string {
  return /[\t\r\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** "::" makes sub-decks in Anki, so it may not appear inside one name. */
const deckPart = (name: string) => name.replace(/::/g, ":").replace(/[\t\r\n]/g, " ").trim() || "-";

export function exportAnki(db: Db, filter: { spaceId?: string } = {}): { text: string; count: number } {
  const conds = [isNull(cards.archivedAt)];
  if (filter.spaceId) conds.push(eq(topics.spaceId, filter.spaceId));
  const rows = db.select({ front: cards.front, back: cards.back, topic: topics.name, space: spaces.name }).from(cards)
    .leftJoin(topics, eq(topics.id, cards.topicId)).leftJoin(spaces, eq(spaces.id, topics.spaceId))
    .where(and(...conds)).orderBy(asc(cards.createdAt)).all();
  const lines = rows.map((r) => {
    const deck = [ROOT_DECK, ...(r.space ? [deckPart(r.space)] : []), ...(r.topic ? [deckPart(r.topic)] : [])].join("::");
    return [r.front, r.back, deck, "holberton-hub"].map(ankiField).join("\t");
  });
  return { text: [...HEADER, ...lines].join("\n") + "\n", count: rows.length };
}
