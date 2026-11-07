/** Shared quantity result; scheduling eligibility remains in the existing generators. */
export interface LessonPlanQuantity {
  requested: number;
  possible: number;
  missing: number;
}

export class InsufficientLessonPeriodError extends Error {
  readonly quantity: LessonPlanQuantity;
  constructor(quantity: LessonPlanQuantity) {
    super("Insufficient lesson period");
    this.name = "InsufficientLessonPeriodError";
    this.quantity = quantity;
  }
}

export function validateLessonPeriod(startDate: string, endDate?: string | null) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(startDate) || (endDate && (!valid(endDate) || endDate < startDate))) {
    throw new Error("Invalid lesson period");
  }
}

export function lessonPlanQuantity<T>(eligible: T[], requested: number): LessonPlanQuantity {
  if (!Number.isSafeInteger(requested) || requested <= 0) throw new Error("Invalid lesson quantity");
  return { requested, possible: eligible.length, missing: Math.max(0, requested - eligible.length) };
}

export function requireLessonQuantity<T>(eligible: T[], requested: number): T[] {
  const quantity = lessonPlanQuantity(eligible, requested);
  if (quantity.missing > 0) throw new InsufficientLessonPeriodError(quantity);
  return eligible.slice(0, requested);
}

/** Duplicate date/start blocks are one occurrence, just like persistence matching. */
export function uniqueLessonSlots<T>(slots: T[], key: (slot: T) => string): T[] {
  const seen = new Set<string>();
  return slots.filter((slot) => {
    const value = key(slot);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}