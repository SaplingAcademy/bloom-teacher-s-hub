/** Commercial inactivity: profile edits/internal notes never participate. */
export const CLOSED_INACTIVITY_STAGES = ["Convertido", "won", "Perdido", "lost"];
const DAY_MS = 86_400_000;

export interface InactivityLead {
  id: string;
  teacher_id: string;
  full_name: string;
  stage: string;
  created_at?: string | null;
  last_interaction_at?: string | null;
}

export function inactivityPeriodDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("Invalid inactivity_period_days");
  }
  return value;
}

export function inactivityReference(lead: InactivityLead): Date | null {
  const raw = lead.last_interaction_at ?? lead.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function inactivityDueAt(lead: InactivityLead, days: number): Date | null {
  const ref = inactivityReference(lead);
  return ref ? new Date(ref.getTime() + inactivityPeriodDays(days) * DAY_MS) : null;
}

export function isInactiveLead(lead: InactivityLead, days: number, now: Date): boolean {
  if (CLOSED_INACTIVITY_STAGES.includes(lead.stage)) return false;
  const due = inactivityDueAt(lead, days);
  return due !== null && due.getTime() <= now.getTime();
}

/** One persistent event per real-contact cycle, not per title/day/settings edit. */
export function inactivityCycleKey(lead: InactivityLead): string | null {
  const ref = inactivityReference(lead);
  return ref ? `inactive-lead:${lead.teacher_id}:${lead.id}:${ref.toISOString()}` : null;
}

/** Existing backlog is visible in queues, but never bulk-tasked on activation. */
export function canCreateInactivityTask(lead: InactivityLead, days: number, now: Date, activatedAt: string): boolean {
  const activation = new Date(activatedAt);
  const due = inactivityDueAt(lead, days);
  return Number.isFinite(activation.getTime()) && due !== null &&
    isInactiveLead(lead, days, now) && due.getTime() >= activation.getTime();
}