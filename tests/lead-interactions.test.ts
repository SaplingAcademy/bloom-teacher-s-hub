import { describe, it, expect } from "vitest";
import { buildInteractionInsert, isEffectiveContact, mergeLeadTimeline, validateInteractionDraft } from "@/lib/lead-interactions";

const now = new Date("2026-11-04T15:00:00");
const draft = { type: "call" as const, occurredAt: "2026-11-01T10:30", description: "  Falou sobre horários " };

describe("lead interactions", () => {
  it("builds a teacher/lead scoped insert with only the interaction fields", () => {
    const row = buildInteractionInsert("t1", "l1", draft);
    expect(row).toEqual({ teacher_id: "t1", lead_id: "l1", type: "call", occurred_at: new Date("2026-11-01T10:30").toISOString(), description: "Falou sobre horários" });
    expect(Object.keys(row)).not.toContain("stage");
    expect(Object.keys(row)).not.toContain("contacted_at");
    expect(Object.keys(row)).not.toContain("last_interaction_at");
  });
  it("accepts past dates and rejects future dates", () => {
    expect(validateInteractionDraft(draft, now)).toBeNull();
    expect(validateInteractionDraft({ ...draft, occurredAt: "2026-11-04T15:05" }, now)).toBe("dateFuture");
  });
  it("requires a description and a date", () => {
    expect(validateInteractionDraft({ ...draft, description: "  " }, now)).toBe("descriptionRequired");
    expect(validateInteractionDraft({ ...draft, occurredAt: "" }, now)).toBe("dateRequired");
  });
  it("internal notes are not an effective contact", () => {
    expect(isEffectiveContact("note")).toBe(false);
    expect(isEffectiveContact("whatsapp")).toBe(true);
  });
  it("merges manual and automatic entries newest first, keeping their origin", () => {
    const tl = mergeLeadTimeline(
      [{ id: "1", lead_id: "l1", type: "call", description: "a", occurred_at: "2026-11-01T10:00:00Z", created_at: "2026-11-04T10:00:00Z" }],
      [{ id: "2", teacher_id: "t1", action_type: "x", description: "b", created_at: "2026-11-02T10:00:00Z" }],
    );
    expect(tl.map((e) => [e.kind, e.description])).toEqual([["automatic", "b"], ["manual", "a"]]);
  });
});
