import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Card, CardList, ReviewQueue, ReviewSummary, Space, Topic } from "@hub/contracts";
import { openDatabase, type DatabaseHandle } from "../src/lib/db/index.ts";
import { cardReviews } from "../src/lib/db/schema.ts";
import { createCard, previewIntervals, reviewCard, reviewQueue, updateCard, getCard, SCHEDULER } from "../src/modules/cards/service.ts";
import { signedInApp, type TestApp } from "./helpers.ts";

describe("card scheduling (service)", () => {
  let dir: string; let h: DatabaseHandle;
  const t0 = new Date("2026-11-02T09:00:00Z");
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hub-cards-")); h = openDatabase(dir); });
  afterEach(() => { h.close(); rmSync(dir, { recursive: true, force: true }); });
  const make = () => {
    const out = createCard(h.db, { topicId: null, noteId: null, front: "fork() nə qaytarır?", back: "Uşaqda 0, valideyndə uşağın PID-i" }, t0);
    if (out.kind !== "created") throw new Error("not created");
    return out.card;
  };

  it("new cards are due immediately and show increasing intervals per rating", () => {
    const c = make();
    expect(reviewQueue(h.db, { now: t0 }).items.map((i) => i.id)).toEqual([c.id]);
    const p = previewIntervals(c, t0);
    expect(p.again).toBeLessThanOrEqual(p.hard);
    expect(p.hard).toBeLessThanOrEqual(p.good);
    expect(p.good).toBeLessThan(p.easy);
  });

  it("matches ts-fsrs exactly and writes an append-only log with before/after state", () => {
    const c = make();
    const eventId = randomUUID();
    const out = reviewCard(h.db, c.id, 3, eventId, t0);
    expect(out.kind).toBe("reviewed");
    const expected = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false })).next(createEmptyCard(t0), t0, Rating.Good).card;
    expect(getCard(h.db, c.id)!.due).toBe(expected.due.toISOString());
    const log = h.db.select().from(cardReviews).where(eq(cardReviews.eventId, eventId)).get()!;
    expect(log).toMatchObject({ cardId: c.id, rating: 3, scheduler: SCHEDULER });
    expect(JSON.parse(log.prevState).reps).toBe(0);
    expect(JSON.parse(log.nextState).reps).toBe(1);
  });

  it("applies a repeated eventId only once", () => {
    const c = make();
    const eventId = randomUUID();
    reviewCard(h.db, c.id, 3, eventId, t0);
    const due1 = getCard(h.db, c.id)!.due;
    expect(reviewCard(h.db, c.id, 3, eventId, new Date(t0.getTime() + 3600_000)).kind).toBe("duplicate");
    expect(getCard(h.db, c.id)!.due).toBe(due1);
    expect(h.db.select().from(cardReviews).all()).toHaveLength(1);
  });

  it("leaves the queue after Good until due again; Again keeps it soon", () => {
    const a = make(); const b = make();
    reviewCard(h.db, a.id, 3, randomUUID(), t0);
    reviewCard(h.db, b.id, 1, randomUUID(), t0);
    const soon = new Date(t0.getTime() + 2 * 60_000);
    expect(reviewQueue(h.db, { now: soon }).items.map((i) => i.id)).toEqual([b.id]);
  });

  it("excludes suspended and archived cards and refuses to review them", () => {
    const a = make(); const b = make();
    updateCard(h.db, a.id, { suspended: true }, t0);
    updateCard(h.db, b.id, { archived: true }, t0);
    expect(reviewQueue(h.db, { now: t0 }).items).toEqual([]);
    expect(reviewCard(h.db, a.id, 3, randomUUID(), t0).kind).toBe("inactive");
  });
});

describe("cards API", () => {
  let t: TestApp;
  beforeEach(async () => { t = await signedInApp(); });
  afterEach(async () => { await t.close(); });

  it("creates cards for a topic, reviews one, and updates queue and summary", async () => {
    const space = Space.parse((await t.req({ method: "POST", url: "/api/spaces", payload: { name: "Shell" } })).json());
    const topic = Topic.parse((await t.req({ method: "POST", url: `/api/spaces/${space.id}/topics`, payload: { name: "fork" } })).json());
    const created = await t.req({ method: "POST", url: "/api/cards", payload: { topicId: topic.id, front: "Q", back: "A" } });
    expect(created.statusCode).toBe(201);
    const card = Card.parse(created.json());
    expect(card.state).toBe("new");

    const queue = ReviewQueue.parse((await t.req({ method: "GET", url: `/api/review/queue?spaceId=${space.id}` })).json());
    expect(queue.items[0]).toMatchObject({ id: card.id, topicName: "fork" });

    const reviewed = await t.req({ method: "POST", url: `/api/cards/${card.id}/review`, payload: { rating: 4, eventId: randomUUID() } });
    expect(Card.parse(reviewed.json()).state).toBe("review");
    expect(ReviewSummary.parse((await t.req({ method: "GET", url: "/api/review/summary" })).json())).toEqual({ due: 0, reviewedToday: 1 });

    const list = CardList.parse((await t.req({ method: "GET", url: `/api/cards?topicId=${topic.id}` })).json());
    expect(list.cards).toHaveLength(1);
  });

  it("validates input", async () => {
    expect((await t.req({ method: "POST", url: "/api/cards", payload: { front: "", back: "A" } })).statusCode).toBe(400);
    expect((await t.req({ method: "POST", url: "/api/cards", payload: { topicId: randomUUID(), front: "Q", back: "A" } })).json().error.messageKey).toBe("cards.badTopic");
    const card = Card.parse((await t.req({ method: "POST", url: "/api/cards", payload: { front: "Q", back: "A" } })).json());
    expect((await t.req({ method: "POST", url: `/api/cards/${card.id}/review`, payload: { rating: 5, eventId: randomUUID() } })).statusCode).toBe(400);
  });
});
