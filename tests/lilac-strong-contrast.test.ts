import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Owner name color (--lilac-strong): ≥ 4.5:1 on the light summary surfaces; dark theme keeps --lilac. */
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
const token = (scope: string, name: string) => {
  const match = block(scope).match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
  if (!match) throw new Error(`${scope} --${name} missing`);
  return match.slice(1).map(Number) as [number, number, number];
};
function luminance([L, C, h]: [number, number, number]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
const contrast = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);

describe("--lilac-strong (owner name in the project summary)", () => {
  it("reaches at least 4.5:1 on every light surface behind the summary", () => {
    const text = luminance(token(":root", "lilac-strong"));
    for (const surface of ["background", "card", "muted"]) expect(contrast(text, luminance(token(":root", surface)))).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps the current lilac in the dark theme", () => {
    expect(token(".dark", "lilac-strong")).toEqual(token(".dark", "lilac"));
  });
});
