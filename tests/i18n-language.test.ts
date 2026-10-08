import { describe, expect, it } from "bun:test";
import { detectLanguage, matchLanguage, fmt, t, translations } from "../src/lib/i18n";
import { uiTranslations } from "../src/lib/i18n-ui";

describe("language detection", () => {
  it("maps locales", () => {
    expect(matchLanguage("pt-BR")).toBe("pt");
    expect(matchLanguage("pt-PT")).toBe("pt");
    expect(matchLanguage("en-GB")).toBe("en");
    expect(matchLanguage("ja-JP")).toBeNull();
  });
  it("uses first supported browser locale, else English", () => {
    expect(detectLanguage(["ja-JP", "pt-BR"])).toBe("pt");
    expect(detectLanguage(["en-US"])).toBe("en");
    expect(detectLanguage(["ja-JP"])).toBe("en");
  });
});

describe("ui dictionaries", () => {
  it("pt and en have the same keys", () => {
    const keys = (o: any, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? keys(v, p + k + ".") : [p + k]);
    expect(keys(uiTranslations.en).sort()).toEqual(keys(uiTranslations.pt).sort());
  });
  it("translates lesson types without changing stored values", () => {
    expect(t("onboarding.onboardingOptions.lessonTypes.Pair", "pt")).toBe("Em dupla");
    expect(t("onboarding.onboardingOptions.lessonTypes.Pair", "en")).toBe("Pair");
  });
  it("fmt fills placeholders", () => {
    expect(fmt(t("onboardingUi.stepOf", "en"), 2, 7)).toBe("Step 2 of 7");
  });
});
