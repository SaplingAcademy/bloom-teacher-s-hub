import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ topicColumn: true, reads: [] as string[] }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        order: async () => {
          db.reads.push(`${table}: ${columns}`);
          if (!db.topicColumn && columns.includes("topic")) {
            return { data: null, error: { code: "42703", message: "column community_posts.topic does not exist" } };
          }
          return { data: [{ id: "p1", ...(columns.includes("topic") ? { topic: "questions" } : {}) }], error: null };
        },
      }),
    }),
  },
}));

import { fetchCommunityPostRows } from "@/lib/community-feed";

beforeEach(() => { db.topicColumn = true; db.reads = []; });

describe("community feed read", () => {
  it("reads posts with topic when the column exists", async () => {
    const result = await fetchCommunityPostRows();
    expect(result).toMatchObject({ topicsEnabled: true, error: null, data: [{ id: "p1", topic: "questions" }] });
    expect(db.reads).toHaveLength(1);
    expect(db.reads[0]).toContain("topic");
  });

  it("falls back to the previous read while the migration is not applied", async () => {
    db.topicColumn = false;
    const result = await fetchCommunityPostRows();
    expect(result).toMatchObject({ topicsEnabled: false, error: null, data: [{ id: "p1" }] });
    expect(db.reads).toHaveLength(2);
    expect(db.reads[1]).not.toContain("topic");
  });
});
