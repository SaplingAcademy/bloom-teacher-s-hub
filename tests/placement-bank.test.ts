import { describe, expect, it } from "vitest";
import {
  EMPTY_BANK_FILTERS, PLACEMENT_BANK_NOT_DEPLOYED, bankImportErrorKind, bankRowFrom, bankTopics, filterBankItems,
  isBankItemSelectable, isBankNotDeployed, personalCopyOf, toggleSelection, validateBankMeta, type BankItem,
} from "../src/lib/placement-bank";
import { buildItemPayload, emptyItemDraft } from "../src/lib/placement";

const base: BankItem = {
  id: "x", teacher_id: null, source_bank_item_id: null, skill: "grammar", topic: "Present simple", subskill: null,
  item_type: "single_choice", level: "A1", is_screening: false, points: 1, estimated_seconds: null, tags: [],
  prompt: { text: "She ___ to school." }, options: ["go", "goes"], answer_key: { correct: [1] }, rubric: null, media: null,
  metadata: {}, status: "published", created_at: "", updated_at: "",
};
const item = (over: Partial<BankItem>): BankItem => ({ ...base, ...over });
const items = [
  item({ id: "g1", level: "B1", topic: "Past simple", prompt: { text: "Yesterday I ___ him." }, item_type: "gap_fill", options: null, answer_key: { accepted: ["saw"] } }),
  item({ id: "g2", level: "A1", topic: "Present simple", prompt: { text: "She ___ to school." }, options: ["go", "goes"] }),
  item({ id: "g3", level: "A2", topic: "Articles", prompt: { text: "We say “an hour”." }, item_type: "true_false", options: null, answer_key: { correct: true } }),
  item({ id: "v1", skill: "vocabulary", level: "A1", topic: "Food", prompt: { text: "Which is a fruit?" }, options: ["bread", "apple"] }),
  item({ id: "w1", skill: "writing", level: "B1", topic: "Holidays", item_type: "open_text", options: null, answer_key: null, rubric: { guidance: "x" } }),
];

describe("Question Bank — filters", () => {
  it("never shows questions of another skill than the section's", () => {
    expect(filterBankItems(items, "grammar", EMPTY_BANK_FILTERS).map((i) => i.id)).toEqual(["g2", "g3", "g1"]);
    expect(filterBankItems(items, "vocabulary", EMPTY_BANK_FILTERS).map((i) => i.id)).toEqual(["v1"]);
    expect(filterBankItems(items, "reading", EMPTY_BANK_FILTERS)).toEqual([]);
  });
  it("filters by CEFR levels (several at once), topic and type, sorted by level", () => {
    expect(filterBankItems(items, "grammar", { ...EMPTY_BANK_FILTERS, levels: ["A1", "B1"] }).map((i) => i.id)).toEqual(["g2", "g1"]);
    expect(filterBankItems(items, "grammar", { ...EMPTY_BANK_FILTERS, topic: "Articles" }).map((i) => i.id)).toEqual(["g3"]);
    expect(filterBankItems(items, "grammar", { ...EMPTY_BANK_FILTERS, type: "gap_fill" }).map((i) => i.id)).toEqual(["g1"]);
    expect(filterBankItems(items, "grammar", { ...EMPTY_BANK_FILTERS, levels: ["C2"] })).toEqual([]);
  });
  it("searches prompt, options and topic, ignoring case and accents", () => {
    expect(filterBankItems(items, "grammar", { ...EMPTY_BANK_FILTERS, search: "GOES" }).map((i) => i.id)).toEqual(["g2"]);
    expect(filterBankItems(items, "grammar", { ...EMPTY_BANK_FILTERS, search: "past" }).map((i) => i.id)).toEqual(["g1"]);
    expect(filterBankItems([item({ id: "p", prompt: { text: "Ação rápida" } })], "grammar", { ...EMPTY_BANK_FILTERS, search: "acao" }).map((i) => i.id)).toEqual(["p"]);
  });
  it("lists the distinct topics of the section's skill only", () => {
    expect(bankTopics(items, "grammar")).toEqual(["Articles", "Past simple", "Present simple"]);
  });
});

describe("Question Bank — selection", () => {
  it("only published questions not yet in the section can be selected", () => {
    expect(isBankItemSelectable(base, new Set())).toBe(true);
    expect(isBankItemSelectable(item({ status: "draft" }), new Set())).toBe(false);
    expect(isBankItemSelectable(base, new Set(["x"]))).toBe(false);
  });
  it("multi-selection keeps the click order and toggles off", () => {
    let selected = toggleSelection([], "b");
    selected = toggleSelection(selected, "a");
    selected = toggleSelection(selected, "c");
    expect(selected).toEqual(["b", "a", "c"]);
    expect(toggleSelection(selected, "a")).toEqual(["b", "c"]);
  });
});

describe("Question Bank — own questions", () => {
  it("validates topic (required, ≤80) and subskill (≤80)", () => {
    expect(validateBankMeta("Present simple", "")).toEqual([]);
    expect(validateBankMeta("  ", "")).toEqual(["topic"]);
    expect(validateBankMeta("x".repeat(81), "y".repeat(81))).toEqual(["topic", "subskill"]);
  });
  it("builds a bank row with the same formats as placement items, without placement time limits", () => {
    const draft = { ...emptyItemDraft("grammar"), text: " She ___ ", options: ["go", "goes"], correct: [1], timeLimitSeconds: 30 };
    const built = buildItemPayload("grammar", draft);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const row = bankRowFrom("grammar", built.payload, { topic: " Present simple ", subskill: " ", published: true });
    expect(row).toMatchObject({ skill: "grammar", topic: "Present simple", subskill: null, item_type: "single_choice", status: "published",
      prompt: { text: "She ___" }, options: ["go", "goes"], answer_key: { correct: [1] }, rubric: null });
    expect(row.metadata).toEqual({});
    expect(bankRowFrom("grammar", built.payload, { topic: "T", subskill: "", published: false }).status).toBe("draft");
  });
  it("duplicating an official question makes an independent, usable copy that records its origin", () => {
    const copy = personalCopyOf(item({ id: "official-1", teacher_id: null }));
    expect(copy).toMatchObject({ source_bank_item_id: "official-1", status: "published", answer_key: { correct: [1] }, options: ["go", "goes"] });
    expect(copy).not.toHaveProperty("id");
    expect(copy).not.toHaveProperty("teacher_id");
  });
});

describe("Question Bank — errors", () => {
  it("detects the bank migration not applied yet (table, column or RPC missing)", () => {
    expect(isBankNotDeployed({ code: "PGRST205", message: "Could not find the table 'public.placement_bank_items'" })).toBe(true);
    expect(isBankNotDeployed({ code: "PGRST202", message: "Could not find the function public.placement_import_bank_items" })).toBe(true);
    expect(isBankNotDeployed({ code: "42703", message: "column placement_items.source_bank_item_id does not exist" })).toBe(true);
    expect(isBankNotDeployed({ code: "42501", message: "permission denied" })).toBe(false);
  });
  it("maps the RPC markers to teacher-facing reasons", () => {
    expect(bankImportErrorKind(new Error("PLACEMENT_TEMPLATE_LOCKED: ..."))).toBe("locked");
    expect(bankImportErrorKind(new Error("PLACEMENT_BANK_SKILL_MISMATCH: ..."))).toBe("unavailable");
    expect(bankImportErrorKind(new Error("PLACEMENT_BANK_ITEM_UNAVAILABLE: ..."))).toBe("unavailable");
    expect(bankImportErrorKind(new Error("PLACEMENT_ACCESS_DENIED: ..."))).toBe("denied");
    expect(bankImportErrorKind(new Error(PLACEMENT_BANK_NOT_DEPLOYED))).toBe("notDeployed");
    expect(bankImportErrorKind(new Error("boom"))).toBe("failed");
  });
});
