import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CEFRLevel, StudentType } from "@/lib/calendar-sync";

export type StudentStatus = "Active" | "Inactive" | "Trial" | "Archived";

export interface ScheduleDetails {
  day: string;
  startTime: string;
  duration: number;
  frequency: string;
  startDate: string;
  endDate?: string;
  timezone: string;
  deliveryMode: "Online" | "In person";
  locationLink?: string;
}

export interface StudentSchedule {
  id?: string;
  weekday: string;
  startTime: string;
  endTime?: string;
  duration: number;
  deliveryMode: "Online" | "In person";
  locationLink?: string;
}

export interface StudentQueryItem {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  level: CEFRLevel;
  focus: string;
  type: StudentType;
  status: StudentStatus;
  schedule: string;
  createdAt: string;
  lastActive?: string;
  notes?: string;
  color_key?: string;
  groupSize?: number;
  packageId?: string;
  linkedGroupId?: string;
  schedules?: StudentSchedule[];
  scheduleDetails?: ScheduleDetails;
}

export const STUDENTS_QUERY_KEY = (teacherId: string | undefined) => ["students", teacherId];

export function useStudentsQuery(teacherId: string | undefined, lang: "en" | "pt" = "pt") {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: STUDENTS_QUERY_KEY(teacherId),
    queryFn: async (): Promise<StudentQueryItem[]> => {
      if (!teacherId) return [];

      let response = await supabase
        .from("students")
        .select("*, student_schedules(*), student_packages(*, packages(*))")
        .eq("teacher_id", teacherId)
        .order("full_name", { ascending: true });

      if (response.error) {
        response = await supabase
          .from("students")
          .select("*, student_schedules(*)")
          .eq("teacher_id", teacherId)
          .order("full_name", { ascending: true });
      }

      if (response.error) {
        response = await supabase
          .from("students")
          .select("*")
          .eq("teacher_id", teacherId)
          .order("full_name", { ascending: true });
      }

      if (response.error) throw response.error;

      const data = response.data || [];

      const dayTranslation: Record<string, string> = {
        Monday: lang === "pt" ? "Seg" : "Mon",
        Tuesday: lang === "pt" ? "Ter" : "Tue",
        Wednesday: lang === "pt" ? "Qua" : "Wed",
        Thursday: lang === "pt" ? "Qui" : "Thu",
        Friday: lang === "pt" ? "Sex" : "Fri",
        Saturday: lang === "pt" ? "Sáb" : "Sat",
        Sunday: lang === "pt" ? "Dom" : "Sun",
      };

      return data.map((d: any) => {
        const schedulesList = d.student_schedules || [];
        const scheduleSummary =
          schedulesList.length > 0
            ? schedulesList
                .map(
                  (s: any) =>
                    `${dayTranslation[s.weekday] || s.weekday?.substring(0, 3) || ""}${
                      s.start_time ? ` • ${(s.start_time || "").slice(0, 5)}` : ""
                    }`
                )
                .join(", ")
            : d.schedule || "Custom";

        let scheduleDetailsObj: ScheduleDetails | undefined = undefined;
        if (schedulesList.length > 0) {
          const firstS = schedulesList[0];
          scheduleDetailsObj = {
            day: firstS.weekday,
            startTime: firstS.start_time || "09:00",
            duration: 60,
            frequency: "Weekly",
            startDate: "",
            endDate: undefined,
            timezone: "America/Sao_Paulo",
            deliveryMode: "Online",
            locationLink: undefined,
          };
        }

        const activePkgAssignment = (d.student_packages || []).find((sp: any) => sp.status === "active");
        const activePackageId = activePkgAssignment?.package_id || d.package_id || undefined;

        return {
          id: d.id,
          name: d.full_name,
          whatsapp: d.phone || "",
          email: d.email || "",
          level: (d.level as CEFRLevel) || "A1",
          focus: d.language_studied || "English",
          type: (d.type as StudentType) || "Private",
          status: (d.status as StudentStatus) || "Active",
          schedule: scheduleSummary,
          createdAt: d.created_at,
          lastActive: d.updated_at,
          notes: d.notes || "",
          color_key: d.color_key || "default",
          groupSize: d.group_size || undefined,
          packageId: activePackageId,
          schedules: schedulesList.map((s: any) => ({
            id: s.id,
            weekday: s.weekday,
            startTime: s.start_time || "",
            endTime: s.end_time || "",
            duration: 60,
            deliveryMode: "Online" as const,
            locationLink: "",
          })),
          scheduleDetails: scheduleDetailsObj,
        };
      });
    },
    enabled: Boolean(teacherId),
    staleTime: 5 * 60 * 1000, // 5 minutes stale time
    gcTime: 10 * 60 * 1000,    // 10 minutes cache retention
  });

  return {
    students: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
