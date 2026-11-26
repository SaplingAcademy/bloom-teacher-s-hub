import { describe, expect, it } from "vitest";
import {
  buildItemPayload, canPublishTemplate, emptyItemDraft, itemDraftFrom, itemTypesForSkill, skillAcceptsNewItems, splitTemplates,
  templateActions, templateSettingsFor, timingOf, validateTemplateDraft, isPlacementLocked, isPlacementNotDeployed,
  type PlacementItem, type PlacementSection, type PlacementTemplate,
} from "../src/lib/placement";

const tpl = (over: Partial<PlacementTemplate>): PlacementTemplate => ({
  id: "t", teacher_id: "me", source_template_id: null, title: "T", description: null, status: "draft", settings: {}, version: 1,
  created_at: "", updated_at: "", ...over,
});

describe("template draft", () => {
  it("requires a title and 1–6 distinct skills; test timing needs 1–600 minutes", () => {
    const ok = { title: "Geral", description: "", skills: ["grammar" as const], timing: "none" as const, testMinutes: null };
    expect(validateTemplateDraft(ok)).toEqual([]);
    expect(validateTemplateDraft({ ...ok, title: "  " })).toContain("title");
    expect(validateTemplateDraft({ ...ok, skills: [] })).toContain("skills");
    expect(validateTemplateDraft({ ...ok, skills: ["grammar", "grammar"] })).toContain("skills");
    expect(validateTemplateDraft({ ...ok, timing: "test", testMinutes: null })).toContain("testMinutes");
    expect(validateTemplateDraft({ ...ok, timing: "test", testMinutes: 45 })).toEqual([]);
  });
  it("stores the timing mode in settings; the test limit only for the whole-test mode", () => {
    expect(templateSettingsFor("none", null)).toEqual({ timing: { mode: "none" } });
    expect(templateSettingsFor("test", 30)).toEqual({ timing: { mode: "test" }, time_limit_minutes: 30 });
    expect(templateSettingsFor("skill", 30, { time_limit_minutes: 30, adaptive: { x: 1 } })).toEqual({ timing: { mode: "skill" }, adaptive: { x: 1 } });
    expect(timingOf({ settings: { timing: { mode: "test" }, time_limit_minutes: 30 } })).toEqual({ mode: "test", testMinutes: 30 });
    expect(timingOf({ settings: {} })).toEqual({ mode: "none", testMinutes: null });
  });
});

describe("item rules mirror the database constraints", () => {
  it("allowed types per skill; Listening waits for audio upload", () => {
    expect(itemTypesForSkill("speaking")).toEqual(["oral_response"]);
    expect(itemTypesForSkill("writing")).toEqual(["open_text"]);
    expect(itemTypesForSkill("grammar")).not.toContain("open_text");
    expect(skillAcceptsNewItems("listening")).toBe(false);
    expect(skillAcceptsNewItems("reading")).toBe(true);
  });
  it("single choice: 2+ distinct options and exactly one correct → answer_key { correct: [i] }", () => {
    const draft = { ...emptyItemDraft("grammar"), text: "She ___ to school.", options: ["go", "goes"], correct: [1] };
    const result = buildItemPayload("grammar", draft);
    expect(result).toMatchObject({ ok: true, payload: { item_type: "single_choice", options: ["go", "goes"], answer_key: { correct: [1] }, rubric: null } });
    expect(buildItemPayload("grammar", { ...draft, correct: [] })).toMatchObject({ ok: false, errors: ["correct"] });
    expect(buildItemPayload("grammar", { ...draft, options: ["go", "go"] })).toMatchObject({ ok: false });
    expect(buildItemPayload("grammar", { ...draft, options: ["go"] })).toMatchObject({ ok: false });
  });
  it("multiple choice, true/false and gap fill build their answer keys", () => {
    const base = { ...emptyItemDraft("vocabulary"), text: "Pick" };
    expect(buildItemPayload("vocabulary", { ...base, item_type: "multiple_choice", options: ["a", "b", "c"], correct: [2, 0] }))
      .toMatchObject({ ok: true, payload: { answer_key: { correct: [0, 2] } } });
    expect(buildItemPayload("vocabulary", { ...base, item_type: "true_false", trueFalse: false }))
      .toMatchObject({ ok: true, payload: { options: null, answer_key: { correct: false } } });
    expect(buildItemPayload("vocabulary", { ...base, item_type: "true_false", trueFalse: null })).toMatchObject({ ok: false, errors: ["trueFalse"] });
    expect(buildItemPayload("vocabulary", { ...base, item_type: "gap_fill", accepted: [" went ", "went", ""] }))
      .toMatchObject({ ok: true, payload: { options: null, answer_key: { accepted: ["went"] } } });
  });
  it("Speaking/Writing are manual: never an answer key, optional rubric, never in screening", () => {
    const w = { ...emptyItemDraft("writing"), text: "Write about your weekend.", rubric: "Coherence" };
    expect(buildItemPayload("writing", w)).toMatchObject({ ok: true, payload: { item_type: "open_text", answer_key: null, rubric: { guidance: "Coherence" } } });
    expect(buildItemPayload("speaking", { ...emptyItemDraft("speaking"), text: "Describe your city." }))
      .toMatchObject({ ok: true, payload: { item_type: "oral_response", answer_key: null, rubric: null } });
    expect(buildItemPayload("writing", { ...w, is_screening: true })).toMatchObject({ ok: false, errors: ["screening"] });
  });
  it("refuses formats not available in this stage and types of another skill", () => {
    const d = { ...emptyItemDraft("grammar"), text: "x" };
    expect(buildItemPayload("grammar", { ...d, item_type: "matching" })).toMatchObject({ ok: false, errors: ["type"] });
    expect(buildItemPayload("grammar", { ...d, item_type: "ordering" })).toMatchObject({ ok: false, errors: ["type"] });
    expect(buildItemPayload("speaking", { ...d, item_type: "single_choice", options: ["a", "b"], correct: [0] })).toMatchObject({ ok: false });
  });
  it("Reading keeps the passage in the prompt; per-task limit goes to metadata", () => {
    const r = { ...emptyItemDraft("reading"), text: "Why?", passage: "Long text", item_type: "true_false" as const, trueFalse: true, timeLimitSeconds: 90 };
    expect(buildItemPayload("reading", r, { topic: "x" })).toMatchObject({ ok: true, payload: { prompt: { text: "Why?", passage: "Long text" }, metadata: { topic: "x", time_limit_seconds: 90 } } });
    expect(buildItemPayload("grammar", { ...r, passage: "ignored" })).toMatchObject({ ok: true, payload: { prompt: { text: "Why?" } } });
  });
  it("editing round-trips a saved item", () => {
    const saved = { item_type: "single_choice", level: "B1", prompt: { text: "Q" }, options: ["a", "b"], answer_key: { correct: [1] }, rubric: null,
      points: 2, is_screening: true, estimated_seconds: 30, metadata: { time_limit_seconds: 60 } } as unknown as PlacementItem;
    const draft = itemDraftFrom(saved);
    expect(draft).toMatchObject({ item_type: "single_choice", level: "B1", text: "Q", options: ["a", "b"], correct: [1], points: 2, timeLimitSeconds: 60 });
    expect(buildItemPayload("grammar", draft)).toMatchObject({ ok: true, payload: { answer_key: { correct: [1] }, is_screening: true } });
  });
});

describe("status, ownership and publishing", () => {
  it("drafts are edited by the owner only; published cannot be deleted; Bloom defaults are read-only for teachers", () => {
    const me = { ownerId: "me", isSuperAdmin: false };
    expect(templateActions(tpl({ status: "draft" }), me)).toMatchObject({ edit: true, publish: true, remove: true });
    expect(templateActions(tpl({ status: "published" }), me)).toMatchObject({ edit: false, archive: true, remove: false, duplicate: true });
    expect(templateActions(tpl({ status: "archived" }), me)).toMatchObject({ edit: false, republish: true, remove: true });
    expect(templateActions(tpl({ teacher_id: null, status: "published" }), me)).toMatchObject({ edit: false, archive: false, remove: false, duplicate: true });
    expect(templateActions(tpl({ teacher_id: "other", status: "draft" }), me)).toMatchObject({ edit: false, remove: false, duplicate: false });
    expect(templateActions(tpl({ teacher_id: null, status: "draft" }), { ownerId: "me", isSuperAdmin: true })).toMatchObject({ edit: true });
  });
  it("splits Bloom defaults from own templates", () => {
    const r = splitTemplates([tpl({ id: "a", teacher_id: null }), tpl({ id: "b" })]);
    expect([r.system.map((x) => x.id), r.mine.map((x) => x.id)]).toEqual([["a"], ["b"]]);
  });
  it("publishing needs at least one active question in every skill", () => {
    const sections = [{ id: "s1" }, { id: "s2" }] as PlacementSection[];
    expect(canPublishTemplate(sections, [{ section_id: "s1", active: true }] as PlacementItem[])).toBe(false);
    expect(canPublishTemplate(sections, [{ section_id: "s1", active: true }, { section_id: "s2", active: true }] as PlacementItem[])).toBe(true);
  });
  it("recognizes the frozen-version trigger and a missing migration", () => {
    expect(isPlacementLocked({ message: "PLACEMENT_TEMPLATE_LOCKED: ..." })).toBe(true);
    expect(isPlacementNotDeployed({ code: "PGRST205", message: "Could not find the table 'public.placement_templates'" })).toBe(true);
    expect(isPlacementNotDeployed({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
