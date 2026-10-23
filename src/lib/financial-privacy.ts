/**
 * Global, visual-only "hide financial values" preference (like banking apps).
 * Never feeds calculations, queries or writes — it only masks rendered strings.
 * Persisted per device in localStorage (listed as a device key in user-storage).
 */
import { useCallback, useSyncExternalStore } from "react";

export const FINANCIAL_PRIVACY_KEY = "bloom.privacy.financialHidden";
export const MASKED_MONEY = "R$ ••••••";

const listeners = new Set<() => void>();
let hidden: boolean | null = null;

function read(): boolean {
  if (hidden !== null) return hidden;
  if (typeof window === "undefined") return false;
  try {
    hidden = localStorage.getItem(FINANCIAL_PRIVACY_KEY) === "1";
  } catch {
    hidden = false;
  }
  return hidden;
}

export function getFinancialValuesHidden(): boolean {
  return read();
}

export function setFinancialValuesHidden(next: boolean): void {
  hidden = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(FINANCIAL_PRIVACY_KEY, next ? "1" : "0");
    } catch {
      /* visual preference only */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pure mask: returns the formatted value untouched when visible. */
export function maskMoney(formatted: string, isHidden: boolean): string {
  if (!isHidden) return formatted;
  // Keep placeholders such as "—" readable.
  if (!/\d/.test(formatted)) return formatted;
  return MASKED_MONEY;
}

export function useFinancialPrivacy() {
  const financialValuesHidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => setFinancialValuesHidden(!read()), []);
  const money = useCallback(
    (formatted: string) => maskMoney(formatted, financialValuesHidden),
    [financialValuesHidden],
  );
  return { financialValuesHidden, toggle, money };
}
