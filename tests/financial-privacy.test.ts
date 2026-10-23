import { describe, it, expect } from "vitest";
import { maskMoney, MASKED_MONEY, getFinancialValuesHidden, setFinancialValuesHidden } from "../src/lib/financial-privacy";
import { formatCentsToBRL } from "../src/lib/finance-engine";

describe("financial privacy", () => {
  it("masks formatted money only when hidden", () => {
    const real = formatCentsToBRL(543820);
    expect(maskMoney(real, true)).toBe(MASKED_MONEY);
    expect(maskMoney(real, false)).toBe(real);
  });
  it("keeps placeholders", () => {
    expect(maskMoney("—", true)).toBe("—");
  });
  it("shares one global state (hide anywhere, show anywhere)", () => {
    setFinancialValuesHidden(true);
    expect(getFinancialValuesHidden()).toBe(true);
    setFinancialValuesHidden(false);
    expect(getFinancialValuesHidden()).toBe(false);
  });
  it("does not change underlying formatting", () => {
    setFinancialValuesHidden(true);
    expect(formatCentsToBRL(543820)).toMatch(/5\.438,20/);
    setFinancialValuesHidden(false);
  });
});
