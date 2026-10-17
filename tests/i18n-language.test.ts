import { describe, expect, it } from "bun:test";
import { detectLanguage, formatStatusLabel, matchLanguage, fmt, t, translations } from "../src/lib/i18n";
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

describe("calendar lesson details enum labels", () => {
  it("translates level values without changing stored values", () => {
    expect(formatStatusLabel("Beginner", "pt")).toBe("Iniciante");
    expect(formatStatusLabel("Beginner", "en")).toBe("Beginner");
    expect(formatStatusLabel("Advanced", "pt")).toBe("Avançado");
    expect(formatStatusLabel("A1", "pt")).toBe("A1");
  });
  it("translates focus values", () => {
    expect(formatStatusLabel("General", "pt")).toBe("Geral");
    expect(formatStatusLabel("General English", "pt")).toBe("Inglês Geral");
    expect(formatStatusLabel("General English", "en")).toBe("General English");
  });
  it("translates student type and modality", () => {
    expect(formatStatusLabel("Group", "pt")).toBe("Turma");
    expect(formatStatusLabel("Private", "pt")).toBe("VIP");
    expect(formatStatusLabel("In person", "pt")).toBe("Presencial");
    expect(formatStatusLabel("Online", "en")).toBe("Online");
  });
});
