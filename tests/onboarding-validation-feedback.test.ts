import { afterEach, describe, expect, test } from "bun:test";
import { focusFirstOnboardingError } from "../src/lib/onboarding-validation-feedback";

const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

function setup(options: { reduced?: boolean; hiddenFirst?: boolean; section?: boolean } = {}) {
  const calls: Array<[string, unknown]> = [];
  const control = { focus: (value: unknown) => calls.push(["focus", value]) };
  const first = {
    tabIndex: 0,
    getClientRects: () => options.hiddenFirst ? [] : [{}],
    closest: () => null,
    matches: () => !options.section,
    querySelector: () => control,
    focus: (value: unknown) => calls.push(["first", value]),
    getBoundingClientRect: () => ({ top: -300 }),
  };
  const second = {
    ...first,
    getClientRects: () => [{}],
    focus: (value: unknown) => calls.push(["second", value]),
  };
  const container = { querySelectorAll: () => [first, second] } as unknown as HTMLElement;
  const header = { getBoundingClientRect: () => ({ bottom: 96 }) } as unknown as HTMLElement;
  globalThis.window = {
    scrollY: 1000,
    scrollTo: (value: unknown) => calls.push(["scroll", value]),
    matchMedia: () => ({ matches: Boolean(options.reduced) }),
  } as unknown as Window & typeof globalThis;
  return { calls, container, header };
}

describe("onboarding blocked-validation direction", () => {
  test("targets only the first visible error, focuses without jumping and clears the measured header", () => {
    const { calls, container, header } = setup();
    expect(focusFirstOnboardingError(container, header)).toBe(true);
    expect(calls).toEqual([
      ["first", { preventScroll: true }],
      ["scroll", { top: 588, behavior: "smooth" }],
    ]);
  });

  test("ignores a hidden error before the first visible error", () => {
    const { calls, container, header } = setup({ hiddenFirst: true });
    focusFirstOnboardingError(container, header);
    expect(calls[0]).toEqual(["second", { preventScroll: true }]);
  });

  test("an invalid section focuses its existing editable control", () => {
    const { calls, container, header } = setup({ section: true });
    focusFirstOnboardingError(container, header);
    expect(calls[0]).toEqual(["focus", { preventScroll: true }]);
  });

  test("reduced motion uses instant positioning, not smooth animation", () => {
    const { calls, container, header } = setup({ reduced: true });
    focusFirstOnboardingError(container, header);
    expect(calls[1]).toEqual(["scroll", { top: 588, behavior: "instant" }]);
  });

  test("each repeated blocked attempt focuses and scrolls again", () => {
    const { calls, container, header } = setup();
    focusFirstOnboardingError(container, header);
    focusFirstOnboardingError(container, header);
    expect(calls.filter(([kind]) => kind === "first")).toHaveLength(2);
    expect(calls.filter(([kind]) => kind === "scroll")).toHaveLength(2);
  });

  test("without a marked blocking error there is no scroll or focus", () => {
    const { calls, header } = setup();
    expect(focusFirstOnboardingError(null, header)).toBe(false);
    const empty = { querySelectorAll: () => [] } as unknown as HTMLElement;
    expect(focusFirstOnboardingError(empty, header)).toBe(false);
    expect(calls).toEqual([]);
  });
});