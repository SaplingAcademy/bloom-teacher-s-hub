// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { communityFilterCounts, filterCommunityPosts, visibleCommunityFilters } from "../src/lib/community-topics";
import { CommunityBlocks, CommunityLayoutToggle } from "../src/components/community/CommunityBlocks";
import { t as translate } from "../src/lib/i18n";

const t = (k: string) => translate(k, "pt");
const post = (topic: string | null, extra: Record<string, unknown> = {}) =>
  ({ title: "T", content: "c", tags: [], topic, commentCount: 1, savedByMe: false, ...extra }) as never;
const posts = [post("questions", { commentCount: 0 }), post("questions"), post("materials", { savedByMe: true, title: "Flashcards" }), post(null)];

let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); root = createRoot(document.body.appendChild(document.createElement("div"))); });
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("Blocos: counts reuse the existing filter logic", () => {
  const filters = visibleCommunityFilters({ topics: true, saved: true });
  it("counts each category exactly like the feed shows it after clicking", () => {
    const counts = communityFilterCounts(posts, filters, "");
    for (const f of filters) expect(counts[f]).toBe(filterCommunityPosts(posts, f, "").length);
    expect(counts).toMatchObject({ all: 4, questions: 2, materials: 1, help: 1, saved: 1, lesson_ideas: 0 });
  });
  it("follows the search", () => {
    expect(communityFilterCounts(posts, filters, "flash")).toMatchObject({ all: 1, materials: 1, questions: 0 });
  });
});

describe("Blocos view", () => {
  it("shows each existing category with its number of posts and opens it on click", async () => {
    const onOpen = vi.fn();
    const filters = visibleCommunityFilters({ topics: true, saved: false });
    await act(async () => root.render(createElement(CommunityBlocks, { filters, counts: communityFilterCounts(posts, filters, ""), active: "all", onOpen, t })));
    const blocks = [...document.querySelectorAll<HTMLButtonElement>("[data-community-block]")];
    expect(blocks.map((b) => b.dataset.communityBlock)).toEqual(filters);
    const questions = blocks.find((b) => b.dataset.communityBlock === "questions")!;
    expect(questions.textContent).toContain("2 publicações");
    expect(blocks.find((b) => b.dataset.communityBlock === "materials")!.textContent).toContain("1 publicação");
    expect(questions.className).toContain("rounded-lg"); // less rounded than the cards
    await act(async () => questions.click());
    expect(onOpen).toHaveBeenCalledWith("questions");
  });
});

describe("Blocos / Feed switch", () => {
  it("two icon buttons, the current one pressed, switching through the callback (no reload)", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(createElement(CommunityLayoutToggle, { value: "feed", onChange, t })));
    const [blocks, feed] = [...document.querySelectorAll<HTMLButtonElement>("[data-testid=community-layout-toggle] button")];
    expect(blocks.getAttribute("aria-label")).toBe("Blocos");
    expect(feed.getAttribute("aria-pressed")).toBe("true");
    expect(blocks.querySelector("svg")).not.toBeNull();
    await act(async () => blocks.click());
    expect(onChange).toHaveBeenCalledWith("blocks");
  });
});

describe("Top contributors copy", () => {
  it("renamed with its subtitle", () => {
    expect(t("communityV1.highlights")).toBe("Maiores Contribuidores");
    expect(t("communityV1.highlightsSubtitle")).toBe("Professores que fazem a comunidade florescer");
  });
});
