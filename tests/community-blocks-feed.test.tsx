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
    expect(blocks.map((b) => b.dataset.communityBlock).sort()).toEqual([...filters].sort()); // every filter stays reachable
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

describe("Blocos with personality", () => {
  const filters = visibleCommunityFilters({ topics: true, saved: true });
  const render = async (onOpen = vi.fn()) => {
    await act(async () => root.render(createElement(CommunityBlocks, { filters, counts: communityFilterCounts(posts, filters, ""), active: "all", onOpen, t })));
    return onOpen;
  };
  const block = (f: string) => document.querySelector<HTMLButtonElement>(`[data-community-block="${f}"]`)!;
  it("each subject has an abstract decorative cover, its title, short description and count", async () => {
    await render();
    const expected = {
      questions: "Pergunte, compartilhe e encontre respostas.",
      lesson_ideas: "Inspirações para aulas mais criativas.",
      materials: "Recursos para facilitar sua rotina.",
      management: "Organize seu trabalho com mais leveza.",
      achievements: "Compartilhe suas pequenas e grandes vitórias.",
    };
    for (const [topic, description] of Object.entries(expected)) {
      const tile = block(topic);
      const cover = tile.querySelector<HTMLElement>(`[data-community-cover="${topic}"]`)!;
      expect(cover.getAttribute("aria-hidden")).toBe("true");
      expect(cover.className).toContain("pointer-events-none");
      expect(cover.querySelector("svg")).not.toBeNull();
      expect(cover.querySelector("image, img")).toBeNull(); // no photos / external images
      expect(tile.textContent).toContain(description);
    }
    expect(block("questions").textContent).toContain("2 publicações");
    // Covers vary discreetly between subjects.
    const backgrounds = Object.keys(expected).map((topic) => block(topic).querySelector<HTMLElement>("[data-community-cover]")!.className);
    expect(new Set(backgrounds).size).toBe(5);
  });
  it("'Ajude outro professor' is a featured horizontal block above the subjects, opening the help feed", async () => {
    const onOpen = await render();
    const help = block("help");
    expect(help.hasAttribute("data-community-featured")).toBe(true);
    expect(help.textContent).toContain("Ajude outro professor");
    expect(help.textContent).toContain("Sua experiência pode fazer a diferença na rotina de outro professor.");
    expect(help.querySelector("[data-community-help-art]")!.getAttribute("aria-hidden")).toBe("true");
    expect(help.closest('[role="list"]')).toBeNull(); // not inside the subjects grid
    expect(help.compareDocumentPosition(block("questions")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => help.click());
    expect(onOpen).toHaveBeenCalledWith("help");
  });
  it("'Tudo' and 'Salvos' stay reachable as discreet navigation, without covers", async () => {
    const onOpen = await render();
    for (const f of ["all", "saved"]) {
      expect(block(f).closest('[data-testid="community-blocks-nav"]')).not.toBeNull();
      expect(block(f).querySelector("[data-community-cover]")).toBeNull();
    }
    await act(async () => block("saved").click());
    expect(onOpen).toHaveBeenCalledWith("saved");
  });
});
