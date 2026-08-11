import { supabase } from "@/lib/supabase";
import {
  WorkingAvailability,
  RestBlock,
  fetchTeacherWorkingAvailability,
  fetchTeacherRestBlocks,
  WEEKDAYS_MAP,
} from "@/lib/availability-engine";

export interface DayCapacity {
  day: string; // "Monday", "Tuesday", etc.
  dayLabelPt: string; // "Seg", "Ter", etc.
  fullPt: string; // "Segunda-feira", etc.
  enabled: boolean;
  workStartTime?: string;
  workEndTime?: string;
  validSlots: number;
  occupiedSlots: number;
  remainingSlots: number;
  restBlocksCount: number;
}

export interface RealCapacityResult {
  hasWorkingHours: boolean;
  totalValidSlots: number;
  totalOccupiedSlots: number;
  totalRemainingSlots: number;
  occupancyPct: number;
  slotDurationMinutes: number;
  days: DayCapacity[];
}

/**
 * Converts HH:MM time string to total minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Computes available non-rest working intervals for a day.
 * Subtracts rest blocks from the main [workStart, workEnd] window.
 */
export function getWorkingSegments(
  workStartStr: string,
  workEndStr: string,
  restBlocks: RestBlock[]
): Array<{ start: number; end: number }> {
  const workStart = timeToMinutes(workStartStr);
  const workEnd = timeToMinutes(workEndStr);

  if (workStart >= workEnd) return [];

  // Sort and filter rest blocks that intersect workStart..workEnd
  const validRest = restBlocks
    .map((b) => ({
      start: Math.max(workStart, timeToMinutes(b.startTime)),
      end: Math.min(workEnd, timeToMinutes(b.endTime)),
    }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  if (validRest.length === 0) {
    return [{ start: workStart, end: workEnd }];
  }

  const segments: Array<{ start: number; end: number }> = [];
  let currentStart = workStart;

  for (const rb of validRest) {
    if (rb.start > currentStart) {
      segments.push({ start: currentStart, end: rb.start });
    }
    currentStart = Math.max(currentStart, rb.end);
  }

  if (currentStart < workEnd) {
    segments.push({ start: currentStart, end: workEnd });
  }

  return segments;
}

/**
 * Dynamically calculates teacher teaching capacity considering:
 * 1. Working availability per weekday
 * 2. Recurring rest blocks
 * 3. Booked student/class recurring schedules
 * 4. Configured lesson slot duration
 */
export async function calculateRealCapacity(
  teacherId: string
): Promise<RealCapacityResult> {
  const emptyResult: RealCapacityResult = {
    hasWorkingHours: false,
    totalValidSlots: 0,
    totalOccupiedSlots: 0,
    totalRemainingSlots: 0,
    occupancyPct: 0,
    slotDurationMinutes: 60,
    days: [],
  };

  if (!teacherId) return emptyResult;

  try {
    // 1. Fetch Working Availability & Rest Blocks
    const [workingAvail, restBlocksData, settingsRes] = await Promise.all([
      fetchTeacherWorkingAvailability(teacherId),
      fetchTeacherRestBlocks(teacherId),
      supabase
        .from("settings")
        .select("default_class_duration")
        .eq("teacher_id", teacherId)
        .maybeSingle(),
    ]);

    const enabledDays = workingAvail.filter((a) => a.enabled);
    if (enabledDays.length === 0) {
      return emptyResult;
    }

    const slotDuration = settingsRes?.data?.default_class_duration || 60;

    // 2. Fetch Active Student Schedules
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name, status")
      .eq("teacher_id", teacherId)
      .neq("status", "Inactive");

    const studentIds = (studentsData || []).map((s) => s.id);
    let studentSchedules: any[] = [];
    if (studentIds.length > 0) {
      const { data: schData } = await supabase
        .from("student_schedules")
        .select("student_id, weekday, start_time, end_time")
        .in("student_id", studentIds);
      studentSchedules = schData || [];
    }

    // 3. Fetch Active Class Schedules
    const { data: classesData } = await supabase
      .from("classes")
      .select("id, name, status")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const classIds = (classesData || []).map((c) => c.id);
    let classSchedules: any[] = [];
    if (classIds.length > 0) {
      const { data: cSchData } = await supabase
        .from("class_schedules")
        .select("class_id, weekday, start_time, end_time")
        .in("class_id", classIds);
      classSchedules = cSchData || [];
    }

    // 4. Calculate per weekday
    let totalValidSlots = 0;
    let totalOccupiedSlots = 0;
    const daysResult: DayCapacity[] = [];

    for (const wItem of WEEKDAYS_MAP) {
      const dayKey = wItem.key;
      const dayAvail = workingAvail.find(
        (a) => a.day.toLowerCase() === dayKey.toLowerCase()
      );

      if (!dayAvail || !dayAvail.enabled) {
        daysResult.push({
          day: dayKey,
          dayLabelPt: wItem.labelPt,
          fullPt: wItem.fullPt,
          enabled: false,
          validSlots: 0,
          occupiedSlots: 0,
          remainingSlots: 0,
          restBlocksCount: 0,
        });
        continue;
      }

      // Rest blocks for this weekday
      const dayRestBlocks = restBlocksData.filter(
        (b) => b.day.toLowerCase() === dayKey.toLowerCase()
      );

      // Get valid working segments (working hours minus rest blocks)
      const segments = getWorkingSegments(
        dayAvail.startTime,
        dayAvail.endTime,
        dayRestBlocks
      );

      // Calculate valid slots for this day
      let dayValidSlots = 0;
      for (const seg of segments) {
        const durationMins = seg.end - seg.start;
        dayValidSlots += Math.max(0, Math.floor(durationMins / slotDuration));
      }

      // Count occupied recurring schedules for this day
      const stdOccupied = studentSchedules.filter(
        (s) => s.weekday?.toLowerCase() === dayKey.toLowerCase()
      ).length;

      const clsOccupied = classSchedules.filter(
        (c) => c.weekday?.toLowerCase() === dayKey.toLowerCase()
      ).length;

      const dayOccupiedSlots = stdOccupied + clsOccupied;
      const dayRemainingSlots = Math.max(0, dayValidSlots - dayOccupiedSlots);

      totalValidSlots += dayValidSlots;
      totalOccupiedSlots += dayOccupiedSlots;

      daysResult.push({
        day: dayKey,
        dayLabelPt: wItem.labelPt,
        fullPt: wItem.fullPt,
        enabled: true,
        workStartTime: dayAvail.startTime,
        workEndTime: dayAvail.endTime,
        validSlots: dayValidSlots,
        occupiedSlots: dayOccupiedSlots,
        remainingSlots: dayRemainingSlots,
        restBlocksCount: dayRestBlocks.length,
      });
    }

    const totalRemainingSlots = Math.max(0, totalValidSlots - totalOccupiedSlots);
    const occupancyPct =
      totalValidSlots > 0
        ? Math.round((totalOccupiedSlots / totalValidSlots) * 100)
        : 0;

    return {
      hasWorkingHours: true,
      totalValidSlots,
      totalOccupiedSlots,
      totalRemainingSlots,
      occupancyPct,
      slotDurationMinutes: slotDuration,
      days: daysResult,
    };
  } catch (err) {
    console.warn("[capacity-engine] Error calculating real capacity:", err);
    return emptyResult;
  }
}
