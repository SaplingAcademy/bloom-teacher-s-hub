export interface SchedulingContext { date: string; startTime?: string }

// Use the form's existing duration, never a new scheduling or availability rule.
export function lessonSlotDefaults(context: SchedulingContext | null, normalDate: string, duration: number) {
  const startTime = context?.startTime || "09:00";
  const end = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) + duration;
  return {
    date: context?.date || normalDate,
    startTime,
    endTime: end < 1440 ? `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` : "",
  };
}