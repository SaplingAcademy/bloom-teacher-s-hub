import { reportUserError, toUserMessage } from "@/lib/user-error";
import { t as i18nT } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Filter,
  X,
  Check,
  ExternalLink,
  BookOpen,
  CheckSquare,
  FileText,
  User,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  } from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getCalendarEvents,
  saveCalendarEvents,
  CalendarEvent,
  WorkingAvailability,
  formatDateString,
  calculateEndTime,
  getDayIndex,
  TimelineStatus,
  CEFRLevel,
  CourseFocus,
  StudentType,
  syncStudentSchedulesToSupabaseEvents,
} from "@/lib/calendar-sync";
import {
  getTeacherAvailability,
  invalidateTeacherAvailability,
  isSlotAvailable,
  weekdayKeyFromDate,
  TeacherAvailabilitySnapshot,
} from "@/lib/teacher-availability";
import { saveTeacherWorkingAvailability } from "@/lib/availability-engine";
import {
  fetchTeacherTimeOff,
  checkDateIsNonWorking,
  getCalendarSetupSeenStatus,
  TeacherTimeOff,
} from "@/lib/time-off-engine";
import { FirstTimeCalendarSetupModal } from "@/components/bloom/FirstTimeCalendarSetupModal";
import { NonWorkingDaysModal } from "@/components/bloom/NonWorkingDaysModal";
import { CentralAvailabilityModal } from "@/components/bloom/CentralAvailabilityModal";
import { fetchTeacherWorkingAvailability, WEEKDAYS_MAP } from "@/lib/availability-engine";
import { SchedulingConflictDialog } from "@/components/bloom/SchedulingConflictDialog";
import { resolveEventColorMeta, type BrandColorMeta } from "@/lib/brand-colors";
import { resolveCalendarColor, toStoredColorKey } from "@/lib/calendar-colors";
import { CalendarColorPicker } from "@/components/bloom/CalendarColorPicker";
import { saveAttendanceRecords } from "@/lib/lesson-plans";
import { RescheduleLessonDialog } from "@/components/bloom/RescheduleLessonDialog";
import { useWeekLessonDrag } from "@/hooks/use-week-lesson-drag";
import { useRescheduleConfirmation } from "@/hooks/use-reschedule-confirmation";
import { RescheduleWarningDialog } from "@/components/bloom/RescheduleWarningDialog";
import { useHomeworkStatus } from "@/hooks/use-homework-status";
import { homeworkStatusValue, type HomeworkStatus } from "@/lib/homework-status";
import { CustomCalendarEventDialog } from "@/components/bloom/CustomCalendarEventDialog";
import { CalendarClassAttendanceSection } from "@/components/bloom/CalendarClassAttendanceSection";
import { customEventDefaults, customEventErrorKey, moveCustomEvent } from "@/lib/custom-calendar-events";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarEventsQueryKey, calendarEventsRootKey, calendarEventsWindow } from "@/lib/calendar-events-window";
import { lessonSlotDefaults, type SchedulingContext } from "@/lib/scheduling-context";
import { LessonStudentsSelect, LessonTagsSelect } from "@/components/bloom/LessonSchedulingSelections";
import { lessonDuration, saveManualLessons, manualLessonErrorKey, ManualLessonPlanError, LESSON_QUICK_TAGS, type ManualLessonInput, type SavedManualEvent } from "@/lib/manual-lesson-scheduling";

// Display-only: formats "HH:mm:ss" as "HH:mm" without touching stored values
const fmtTime = (time?: string | null) => (time ? time.slice(0, 5) : "");

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: (search: Record<string, unknown>): {
    availability?: "working_hours";
    eventId?: string;
  } => ({
    ...(search.availability === "working_hours" ? { availability: "working_hours" as const } : {}),
    ...(typeof search.eventId === "string" ? { eventId: search.eventId } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Calendar · Bloom" },
      {
        name: "description",
        content: "Schedule classes, manage availability, and review classroom timeline.",
      },
      { property: "og:title", content: "Calendar · Bloom" },
      { property: "og:description", content: "Schedule classes, manage availability, and review classroom timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

// Translation dictionary
const calendarTranslations = {
  en: {
    langToggle: "PT",
    title: "Teaching Calendar",
    description: "Manage your class schedule, recurring lessons, and classroom timelines.",
    today: "Today",
    viewDay: "Day",
    viewWeek: "Week",
    viewMonth: "Month",
    addClass: "Schedule Class",
    settingsAvailability: "Availability Settings",
    workingHours: "Working Availability",
    filters: "Filters",
    classType: "Class Type",
    classFormat: "Delivery Mode",
    statusFilter: "Timeline Status",
    all: "All",
    private: "Private",
    group: "Group",
    online: "Online",
    inPerson: "In person",
    vacancies: "vacancies",
    occupancy: "Occupancy",
    dayMon: "Mon",
    dayTue: "Tue",
    dayWed: "Wed",
    dayThu: "Thu",
    dayFri: "Fri",
    daySat: "Sat",
    daySun: "Sun",
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    detailsTitle: "Class Details",
    statusPrep: "Needs Preparation",
    statusReady: "Lesson Ready",
    statusPendingHw: "Homework Pending",
    statusSentHw: "Homework Sent",
    statusPendingFb: "Feedback Pending",
    statusCompleted: "Completed",
    statusClosed: "Closed",
    statusScheduled: "Scheduled",
  },
  pt: {
    langToggle: "EN",
    title: "Agenda de Aulas",
    description: "Gerencie sua agenda de aulas, recorrências e histórico de sala de aula.",
    today: "Hoje",
    viewDay: "Dia",
    viewWeek: "Semana",
    viewMonth: "Mês",
    addClass: "Agendar Aula",
    settingsAvailability: "Configurar Disponibilidade",
    workingHours: "Horário de Trabalho",
    filters: "Filtros",
    classType: "Tipo de Aula",
    classFormat: "Formato da Aula",
    statusFilter: "Status do Histórico",
    all: "Todos",
    private: "VIP",
    group: "Grupo",
    online: "Online",
    inPerson: "Presencial",
    vacancies: "vagas",
    occupancy: "Ocupação",
    dayMon: "Seg",
    dayTue: "Ter",
    dayWed: "Qua",
    dayThu: "Qui",
    dayFri: "Sex",
    daySat: "Sáb",
    daySun: "Dom",
    weekdays: [
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
      "Domingo",
    ],
    detailsTitle: "Detalhes da Aula",
    statusPrep: "Necessita Preparação",
    statusReady: "Aula Pronta",
    statusPendingHw: "Tarefa Pendente",
    statusSentHw: "Tarefa Enviada",
    statusPendingFb: "Feedback Pendente",
    statusCompleted: "Concluída",
    statusClosed: "Arquivada",
    statusScheduled: "Agendada",
  },
};

// Timeline Badge Styles helper
const getStatusStyles = (status: TimelineStatus) => {
  switch (status) {
    case "Scheduled":
      return "bg-secondary text-secondary-foreground border-border/80";
    case "Needs Preparation":
      return "bg-warning/15 text-warning-foreground border-warning/30";
    case "Lesson Ready":
      return "bg-success/15 text-success border-success/30";
    case "Completed":
      return "bg-primary-soft text-primary border-primary/20";
    case "Homework Pending":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200/50";
    case "Homework Sent":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200/50";
    case "Feedback Pending":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200/50";
    case "Closed":
      return "bg-muted text-muted-foreground border-border/40 opacity-70";
  }
};

function CalendarPage() {
  const { lang, t, formatStatus, formatWeekday } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { availability: requestedAvailability, eventId: requestedEventId } = Route.useSearch();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [availability, setAvailability] = useState<WorkingAvailability[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [isScheduleChoiceOpen, setIsScheduleChoiceOpen] = useState(false);
  const [schedulingContext, setSchedulingContext] = useState<SchedulingContext | null>(null);
  const [newEventDefaults, setNewEventDefaults] = useState(customEventDefaults(formatDateString(new Date())));
  const homeworkStatus = useHomeworkStatus(user?.id, selectedEvent && selectedEvent.eventType !== "custom" ? [selectedEvent.id] : []);
  const [rescheduleTarget, setRescheduleTarget] = useState<CalendarEvent | null>(null);
  const pendingMoves = useRef(new Set<string>());
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const rescheduleConfirmation = useRescheduleConfirmation();

  // Supabase Data State & Error Resilience
  const [studentsList, setStudentsList] = useState<Array<{ id: string; full_name: string; level?: string; language_studied?: string; type?: string }>>([]);
  const [studentColorMap, setStudentColorMap] = useState<Record<string, string>>({});
  const [classColorMap, setClassColorMap] = useState<Record<string, string>>({});
  const [studentScheduleColorMap, setStudentScheduleColorMap] = useState<Record<string, string>>({});
  const [classScheduleColorMap, setClassScheduleColorMap] = useState<Record<string, string>>({});
  const [savingColor, setSavingColor] = useState(false);
  // Precedence: occurrence → recurring slot → existing parent rule → native fallback (null = custom lilac).
  const eventColor = (evt: CalendarEvent): BrandColorMeta | null => {
    const isCustom = evt.eventType === "custom";
    const scheduleColorKey = evt.classScheduleId ? classScheduleColorMap[evt.classScheduleId] : evt.scheduleId ? studentScheduleColorMap[evt.scheduleId] : undefined;
    const override = resolveCalendarColor({ eventColorKey: evt.colorKey, scheduleColorKey, isCustom });
    if (override || isCustom) return override;
    return resolveEventColorMeta(
      evt.studentId ? studentColorMap[evt.studentId] : undefined,
      evt.groupId ? classColorMap[evt.groupId] : undefined
    );
  };
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Filters State
  const [filterType, setFilterType] = useState<string>("All");
  const [filterFormat, setFilterFormat] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");

  // Availability Modal State
  const [isAvailOpen, setIsAvailOpen] = useState(false);
  const [tempAvail, setTempAvail] = useState<WorkingAvailability[]>([]);

  // Add Class Modal State
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [addDate, setAddDate] = useState(formatDateString(new Date()));
  const [addTime, setAddTime] = useState("09:00");
  const [addEndTime, setAddEndTime] = useState("10:00");
  const [addTags, setAddTags] = useState<string[]>([]);
  const [lessonSaveError, setLessonSaveError] = useState<string | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [pendingLessonPlans, setPendingLessonPlans] = useState<{ input: ManualLessonInput; events: SavedManualEvent[] } | null>(null);
  const [addType, setAddType] = useState<"Private" | "Group">("Private");
  const [addLevel, setAddLevel] = useState<CEFRLevel>("B2");
  const [addFocus, setAddFocus] = useState<CourseFocus>("General English");
  const [addMode, setAddMode] = useState<"Online" | "In person">("Online");
  const [addLink, setAddLink] = useState("");

  // Quick Action Forms State
  const [hwTitle, setHwTitle] = useState("");
  const [attStatus, setAttStatus] = useState<"Present" | "Absent" | "Late" | "Excused">("Present");
  const [lessonUrl, setLessonUrl] = useState("");
  const [notesText, setNotesText] = useState("");

  const [isSyncingAgenda, setIsSyncingAgenda] = useState(false);

  // Central Availability Modal State
  const [isCentralAvailOpen, setIsCentralAvailOpen] = useState(false);
  const [centralAvailTab, setCentralAvailTab] = useState<"working_hours" | "days_off">("working_hours");

  // Non-Working Days & First-Time Setup States
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);
  const [availabilitySnapshot, setAvailabilitySnapshot] = useState<TeacherAvailabilitySnapshot | null>(null);
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);
  const [isFirstTimeSetupOpen, setIsFirstTimeSetupOpen] = useState(false);
  const [isNonWorkingModalOpen, setIsNonWorkingModalOpen] = useState(false);
  const [conflictTimeOff, setConflictTimeOff] = useState<TeacherTimeOff | null>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [pendingClassData, setPendingClassData] = useState<ManualLessonInput | null>(null);

  useEffect(() => {
    if (requestedAvailability !== "working_hours") return;
    setCentralAvailTab("working_hours");
    setIsCentralAvailOpen(true);
  }, [requestedAvailability]);

  // Load time off records and check first-time setup prompt
  const loadTimeOffData = useCallback(async () => {
    if (!user?.id) return;
    const timeOff = await fetchTeacherTimeOff(user.id);
    setTimeOffList(timeOff);

    const hasSeenSetup = await getCalendarSetupSeenStatus(user.id);
    if (!hasSeenSetup) {
      setIsFirstTimeSetupOpen(true);
    }
  }, [user]);

  useEffect(() => {
    loadTimeOffData();
  }, [loadTimeOffData]);

  // Events: cached per teacher + visible date window (prev month start → next month end).
  const eventsWindow = useMemo(() => calendarEventsWindow(currentDate), [currentDate]);
  const eventsQuery = useQuery({
    queryKey: calendarEventsQueryKey(user?.id, eventsWindow.start, eventsWindow.end),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("teacher_id", user!.id)
        .gte("date", eventsWindow.start)
        .lte("date", eventsWindow.end)
        .order("date", { ascending: true });

      if (error) {
        console.error("[Calendar Load Failure]", {
          step: "fetch_calendar_events",
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        throw error;
      }

      return (data || []).map((d: any) => ({
          id: d.id,
          eventType: d.event_type,
          title: d.title || undefined,
          category: d.category || undefined,
          lessonTags: Array.isArray(d.lesson_tags) ? d.lesson_tags : [],
          teacherId: d.teacher_id,
          studentId: d.student_id,
          classId: d.class_id,
          scheduleId: d.schedule_id,
          classScheduleId: d.class_schedule_id || undefined,
          colorKey: d.color_key ?? null,
          studentName: d.event_type === "custom" ? d.title : d.student_name || "Aula",
          level: (d.level as CEFRLevel) || "A1",
          focus: (d.focus as CourseFocus) || "General English",
          date: d.date,
          startTime: d.start_time,
          endTime: d.end_time,
          duration: Number(d.duration) || 60,
          type: (d.type as StudentType) || "Private",
          deliveryMode: (d.delivery_mode as "Online" | "In person") || "Online",
          locationLink: d.location_link || undefined,
          status: (d.status as TimelineStatus) || "Scheduled",
          attendanceRecorded: d.attendance_recorded || false,
          attendanceStatus: d.attendance_status || undefined,
          notes: d.notes || undefined,
          homeworkTitle: d.homework_title || undefined,
          lessonPlanUrl: d.lesson_plan_url || undefined,
          isRecurring: d.is_recurring || false,
          recurrenceSeriesId: d.recurrence_series_id || undefined,
        }));
    },
  });
  const isLoadingEvents = eventsQuery.isLoading;
  const isEventsError = eventsQuery.isError && !eventsQuery.data;

  useEffect(() => {
    if (eventsQuery.data) setEvents(eventsQuery.data);
  }, [eventsQuery.data]);

  useEffect(() => {
    if (eventsQuery.error) toast.error(reportUserError(eventsQuery.error, i18nT("errors.loadAgenda", lang)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsQuery.error]);

  // Calendar mutations refresh only this teacher's calendar-events windows (active one refetches now).
  const fetchEvents = useCallback(async () => {
    if (!user?.id) return;
    await queryClient.invalidateQueries({ queryKey: calendarEventsRootKey(user.id) });
  }, [user, queryClient]);

  useEffect(() => {
    if (!requestedEventId || events.length === 0) return;
    const target = events.find((event) => event.id === requestedEventId);
    if (!target) return;
    setCurrentDate(new Date(`${target.date}T12:00:00`));
    setViewMode("day");
    setSelectedEvent(target);
  }, [events, requestedEventId]);

  // Temporary development action: Manual Sync Agenda button handler
  const handleManualSyncAgenda = async () => {
    if (!user) return;
    setIsSyncingAgenda(true);
    toast.info(t("auditUi.syncingScheduleWithDatabase"));

    try {
      // 1. Fetch all current teacher students
      const { data: studentsData, error: stErr } = await supabase
        .from("students")
        .select("id, full_name, level, language_studied, type")
        .eq("teacher_id", user.id);

      if (stErr) {
        console.error("[Calendar] Failed to load students for manual sync:", stErr);
        toast.error(reportUserError(stErr, i18nT("errors.loadStudents", lang)));
        setIsSyncingAgenda(false);
        return;
      }

      if (!studentsData || studentsData.length === 0) {
        toast.info(t("auditUi.noStudentsFoundForThisTeacher"));
        setIsSyncingAgenda(false);
        return;
      }

      let totalGenerated = 0;
      let totalInserted = 0;
      let totalFailed = 0;
      const errorsList: string[] = [];

      // 2. For each student, load schedules from student_schedules table and sync
      for (const student of studentsData) {
        const { data: schedulesData, error: schErr } = await supabase
          .from("student_schedules")
          .select("id, weekday, start_time, end_time, meeting_url, delivery_mode, duration_minutes")
          .eq("student_id", student.id);

        if (schErr) {
          console.error(`[Calendar] Failed to load schedules for student ${student.full_name}:`, schErr);
          totalFailed++;
          errorsList.push(`${student.full_name}: ${schErr.message}`);
          continue;
        }

        if (!schedulesData || schedulesData.length === 0) {
          console.log(`[Calendar] No student_schedules found for student ${student.full_name}`);
          continue;
        }

        const syncResult = await syncStudentSchedulesToSupabaseEvents(
          student.id,
          user.id,
          student.full_name,
          (student.level as CEFRLevel) || "A1",
          (student.language_studied as CourseFocus) || "General English",
          (student.type as StudentType) || "Private",
          schedulesData,
          8
        );

        if (syncResult && syncResult.success) {
          totalGenerated += syncResult.generatedCount;
          totalInserted += syncResult.insertedCount;
        } else if (syncResult) {
          totalFailed++;
          errorsList.push(`${student.full_name}: ${syncResult.error}`);
        }
      }

      await fetchEvents();

      if (totalFailed === 0) {
        toast.success(
          lang === "pt"
            ? "Agenda sincronizada com sucesso!"
            : "Calendar synced successfully!"
        );
      } else {
        toast.error(
          `Sincronização concluída com avisos. Inseridas: ${totalInserted}. Falhas: ${totalFailed}. ${errorsList.join(" | ")}`
        );
      }
    } catch (err: any) {
      console.error("[Calendar] Manual sync error:", err);
      toast.error(reportUserError(err, i18nT("errors.syncAgenda", lang)));
    } finally {
      setIsSyncingAgenda(false);
    }
  };

  // Fetch teacher's students for the manual class modal selector
  const fetchStudents = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, level, language_studied, type, color_key")
        .eq("teacher_id", user.id)
        .order("full_name", { ascending: true });

      if (error) {
        console.warn("[Calendar] Could not load students for selector:", error.message);
      } else if (data) {
        setStudentsList(data);
        const stdMap: Record<string, string> = {};
        data.forEach((s: any) => {
          if (s.color_key) stdMap[s.id] = s.color_key;
        });
        setStudentColorMap(stdMap);
      }

      // Fetch classes for class color resolution
      const { data: clsData } = await supabase
        .from("classes")
        .select("id, color_key")
        .eq("teacher_id", user.id);

      if (clsData) {
        const clsMap: Record<string, string> = {};
        clsData.forEach((c: any) => {
          if (c.color_key) clsMap[c.id] = c.color_key;
        });
        setClassColorMap(clsMap);
      }

      // Recurring-slot colors (null = inherit; only customized slots enter the maps)
      const studentIds = (data || []).map((s: any) => s.id);
      const [{ data: stSch }, { data: clSch }] = await Promise.all([
        studentIds.length ? supabase.from("student_schedules").select("id, color_key").in("student_id", studentIds).not("color_key", "is", null) : Promise.resolve({ data: [] as any[] }),
        supabase.from("class_schedules").select("id, color_key").eq("teacher_id", user.id).not("color_key", "is", null),
      ]);
      const toMap = (rows: any[] | null) => Object.fromEntries((rows || []).filter((r) => r.color_key).map((r) => [r.id, r.color_key]));
      setStudentScheduleColorMap(toMap(stSch as any[]));
      setClassScheduleColorMap(toMap(clSch as any[]));
    } catch (e) {
      console.warn("[Calendar] Error fetching students for selector:", e);
    }
  }, [user]);

  const loadWorkingAvailability = useCallback(async () => {
    if (!user?.id) return;
    const snapshot = await getTeacherAvailability(user.id, { force: true });
    setAvailabilitySnapshot(snapshot);
    setAvailability(snapshot.days);
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchStudents();
    loadWorkingAvailability();
  }, [fetchStudents, loadWorkingAvailability]);

  const weekDrag = useWeekLessonDrag(async (eventId, position) => {
    const event = events.find((item) => item.id === eventId);
    if (!event || pendingMoves.current.has(eventId)) return;
    if (event.date === position.date && fmtTime(event.startTime) === position.startTime) return;
    pendingMoves.current.add(eventId);
    setMovingIds(new Set(pendingMoves.current));
    try {
      if (event.eventType === "custom") {
        if (!user?.id) return;
        await moveCustomEvent(user.id, eventId, position.date, position.startTime, event.duration);
        await queryClient.invalidateQueries({ queryKey: ["growth-data", user.id] });
        await fetchEvents();
        return;
      }
      const result = await rescheduleConfirmation.request(eventId, position.date, position.startTime);
      if (!result) return;
      if (!result.ok) {
        const known = ["conflict", "outside_working_hours", "non_working_day", "locked"];
        const reason = known.includes(result.reason) ? result.reason : "save_failed";
        toast.error(t(`calendarUi.rescheduleErr_${reason}`));
        return;
      }
      // Read back the canonical saved occurrence; no optimistic move or local storage writes.
      await fetchEvents();
    } catch (error) {
      toast.error(t(event.eventType === "custom" ? `customCalendar.${customEventErrorKey(error)}` : "calendarUi.rescheduleErr_save_failed"));
    } finally {
      pendingMoves.current.delete(eventId);
      setMovingIds(new Set(pendingMoves.current));
    }
  });

  // Re-save calendar events and state
  const updateEventsState = (newEvents: CalendarEvent[]) => {
    setEvents(newEvents);
    saveCalendarEvents(newEvents);
    window.dispatchEvent(new Event("storage"));
  };

  // Navigations
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  // Availability Settings
  const handleOpenAvailModal = () => {
    setTempAvail(JSON.parse(JSON.stringify(availability)));
    setIsAvailOpen(true);
  };

  const handleSaveAvail = async () => {
    if (!user) return;
    const res = await saveTeacherWorkingAvailability(user.id, tempAvail);
    if (!res.success) {
      toast.error(toUserMessage(res.error, i18nT("errors.saveAvailability", lang)));
      return;
    }
    invalidateTeacherAvailability(user.id);
    await loadWorkingAvailability();
    setIsAvailOpen(false);
  };

  // One individual occurrence and linked plan per selected student; no permanent group.
  const executeCreateClass = async (overrideData?: ManualLessonInput) => {
    if (!user?.id || isSavingLesson) return;
    const input = pendingLessonPlans?.input || overrideData || {
      students: studentsList.filter(student => selectedStudentIds.includes(student.id)),
      date: addDate, startTime: addTime, endTime: addEndTime,
      type: addType, level: addLevel, focus: addFocus, mode: addMode, link: addLink, tags: addTags,
    };
    setIsSavingLesson(true);
    setLessonSaveError(null);
    try {
      await saveManualLessons(user.id, input, pendingLessonPlans?.events);
      setPendingLessonPlans(null);
      setIsAddClassOpen(false);
      setSelectedStudentIds([]);
      setAddTags([]);
      setAddDate(formatDateString(new Date()));
      setAddTime("09:00");
      setAddEndTime("10:00");
      await fetchEvents();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["growth", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["students", user.id] }),
      ]);
      toast.success(t("auditUi.classScheduledSuccessfully"));
    } catch (error) {
      if (error instanceof ManualLessonPlanError) {
        setPendingLessonPlans({ input, events: error.events });
        await fetchEvents();
      }
      setLessonSaveError(t(`manualLesson.${manualLessonErrorKey(error)}`));
    } finally {
      setIsSavingLesson(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || isSavingLesson) return;
    if (pendingLessonPlans) { await executeCreateClass(); return; }
    setLessonSaveError(null);
    if (selectedStudentIds.length === 0) {
      setLessonSaveError(t("manualLesson.requiredStudents"));
      return;
    }
    try { lessonDuration(addTime, addEndTime); } catch {
      setLessonSaveError(t("manualLesson.invalidInterval"));
      return;
    }
    // Preserve the existing availability warning and time-off confirmation.
    if (availabilitySnapshot) {
      const check = isSlotAvailable(availabilitySnapshot, addDate, addTime, addEndTime);
      if (!check.available && check.reason?.kind !== "time_off") {
        toast.warning(check.reason?.message || t("manualLesson.outsideAvailability"));
      }
    }
    const matchedTimeOff = checkDateIsNonWorking(addDate, timeOffList);
    if (matchedTimeOff) {
      setConflictTimeOff(matchedTimeOff);
      setPendingClassData({
        students: studentsList.filter(student => selectedStudentIds.includes(student.id)),
        date: addDate, startTime: addTime, endTime: addEndTime,
        type: addType, level: addLevel, focus: addFocus, mode: addMode, link: addLink, tags: addTags,
      });
      setIsConflictDialogOpen(true);
      return;
    }
    await executeCreateClass();
  };

  // Filter logic
  const filteredEvents = events.filter((evt) => {
    if (evt.eventType === "custom") return filterType === "All" && filterFormat === "All" && (filterStatus === "All" || evt.status === filterStatus);
    const matchType = filterType === "All" || evt.type === filterType;
    const matchFormat = filterFormat === "All" || evt.deliveryMode === filterFormat;
    const matchStatus = filterStatus === "All" || evt.status === filterStatus;
    return matchType && matchFormat && matchStatus;
  });

  // Capacity calculations for side information panel
  const totalSlots = availability.reduce((sum, item) => {
    if (!item.enabled) return sum;
    const [sh, sm] = item.startTime.split(":").map(Number);
    const [eh, em] = item.endTime.split(":").map(Number);
    return sum + Math.max(0, Math.floor(eh - sh + (em - sm) / 60));
  }, 0);

  const getWeekRange = () => {
    const dayOfWeek = currentDate.getDay();
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mStr = monday.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
      month: "short",
      day: "numeric",
    });
    const sStr = sunday.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${mStr} – ${sStr}`;
  };

  const getDayRange = () => {
    return currentDate.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getMonthRange = () => {
    return currentDate.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
      month: "long",
      year: "numeric",
    });
  };

  // Get weekday name
  const getWeekdayName = (offsetIndex: number) => {
    const dayOfWeek = currentDate.getDay();
    const temp = new Date(currentDate);
    temp.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offsetIndex);
    return temp.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { weekday: "short" });
  };

  const getWeekdayDateStr = (offsetIndex: number) => {
    const dayOfWeek = currentDate.getDay();
    const temp = new Date(currentDate);
    temp.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offsetIndex);
    return formatDateString(temp);
  };

  const getWeekdayDayNumber = (offsetIndex: number) => {
    const dayOfWeek = currentDate.getDay();
    const temp = new Date(currentDate);
    temp.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offsetIndex);
    return temp.getDate();
  };

  // Classroom Timeline state transitions
  const updateEventStatus = (eventId: string, newStatus: TimelineStatus) => {
    const isSeriesChange = window.confirm(
      t("auditUi.doYouWantToApplyThisStatus"),
    );

    const targetEvent = events.find((e) => e.id === eventId);
    if (!targetEvent) return;

    let updatedEventsList;
    if (isSeriesChange && targetEvent.recurrenceSeriesId) {
      updatedEventsList = events.map((evt) => {
        if (evt.recurrenceSeriesId === targetEvent.recurrenceSeriesId) {
          // If completing, update student package balance
          if (newStatus === "Completed" && evt.status !== "Completed") {
            decrementStudentBalance(evt.studentId || evt.groupId || "");
          }
          return { ...evt, status: newStatus };
        }
        return evt;
      });
    } else {
      updatedEventsList = events.map((evt) => {
        if (evt.id === eventId) {
          // If completing, update student package balance
          if (newStatus === "Completed" && evt.status !== "Completed") {
            decrementStudentBalance(evt.studentId || evt.groupId || "");
          }
          return { ...evt, status: newStatus };
        }
        return evt;
      });
    }

    updateEventsState(updatedEventsList);
    // Auto-update selected view panel
    const updatedSelected = updatedEventsList.find((e) => e.id === eventId);
    if (updatedSelected) {
      setSelectedEvent(updatedSelected);
    }
  };

  // Helper: Decrement student package credits by 1 when a class is marked completed
  const decrementStudentBalance = (studentId: string) => {
    if (!studentId) return;
    const stored = localStorage.getItem("bloom.students.list");
    if (stored) {
      try {
        const studentsList = JSON.parse(stored);
        const updated = studentsList.map((s: any) => {
          if (s.id === studentId) {
            const currentRem = s.lessonsRemaining ?? 4;
            const currentDel = s.lessonsDelivered ?? 0;
            return {
              ...s,
              lessonsRemaining: Math.max(0, currentRem - 1),
              lessonsDelivered: currentDel + 1,
            };
          }
          return s;
        });
        localStorage.setItem("bloom.students.list", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Reschedule single or series
  const handleReschedule = (eventId: string, newDateStr: string, newTimeStr: string) => {
    const isSeriesChange = window.confirm(
      t("auditUi.rescheduleTheEntireRecurringSeries"),
    );

    const targetEvent = events.find((e) => e.id === eventId);
    if (!targetEvent) return;

    let updatedEventsList;
    if (isSeriesChange && targetEvent.recurrenceSeriesId) {
      updatedEventsList = events.map((evt) => {
        if (evt.recurrenceSeriesId === targetEvent.recurrenceSeriesId) {
          return {
            ...evt,
            startTime: newTimeStr,
            endTime: calculateEndTime(newTimeStr, evt.duration),
          };
        }
        return evt;
      });
    } else {
      updatedEventsList = events.map((evt) => {
        if (evt.id === eventId) {
          return {
            ...evt,
            date: newDateStr,
            startTime: newTimeStr,
            endTime: calculateEndTime(newTimeStr, evt.duration),
          };
        }
        return evt;
      });
    }

    updateEventsState(updatedEventsList);
    const updatedSelected = updatedEventsList.find((e) => e.id === eventId);
    if (updatedSelected) {
      setSelectedEvent(updatedSelected);
    }
    alert(t("auditUi.rescheduledSuccessfully"));
  };

  // Cancel class or series
  const handleCancelClass = (eventId: string) => {
    const isSeriesChange = window.confirm(
      t("auditUi.cancelTheEntireRecurringSeriesOfClasses"),
    );

    const targetEvent = events.find((e) => e.id === eventId);
    if (!targetEvent) return;

    let updatedEventsList;
    if (isSeriesChange && targetEvent.recurrenceSeriesId) {
      updatedEventsList = events.filter(
        (evt) => evt.recurrenceSeriesId !== targetEvent.recurrenceSeriesId,
      );
    } else {
      updatedEventsList = events.filter((evt) => evt.id !== eventId);
    }

    updateEventsState(updatedEventsList);
    setSelectedEvent(null);
    alert(t("auditUi.classCancelledSuccessfully"));
  };

  const handleUpdateNotes = () => {
    if (!selectedEvent) return;
    const updated = events.map((evt) => {
      if (evt.id === selectedEvent.id) {
        return { ...evt, notes: notesText };
      }
      return evt;
    });
    updateEventsState(updated);
    setSelectedEvent({ ...selectedEvent, notes: notesText });
    alert(t("auditUi.notesSaved"));
  };

  // Occurrence-only override: writes calendar_events.color_key for this id; never touches the recurrence.
  const saveOccurrenceColor = async (key: string | null) => {
    if (!selectedEvent || !user?.id || savingColor) return;
    const colorKey = toStoredColorKey(key);
    setSavingColor(true);
    const { error } = await supabase.from("calendar_events").update({ color_key: colorKey })
      .eq("teacher_id", user.id).eq("id", selectedEvent.id).select("id").single();
    setSavingColor(false);
    if (error) { toast.error(reportUserError(error, t("calendarUi.colorSaveError"))); return; }
    setEvents((prev) => prev.map((evt) => evt.id === selectedEvent.id ? { ...evt, colorKey } : evt));
    void fetchEvents();
    setSelectedEvent({ ...selectedEvent, colorKey });
  };

  const handleSaveHomework = () => {
    if (!selectedEvent) return;
    const updated = events.map((evt) => {
      if (evt.id === selectedEvent.id) {
        return { ...evt, homeworkTitle: hwTitle, status: "Homework Sent" as const };
      }
      return evt;
    });
    updateEventsState(updated);
    setSelectedEvent({ ...selectedEvent, homeworkTitle: hwTitle, status: "Homework Sent" });
    setHwTitle("");
    alert(
      t("auditUi.homeworkSentAndStatusUpdated"),
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedEvent || !user || !selectedEvent.studentId) return;
    const statusMap = {
      Present: "present",
      Absent: "absent",
      Late: "late",
      Excused: "excused",
    } as const;
    try {
      await saveAttendanceRecords(user.id, selectedEvent.id, [{
        student_id: selectedEvent.studentId,
        status: statusMap[attStatus],
      }]);
    const updated = events.map((evt) => {
      if (evt.id === selectedEvent.id) {
        return { ...evt, attendanceRecorded: true, attendanceStatus: attStatus };
      }
      return evt;
    });
    updateEventsState(updated);
    setSelectedEvent({ ...selectedEvent, attendanceRecorded: true, attendanceStatus: attStatus });
      toast.success(t("auditUi.attendanceRecorded"));
    } catch {
      toast.error(t("auditUi.failedToRecordAttendance"));
    }
  };

  const handleSaveLessonPlan = () => {
    if (!selectedEvent) return;
    const updated = events.map((evt) => {
      if (evt.id === selectedEvent.id) {
        return { ...evt, lessonPlanUrl: lessonUrl, status: "Lesson Ready" as const };
      }
      return evt;
    });
    updateEventsState(updated);
    setSelectedEvent({ ...selectedEvent, lessonPlanUrl: lessonUrl, status: "Lesson Ready" });
    setLessonUrl("");
    alert(t("auditUi.lessonPlanLinked"));
  };

  const currentTranslation = calendarTranslations[lang];

  // Hours for grid display in week/day view (08:00 to 21:00)
  // Grid shading source: teacher availability snapshot (single source of truth)
  const isHourAvailable = useCallback(
    (dateStr: string, hour: string) => {
      if (!availabilitySnapshot || !availabilitySnapshot.isConfigured) return true;
      const endHour = String(Number(hour.slice(0, 2)) + 1).padStart(2, "0") + ":00";
      return isSlotAvailable(availabilitySnapshot, dateStr, hour, endHour).available;
    },
    [availabilitySnapshot]
  );

  const gridHours = Array.from(new Set([
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    ...events.filter((event) => event.eventType === "custom").map((event) => `${event.startTime.slice(0, 2)}:00`),
  ])).sort();

  const openNewEvent = (date: string, startTime = "") => {
    setNewEventDefaults(customEventDefaults(date, startTime, availabilitySnapshot?.defaultDuration));
    setSelectedEvent(null);
    setIsNewEventOpen(true);
  };
  const createFromCell = (event: React.MouseEvent<HTMLElement>, date: string, time = "") => {
    if (event.target instanceof Element && event.target.closest("[data-calendar-event]")) return;
    setSchedulingContext({ date, startTime: time || undefined });
    setIsScheduleChoiceOpen(true);
  };

  const chooseLesson = () => {
    if (!pendingLessonPlans) {
      let duration = 60;
      try { duration = lessonDuration(addTime, addEndTime); } catch { /* Retain the form's normal initial duration. */ }
      const defaults = lessonSlotDefaults(schedulingContext, formatDateString(new Date()), duration);
      setAddDate(defaults.date);
      setAddTime(defaults.startTime);
      setAddEndTime(defaults.endTime);
    }
    setIsScheduleChoiceOpen(false);
    setIsAddClassOpen(true);
  };

  const chooseEvent = () => {
    setIsScheduleChoiceOpen(false);
    openNewEvent(schedulingContext?.date || formatDateString(currentDate), schedulingContext?.startTime || "");
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <PageHeader
        title={currentTranslation.title}
        description={currentTranslation.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { setSchedulingContext(null); setIsScheduleChoiceOpen(true); }}><Plus className="h-4 w-4" />{t("calendarUi.scheduleAction")}</Button>
            <button
              onClick={handleManualSyncAgenda}
              disabled={isSyncingAgenda}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition-all hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
              title={t("calendarUi.syncTitle")}
            >
              <RotateCcw className={`h-4 w-4 ${isSyncingAgenda ? "animate-spin" : ""}`} />
              <span>{isSyncingAgenda ? t("calendarUi.syncing") : t("calendarUi.sync")}</span>
            </button>
            <button
              onClick={() => {
                setCentralAvailTab("working_hours");
                setIsCentralAvailOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>{currentTranslation.settingsAvailability}</span>
            </button>
          </div>
        }
      />

      {/* ERROR RESILIENCE BANNER */}
      {isEventsError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-center justify-between text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">
              {t("auditUi.failedToLoadScheduleFromSupabase")}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents()}
            className="h-8 border-destructive/30 text-destructive hover:bg-destructive/20"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {t("auditUi.retry")}
          </Button>
        </div>
      )}

      {/* CALENDAR CONTROLS BANNER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="h-9 rounded-lg border border-border bg-card px-3.5 text-xs font-bold text-foreground transition-all hover:bg-secondary cursor-pointer"
          >
            {currentTranslation.today}
          </button>
          <div className="flex items-center rounded-lg border border-border">
            <button
              onClick={handlePrev}
              className="p-2 hover:bg-secondary cursor-pointer border-r border-border rounded-l-lg"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNext}
              className="p-2 hover:bg-secondary cursor-pointer rounded-r-lg"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="font-display font-bold text-foreground text-sm ml-2">
            {viewMode === "day" && getDayRange()}
            {viewMode === "week" && getWeekRange()}
            {viewMode === "month" && getMonthRange()}
          </span>
        </div>

        {/* View toggles */}
        <div className="flex rounded-lg border border-border bg-secondary/30 p-1 self-start sm:self-auto">
          {(["day", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                viewMode === mode
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "day" && currentTranslation.viewDay}
              {mode === "week" && currentTranslation.viewWeek}
              {mode === "month" && currentTranslation.viewMonth}
            </button>
          ))}
        </div>
      </div>

      {/* AVAILABILITY SUMMARY / UNCONFIGURED STATE BANNER */}
      {(() => {
        const enabledDays = availability.filter((a) => a.enabled);
        if (enabledDays.length === 0) {
          return (
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-300">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                    {t("calendarUi.availabilityNotConfigured")}
                  </p>
                  <p className="text-stone-600 dark:text-stone-400 text-xs">
                    {t("calendarUi.availabilityNotConfiguredDescription")}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setCentralAvailTab("working_hours");
                  setIsCentralAvailOpen(true);
                }}
                className="h-9 text-xs font-bold bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90 shrink-0 gap-1.5 cursor-pointer shadow-xs"
              >
                <Settings className="w-4 h-4 text-emerald-400" />
                {t("calendarUi.configureAvailability")}
              </Button>
            </div>
          );
        }

        return (
          <div className="p-3 rounded-2xl border border-border bg-card flex flex-wrap items-center justify-between gap-2 text-xs shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-muted-foreground text-[11px] uppercase tracking-wider">
                {t("calendarUi.availability")}:
              </span>
              {enabledDays.map((a) => {
                const label = formatWeekday(a.day, true);
                return (
                  <Badge key={a.day} variant="secondary" className="text-[11px] font-bold gap-1 bg-muted px-2 py-0.5">
                    <span>{label}</span>
                    <span className="text-muted-foreground font-semibold">{fmtTime(a.startTime)}–{fmtTime(a.endTime)}</span>
                  </Badge>
                );
              })}
            </div>
            <button
              onClick={() => {
                setCentralAvailTab("working_hours");
                setIsCentralAvailOpen(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t("globalUi.edit")}</span>
            </button>
          </div>
        );
      })()}

      {/* MAIN CONTAINER: SIDEBAR + GRID */}
      <div className="grid gap-4 lg:grid-cols-[190px_1fr]">
        {/* LEFT COLUMN: FILTERS & INFOS */}
        <div className="space-y-4">
          {/* Filters card */}
          <div className="rounded-2xl border border-border bg-card px-3.5 py-4 shadow-sm space-y-3.5">
            <div className="flex items-center gap-1.5 border-b border-border/60 pb-2">
              <Filter className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {currentTranslation.filters}
              </h4>
            </div>

            {/* Filter by Type */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {currentTranslation.classType}
              </Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{currentTranslation.all}</SelectItem>
                  <SelectItem value="Private">{currentTranslation.private}</SelectItem>
                  <SelectItem value="Group">{currentTranslation.group}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Format */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {currentTranslation.classFormat}
              </Label>
              <Select value={filterFormat} onValueChange={setFilterFormat}>
                <SelectTrigger className="h-9 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{currentTranslation.all}</SelectItem>
                  <SelectItem value="Online">{currentTranslation.online}</SelectItem>
                  <SelectItem value="In person">{currentTranslation.inPerson}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Status */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {currentTranslation.statusFilter}
              </Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{currentTranslation.all}</SelectItem>
                  <SelectItem value="Scheduled">{currentTranslation.statusScheduled}</SelectItem>
                  <SelectItem value="Needs Preparation">{currentTranslation.statusPrep}</SelectItem>
                  <SelectItem value="Lesson Ready">{currentTranslation.statusReady}</SelectItem>
                  <SelectItem value="Completed">{currentTranslation.statusCompleted}</SelectItem>
                  <SelectItem value="Homework Pending">
                    {currentTranslation.statusPendingHw}
                  </SelectItem>
                  <SelectItem value="Homework Sent">{currentTranslation.statusSentHw}</SelectItem>
                  <SelectItem value="Feedback Pending">
                    {currentTranslation.statusPendingFb}
                  </SelectItem>
                  <SelectItem value="Closed">{currentTranslation.statusClosed}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick working hours summary */}
          <div className="rounded-2xl border border-border bg-card px-3.5 py-4 shadow-sm space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {currentTranslation.workingHours}
            </h4>
            <ul className="space-y-2 text-xs font-medium text-muted-foreground">
              {availability.map((av) => (
                <li key={av.day} className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-foreground/80">{av.day.substring(0, 3)}</span>
                  <span>{av.enabled ? `${fmtTime(av.startTime)} – ${fmtTime(av.endTime)}` : "Closed"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT COLUMN: CALENDAR RENDER CONTAINER */}
        <div className="min-w-0 rounded-2xl border border-border bg-card shadow-[var(--shadow-md)] overflow-hidden">
          {/* WEEK VIEW (DEFAULT) */}
          {viewMode === "week" && (
            <div className="overflow-x-auto min-w-[700px]">
              {/* Day column headers */}
              <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border text-center bg-secondary/15">
                <div className="p-3 text-[10px] uppercase font-bold text-muted-foreground border-r border-border">
                  Time
                </div>
                {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
                  const dayName = currentTranslation.weekdays[idx];
                  const dayShort = getWeekdayName(idx);
                  const num = getWeekdayDayNumber(idx);
                  const isToday = formatDateString(new Date()) === getWeekdayDateStr(idx);

                  return (
                    <div
                      key={idx}
                      className={`p-3 border-r border-border/80 ${
                        isToday ? "bg-primary-soft/10 text-primary" : ""
                      }`}
                    >
                      <span className="block text-[11px] font-bold uppercase opacity-60">
                        {dayShort}
                      </span>
                      <span
                        className={`inline-block mt-0.5 text-lg font-extrabold rounded-full ${isToday ? "bg-primary text-primary-foreground h-7 w-7 flex items-center justify-center mx-auto" : ""}`}
                      >
                        {num}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Time rows */}
              <div className="divide-y divide-border/60">
                {gridHours.map((hour) => (
                  <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] min-h-[64px]">
                    {/* Hour cell */}
                    <div className="p-2 border-r border-border text-right text-[11px] font-semibold text-muted-foreground bg-secondary/5 shrink-0 flex justify-end items-start pt-1">
                      {hour}
                    </div>

                    {/* Weekdays cells */}
                    {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                      const dateStr = getWeekdayDateStr(dayIdx);
                      // Find events for this date that start within this hour slot
                      const cellEvents = filteredEvents.filter(
                        (evt) =>
                          evt.date === dateStr && evt.startTime.startsWith(hour.substring(0, 3)),
                      );

                      const unavailable = !isHourAvailable(dateStr, hour);

                      return (
                        <div
                          key={dayIdx}
                          data-calendar-drop-cell=""
                          data-date={dateStr}
                          data-hour={hour}
                          onClick={(event) => createFromCell(event, dateStr, hour)}
                          title={unavailable ? (t("auditUi.outsideAvailability")) : undefined}
                          className={`p-1 border-r border-border/60 relative transition-colors flex flex-col gap-1 min-h-[64px] min-w-0 overflow-hidden ${
                            unavailable
                              ? "bg-muted/60 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,hsl(var(--border)/0.35)_6px,hsl(var(--border)/0.35)_7px)]"
                              : "bg-card hover:bg-secondary/10"
                          } ${weekDrag.target?.date === dateStr && weekDrag.target.hour === hour ? "ring-2 ring-inset ring-primary bg-primary-soft/30" : ""}`}
                        >
                          {weekDrag.target?.date === dateStr && weekDrag.target.hour === hour && (
                            <span className="pointer-events-none absolute bottom-0 right-0 z-10 max-w-full truncate rounded bg-primary px-1 py-0.5 text-[10px] font-semibold text-primary-foreground">
                              {dateStr} · {weekDrag.target.startTime}
                            </span>
                          )}
                          {cellEvents.map((evt) => {
                            const canDrag = !["Completed", "Closed", "Cancelled"].includes(evt.status) && !movingIds.has(evt.id);
                            const colorMeta = eventColor(evt);
                            return (
                              <div
                                key={evt.id}
                                data-calendar-event=""
                                aria-busy={movingIds.has(evt.id)}
                                onPointerDown={(event) => {
                                  if (canDrag && !pendingMoves.current.has(evt.id)) weekDrag.start(event, evt.id);
                                }}
                                onClick={() => {
                                  if (weekDrag.consumeClick(evt.id) || pendingMoves.current.has(evt.id)) return;
                                  setSelectedEvent(evt);
                                  setNotesText(evt.notes || "");
                                }}
                                className={`min-w-0 w-full max-w-full overflow-hidden rounded-xl border p-2 text-left transition-all hover:shadow-sm space-y-1 ${evt.eventType === "custom" ? `${colorMeta ? colorMeta.calendarEventClass : "bg-lilac-soft text-foreground border-lilac/40"} border-dashed` : colorMeta?.calendarEventClass} ${canDrag ? "touch-none select-none cursor-grab" : "cursor-pointer"} ${weekDrag.draggedId === evt.id ? "opacity-40 cursor-grabbing ring-2 ring-primary" : ""} ${movingIds.has(evt.id) ? "opacity-60 cursor-wait" : ""}`}
                              >
                              <div className="min-w-0 font-display text-xs font-bold leading-tight truncate text-foreground">
                                {evt.studentName}
                              </div>
                              <div className="min-w-0 text-[10px] font-semibold flex items-center justify-between gap-1 opacity-80">
                                <span className="min-w-0 truncate">
                                  {fmtTime(evt.startTime)}–{fmtTime(evt.endTime)}
                                </span>
                                {evt.eventType !== "custom" && <span className="shrink-0 max-w-[45%] truncate text-right">{evt.level}</span>}
                              </div>
                              <div className="min-w-0 text-[9px] font-medium opacity-70 truncate">
                                {evt.eventType === "custom" ? evt.category : evt.focus}
                              </div>
                              {/* Small status indicator pill */}
                              {evt.eventType !== "custom" && <div className="min-w-0 max-w-full truncate text-[8px] font-bold uppercase tracking-wider mt-1 inline-block border border-current px-1.5 py-0.5 rounded-md">
                                {evt.status === "Needs Preparation" &&
                                  (t("auditUi.prepNeeded"))}
                                {evt.status === "Lesson Ready" &&
                                  (t("auditUi.ready"))}
                                {evt.status === "Homework Pending" &&
                                  (t("auditUi.hwPending"))}
                                {evt.status === "Homework Sent" &&
                                  (t("auditUi.hwSent"))}
                                {evt.status === "Feedback Pending" &&
                                  (t("auditUi.fbPending"))}
                                {evt.status === "Completed" &&
                                  (t("auditUi.completed"))}
                                {evt.status === "Closed" &&
                                  (t("auditUi.closed"))}
                              </div>}
                            </div>
                          );
                        })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DAY VIEW */}
          {viewMode === "day" && (
            <div className="divide-y divide-border">
              {gridHours.map((hour) => {
                const dateStr = formatDateString(currentDate);
                const cellEvents = filteredEvents.filter(
                  (evt) => evt.date === dateStr && evt.startTime.startsWith(hour.substring(0, 3)),
                );

                const unavailable = !isHourAvailable(dateStr, hour);

                return (
                  <div
                    key={hour}
                    data-calendar-drop-cell=""
                    data-date={dateStr}
                    data-hour={hour}
                    onClick={(event) => createFromCell(event, dateStr, hour)}
                    className={`grid grid-cols-[100px_1fr] p-2 min-h-[64px] items-center ${unavailable ? "bg-muted/50" : ""}`}
                  >
                    <div className="text-right pr-4 text-xs font-bold text-muted-foreground">
                      {hour}
                    </div>
                    <div className="flex flex-col gap-2">
                      {cellEvents.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground/40 italic ml-2">
                          {unavailable
                            ? t("auditUi.unavailable")
                            : t("auditUi.free")}
                        </span>
                      ) : (
                        cellEvents.map((evt) => {
                          const colorMeta = eventColor(evt);
                          return (
                            <div
                              key={evt.id}
                              data-calendar-event=""
                              onPointerDown={(event) => { if (evt.eventType === "custom" && !movingIds.has(evt.id)) weekDrag.start(event, evt.id); }}
                              onClick={() => {
                                if (evt.eventType === "custom" && (weekDrag.consumeClick(evt.id) || pendingMoves.current.has(evt.id))) return;
                                setSelectedEvent(evt);
                                setNotesText(evt.notes || "");
                              }}
                              className={`rounded-2xl border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between cursor-pointer max-w-2xl transition-all hover:scale-[1.01] ${evt.eventType === "custom" ? `${colorMeta ? `${colorMeta.cardTintClass} border-l-4 ${colorMeta.borderClass}` : "bg-lilac-soft border-lilac/40"} border-dashed touch-none select-none cursor-grab` : colorMeta?.cardTintClass} ${
                                evt.eventType === "custom" ? "" : colorMeta && colorMeta.key !== "default" ? `border-l-4 ${colorMeta.borderClass}` : "border-border bg-card"
                              }`}
                            >
                              <div className="space-y-1">
                                <h4 className="font-display font-bold text-foreground text-sm">
                                  {evt.studentName}
                                </h4>
                                <p className="text-xs font-semibold opacity-85">
                                  {fmtTime(evt.startTime)} – {fmtTime(evt.endTime)} ({evt.duration}m) · {evt.eventType === "custom" ? evt.category : `${evt.level} · ${evt.focus}`}
                                </p>
                                {evt.locationLink && (
                                  <p className="text-[11px] opacity-75 flex items-center gap-1">
                                    {evt.eventType === "custom" ? <MapPin className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                                    <a
                                      href={evt.eventType === "custom" && !/^https?:\/\//i.test(evt.locationLink) ? undefined : evt.locationLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline flex items-center gap-0.5"
                                    >
                                      {evt.locationLink} <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </p>
                                )}
                              </div>
                              <div className="mt-2 sm:mt-0 flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-bold border-current py-0.5"
                                >
                                  {evt.eventType === "custom" ? evt.category : formatStatus(evt.status)}
                                </Badge>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MONTH VIEW */}
          {viewMode === "month" && (
            <div className="p-4 py-6">
              {/* Day labels */}
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-muted-foreground uppercase mb-2">
                {(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const).map((day) => (
                  <div key={day}>{formatWeekday(day, true)}</div>
                ))}
              </div>

              {/* Month dates grid (35 dynamic cells for current month) */}
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const mYear = currentDate.getFullYear();
                  const mMonth = currentDate.getMonth();
                  const firstOfMonth = new Date(mYear, mMonth, 1);
                  const fDayOfWeek = firstOfMonth.getDay();
                  const offsetToMon = fDayOfWeek === 0 ? 6 : fDayOfWeek - 1;
                  const gridStartDate = new Date(mYear, mMonth, 1 - offsetToMon);

                  return Array.from({ length: 35 }).map((_, idx) => {
                    const cellDate = new Date(gridStartDate);
                    cellDate.setDate(gridStartDate.getDate() + idx);
                    const dateStr = formatDateString(cellDate);
                    const isCurrentMonth = cellDate.getMonth() === mMonth;
                    const cellEvents = filteredEvents.filter((e) => e.date === dateStr);

                    return (
                      <div
                        key={idx}
                        onClick={(event) => createFromCell(event, dateStr)}
                        className={`border border-border/80 rounded-xl min-h-[85px] p-1.5 space-y-1 transition-colors flex flex-col justify-between min-w-0 overflow-hidden ${
                          isCurrentMonth ? "bg-secondary/5 hover:bg-secondary/10" : "bg-muted/10 opacity-50"
                        }`}
                      >
                        <span className="text-xs font-bold text-foreground/60">
                          {cellDate.getDate()}
                        </span>
                        <div className="min-w-0 space-y-0.5 flex-1 flex flex-col justify-end">
                          {cellEvents.slice(0, 3).map((e) => {
                            const colorMeta = eventColor(e);
                            return (
                              <div
                                key={e.id}
                                data-calendar-event=""
                                onClick={() => {
                                  setSelectedEvent(e);
                                  setNotesText(e.notes || "");
                                }}
                                className={`text-[9px] font-bold truncate rounded px-1 py-0.5 cursor-pointer border ${e.eventType === "custom" ? `${colorMeta ? colorMeta.calendarEventClass : "bg-lilac-soft text-foreground border-lilac/40"} border-dashed` : colorMeta?.calendarEventClass}`}
                              >
                                {fmtTime(e.startTime)} {e.studentName}
                              </div>
                            );
                          })}
                          {cellEvents.length > 3 && (
                            <div className="text-[8px] text-muted-foreground font-semibold text-center mt-0.5">
                              + {cellEvents.length - 3} {t("calendarUi.more")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isScheduleChoiceOpen} onOpenChange={setIsScheduleChoiceOpen}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t("calendarUi.scheduleChoiceTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal px-4 py-4 text-left"
              onClick={chooseLesson}
            >
              <BookOpen className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block font-semibold">{t("calendarUi.scheduleLessonOption")}</span>
                <span className="mt-1 block text-sm font-normal text-muted-foreground">{t("calendarUi.scheduleLessonDescription")}</span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal px-4 py-4 text-left"
              onClick={chooseEvent}
            >
              <CalendarIcon className="h-5 w-5 shrink-0 text-lilac" />
              <span className="min-w-0">
                <span className="block font-semibold">{t("calendarUi.scheduleEventOption")}</span>
                <span className="mt-1 block text-sm font-normal text-muted-foreground">{t("calendarUi.scheduleEventDescription")}</span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RescheduleLessonDialog
        lesson={rescheduleTarget}
        open={rescheduleTarget !== null}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        onRescheduled={() => fetchEvents()}
        onRequestReschedule={rescheduleConfirmation.request}
      />
      <RescheduleWarningDialog warnings={rescheduleConfirmation.warnings} onAnswer={rescheduleConfirmation.respond} />

      {/* SIDE DETAILS MODAL PANEL */}
      {(isNewEventOpen || selectedEvent?.eventType === "custom") && <CustomCalendarEventDialog
        key={selectedEvent?.eventType === "custom" ? selectedEvent.id : "new-custom-event"}
        event={selectedEvent?.eventType === "custom" ? selectedEvent : null}
        date={newEventDefaults.date}
        startTime={newEventDefaults.startTime}
        endTime={newEventDefaults.endTime}
        onClose={() => { setIsNewEventOpen(false); setSelectedEvent(null); }}
        onSaved={async (date) => {
          setCurrentDate(new Date(`${date}T12:00:00`));
          if (user?.id) await queryClient.invalidateQueries({ queryKey: ["growth-data", user.id] });
          await fetchEvents();
        }}
      />}
      <Dialog
        open={selectedEvent !== null && selectedEvent.eventType !== "custom"}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      >
        {selectedEvent && selectedEvent.eventType !== "custom" && (
          <DialogContent closeLabel={t("calendarUi.closePanel")} className="max-w-xl rounded-2xl p-6 overflow-y-auto max-h-[85vh]">
            <DialogHeader className="border-b border-border/60 pb-3">
              <DialogTitle className="font-display text-lg font-bold text-foreground flex items-center justify-between">
                <span>{t("calendarUi.detailsTitle")}</span>
                <Badge
                  variant="outline"
                  className={`text-xs py-0.5 border-current ${getStatusStyles(selectedEvent.status)}`}
                >
                  {t(`calendarUi.timelineStatus.${selectedEvent.status}`)}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-3 text-sm">
              {/* Grid data */}
              <div className="grid grid-cols-2 gap-4 border-b border-border/60 pb-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    {t("calendarUi.studentOrGroup")}
                  </span>
                  <span className="font-bold text-foreground text-base flex items-center gap-1">
                    <User className="h-4 w-4 text-primary shrink-0" />
                    {selectedEvent.studentName}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    {t("calendarUi.schedule")}
                  </span>
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Clock className="h-4 w-4 text-accent shrink-0" />
                    {selectedEvent.date} @ {fmtTime(selectedEvent.startTime)} – {fmtTime(selectedEvent.endTime)}
                  </span>
                  {!["Completed", "Closed", "Cancelled"].includes(selectedEvent.status) && (
                    <button
                      type="button"
                      onClick={() => { setRescheduleTarget(selectedEvent); setSelectedEvent(null); }}
                      className="mt-1 inline-flex h-7 items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer"
                    >
                      <Clock className="h-3.5 w-3.5" /> {t("calendarUi.rescheduleAction")}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    {t("calendarUi.levelAndFocus")}
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatStatus(selectedEvent.level)} · {formatStatus(selectedEvent.focus)} ({formatStatus(selectedEvent.type)})
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    {t("calendarUi.formatAndDelivery")}
                  </span>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {selectedEvent.deliveryMode === "Online" ? (
                      <Video className="h-4 w-4 text-primary" />
                    ) : (
                      <MapPin className="h-4 w-4 text-accent" />
                    )}
                    {formatStatus(selectedEvent.deliveryMode)}
                  </span>
                </div>
              </div>

              {/* Link / Location */}
              {selectedEvent.locationLink && (
                <div className="space-y-1 border-b border-border/60 pb-4">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    {t("calendarUi.locationOrLink")}
                  </span>
                  {selectedEvent.deliveryMode === "Online" ? (
                    <a
                      href={selectedEvent.locationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      {selectedEvent.locationLink} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="font-semibold text-foreground">
                      {selectedEvent.locationLink}
                    </span>
                  )}
                </div>
              )}

              {Boolean(selectedEvent.lessonTags?.length) && <div className="flex flex-wrap gap-1.5">
                {selectedEvent.lessonTags?.map(tag => <Badge key={tag} variant="secondary" className="max-w-full break-words">
                  {tag === "exam" ? t("calendarUi.examTag") : LESSON_QUICK_TAGS.some(value => value === tag) ? t(`manualLesson.tag_${tag}`) : tag}
                </Badge>)}
              </div>}

              <div className="space-y-1 border-b border-border/60 pb-4">
                <CalendarColorPicker value={selectedEvent.colorKey} disabled={savingColor} onChange={(key) => void saveOccurrenceColor(key)} />
                <p className="text-[11px] text-muted-foreground">{t("calendarUi.colorOccurrenceHint")}</p>
              </div>

              {/* Attendance Track */}
              {!selectedEvent.classId && selectedEvent.studentId && (
              <div className="space-y-2 border-b border-border/60 pb-4 bg-secondary/10 p-3 rounded-xl">
                <h5 className="font-bold text-xs uppercase text-foreground">
                  {t("calendarUi.attendance")}
                </h5>
                <div className="flex items-center gap-3">
                  <Select value={attStatus} onValueChange={(val: any) => setAttStatus(val)}>
                    <SelectTrigger className="h-9 w-36 rounded-lg text-xs bg-card" aria-label={t("calendarUi.attendance")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Present">{t("calendarUi.attendance_present")}</SelectItem>
                      <SelectItem value="Absent">{t("calendarUi.attendance_absent")}</SelectItem>
                      <SelectItem value="Late">{t("calendarUi.attendance_late")}</SelectItem>
                      <SelectItem value="Excused">{t("calendarUi.attendance_excused")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={handleSaveAttendance}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                  >
                    {t("calendarUi.recordAttendance")}
                  </button>
                  {selectedEvent.attendanceRecorded && (
                    <Badge className="bg-success text-success-foreground text-[10px] font-bold">
                      {t("calendarUi.saved")}: {selectedEvent.attendanceStatus ? t(`calendarUi.attendance_${selectedEvent.attendanceStatus.toLowerCase()}`) : ""}
                    </Badge>
                  )}
                </div>
              </div>
              )}

              {selectedEvent.classId && <CalendarClassAttendanceSection
                key={selectedEvent.id}
                teacherId={user?.id}
                classId={selectedEvent.classId}
                eventId={selectedEvent.id}
                cancelled={["Cancelled"].includes(selectedEvent.status)}
              />}

              {/* Lesson Plan linking */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <h5 className="font-bold text-xs uppercase text-foreground">{t("calendarUi.linkedLessonPlan")}</h5>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="https://docs.google.com/..."
                    value={lessonUrl}
                    onChange={(e) => setLessonUrl(e.target.value)}
                    className="h-9 rounded-lg text-xs flex-1"
                  />
                  <button
                    onClick={handleSaveLessonPlan}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                  >
                    {t("calendarUi.linkPlan")}
                  </button>
                </div>
                {selectedEvent.lessonPlanUrl && (
                  <a
                    href={selectedEvent.lessonPlanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline mt-1"
                  >
                    {t("calendarUi.openLinkedLessonPlan")} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Homework management */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <h5 className="font-bold text-xs uppercase text-foreground">{t("calendarUi.homeworkStatus")}</h5>
                <Select
                  value={homeworkStatusValue(selectedEvent && homeworkStatus.statuses[selectedEvent.id])}
                  disabled={homeworkStatus.loading || homeworkStatus.saving || !(selectedEvent.id in homeworkStatus.statuses)}
                  onValueChange={(value) => void homeworkStatus.save(selectedEvent.id, value as HomeworkStatus)}
                >
                  <SelectTrigger className="h-9 text-xs" aria-label={t("calendarUi.homeworkStatus")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unrecorded">{t("calendarUi.homeworkUnrecorded")}</SelectItem>
                    <SelectItem value="pending">{t("calendarUi.homeworkPending")}</SelectItem>
                    <SelectItem value="posted">{t("calendarUi.homeworkSubmitted")}</SelectItem>
                  </SelectContent>
                </Select>
                {homeworkStatus.error && <p role="alert" className="text-xs text-destructive">{homeworkStatus.error}</p>}
                {!homeworkStatus.loading && !homeworkStatus.error && !(selectedEvent.id in homeworkStatus.statuses) && (
                  <p className="text-xs text-muted-foreground">{t("calendarUi.homeworkNoPlan")}</p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t("calendarUi.homeworkPlaceholder")}
                    value={hwTitle}
                    onChange={(e) => setHwTitle(e.target.value)}
                    className="h-9 rounded-lg text-xs flex-1"
                  />
                  <button
                    onClick={handleSaveHomework}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                  >
                    {t("calendarUi.sendHomework")}
                  </button>
                </div>
                {selectedEvent.homeworkTitle && (
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    {t("calendarUi.homework")}: {" "}
                    <span className="font-semibold text-foreground">
                      {selectedEvent.homeworkTitle}
                    </span>
                  </p>
                )}
              </div>

              {/* Class Notes */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <h5 className="font-bold text-xs uppercase text-foreground">{t("calendarUi.classNotes")}</h5>
                <Textarea
                  placeholder={t(selectedEvent.classId ? "calendarUi.classNotesPlaceholder" : "calendarUi.notesPlaceholder")}
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  className="rounded-xl text-xs min-h-[70px]"
                />
                <button
                  onClick={handleUpdateNotes}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                >
                  {t("calendarUi.saveNotes")}
                </button>
              </div>

              {/* Timeline status transition buttons */}
              <div className="space-y-2">
                <h5 className="font-bold text-xs uppercase text-foreground">
                  {t("calendarUi.timelineHeading")}
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Needs Preparation")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-warning/30 bg-warning/5 px-2.5 text-xs font-bold text-warning-foreground hover:bg-warning/10 cursor-pointer"
                  >
                    {t("calendarUi.needsPrep")}
                  </button>
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Lesson Ready")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-success/30 bg-success/5 px-2.5 text-xs font-bold text-success hover:bg-success/10 cursor-pointer"
                  >
                    {t("calendarUi.markReady")}
                  </button>
                  <button
                    onClick={() => {
                      if (selectedEvent.locationLink)
                        window.open(selectedEvent.locationLink, "_blank");
                      else alert(t("calendarUi.noMeetingLink"));
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 text-xs font-bold text-primary hover:bg-primary/10 cursor-pointer"
                  >
                    {t("calendarUi.startClass")} <ExternalLink className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Completed")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/95 cursor-pointer"
                  >
                    {t("calendarUi.completeClass")}
                  </button>
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Closed")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-muted-foreground hover:bg-secondary cursor-pointer"
                  >
                    {t("calendarUi.closeArchive")}
                  </button>
                </div>
              </div>

              {/* Destructive / Admin Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-border/80">
                <Link
                  to="/students"
                  search={selectedEvent.classId ? { classId: selectedEvent.classId } : { studentId: selectedEvent.studentId || selectedEvent.groupId }}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3.5 text-xs font-bold text-foreground transition-all hover:bg-secondary"
                >
                  {t(selectedEvent.classId ? "calendarUi.openClassProfile" : "calendarUi.openStudentProfile")}
                </Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCancelClass(selectedEvent.id)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 text-xs font-bold text-destructive hover:bg-destructive/10 cursor-pointer"
                  >
                    {t("calendarUi.cancelClass")}
                  </button>
                  <DialogClose asChild>
                    <button className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-bold text-foreground transition-all hover:bg-secondary cursor-pointer">
                      {t("calendarUi.closePanel")}
                    </button>
                  </DialogClose>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* AVAILABILITY SETTINGS MODAL */}
      <Dialog open={isAvailOpen} onOpenChange={setIsAvailOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {currentTranslation.workingHours}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3 text-sm">
            {tempAvail.map((av, idx) => (
              <div
                key={av.day}
                className="flex items-center justify-between border-b border-border/40 pb-2"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={av.enabled}
                    onChange={(e) => {
                      const updated = [...tempAvail];
                      updated[idx].enabled = e.target.checked;
                      setTempAvail(updated);
                    }}
                    className="h-4.5 w-4.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="font-bold text-foreground/80 w-24">{av.day}</span>
                </div>
                {av.enabled ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="time"
                      value={av.startTime}
                      onChange={(e) => {
                        const updated = [...tempAvail];
                        updated[idx].startTime = e.target.value;
                        setTempAvail(updated);
                      }}
                      className="h-8 w-24 text-xs rounded-md"
                    />
                    <span className="text-muted-foreground opacity-60 font-semibold">—</span>
                    <Input
                      type="time"
                      value={av.endTime}
                      onChange={(e) => {
                        const updated = [...tempAvail];
                        updated[idx].endTime = e.target.value;
                        setTempAvail(updated);
                      }}
                      className="h-8 w-24 text-xs rounded-md"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/60 italic pr-8">{t("calendarUi.closed")}</span>
                )}
              </div>
            ))}

            <div className="flex items-center justify-end gap-2 pt-4">
              <DialogClose asChild>
                <button className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-bold text-foreground transition-all hover:bg-secondary cursor-pointer">
                  {t("common.cancel")}
                </button>
              </DialogClose>
              <button
                onClick={handleSaveAvail}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
              >
                {t("calendarUi.saveAvailability")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SCHEDULE ONE-TIME LESSON MODAL */}
      <Dialog open={isAddClassOpen} onOpenChange={(open) => { if (!isSavingLesson) setIsAddClassOpen(open); }}>
        <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl p-5 sm:p-6">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {t("auditUi.scheduleClass")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateClass} className="space-y-4 pt-3 text-sm">
            <fieldset disabled={isSavingLesson || Boolean(pendingLessonPlans)} className="space-y-4 min-w-0">
            <LessonStudentsSelect students={studentsList} selected={selectedStudentIds} t={t} onChange={(ids) => {
              setSelectedStudentIds(ids);
              if (!selectedStudentIds.length && ids.length === 1) {
                const matched = studentsList.find(student => student.id === ids[0]);
                if (matched?.level) setAddLevel(matched.level as CEFRLevel);
              }
            }} />
            {studentsList.length === 0 && <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("calendarUi.noStudents")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { setIsAddClassOpen(false); navigate({ to: "/students" }); }}>
                <User className="size-4" />{t("auditUi.addStudent")}
              </Button>
            </div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-date">{t("calendarUi.date")}</Label>
                <Input id="add-date" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} required className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-type">{t("calendarUi.classType")}</Label>
                <Select value={addType} onValueChange={(val: StudentType) => setAddType(val)}>
                  <SelectTrigger id="add-type" className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Private">{formatStatus("Private")}</SelectItem>
                    <SelectItem value="Group">{formatStatus("Group")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-time">{t("manualLesson.startTime")}</Label>
                <Input id="add-time" type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} required className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-end-time">{t("manualLesson.endTime")}</Label>
                <Input id="add-end-time" type="time" value={addEndTime} onChange={(e) => setAddEndTime(e.target.value)} required className="h-10 rounded-xl" />
              </div>
            </div>

            {/* Level & Focus */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-level" className="text-xs font-semibold text-foreground">
                  {t("calendarUi.cefrLevel")}
                </Label>
                <Select value={addLevel} onValueChange={(val: any) => setAddLevel(val)}>
                  <SelectTrigger id="add-level" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A1">A1</SelectItem>
                    <SelectItem value="A2">A2</SelectItem>
                    <SelectItem value="B1">B1</SelectItem>
                    <SelectItem value="B2">B2</SelectItem>
                    <SelectItem value="C1">C1</SelectItem>
                    <SelectItem value="C2">C2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-focus" className="text-xs font-semibold text-foreground">
                  {t("calendarUi.courseFocus")}
                </Label>
                <Select value={addFocus} onValueChange={(val: any) => setAddFocus(val)}>
                  <SelectTrigger id="add-focus" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General English">{formatStatus("General English")}</SelectItem>
                    <SelectItem value="Business English">{formatStatus("Business English")}</SelectItem>
                    <SelectItem value="Travel">{formatStatus("Travel")}</SelectItem>
                    <SelectItem value="Conversation">{formatStatus("Conversation")}</SelectItem>
                    <SelectItem value="IELTS">IELTS</SelectItem>
                    <SelectItem value="TOEFL">TOEFL</SelectItem>
                    <SelectItem value="Cambridge">Cambridge</SelectItem>
                    <SelectItem value="Other">{formatStatus("Other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mode & Link */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-mode" className="text-xs font-semibold text-foreground">
                  {t("calendarUi.format")}
                </Label>
                <Select value={addMode} onValueChange={(val: any) => setAddMode(val)}>
                  <SelectTrigger id="add-mode" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="In person">{formatStatus("In person")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-link" className="text-xs font-semibold text-foreground">
                  {t("calendarUi.meetingLinkLocation")}
                </Label>
                <Input
                  id="add-link"
                  value={addLink}
                  onChange={(e) => setAddLink(e.target.value)}
                  placeholder="https://zoom.us/..."
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <LessonTagsSelect tags={addTags} onChange={setAddTags} t={t} />
            </fieldset>
            {lessonSaveError && <p role="alert" className="text-sm text-destructive">{lessonSaveError}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSavingLesson}>{t("common.cancel")}</Button></DialogClose>
              <Button type="submit" disabled={isSavingLesson || !user?.id}>
                {isSavingLesson ? t("manualLesson.saving") : pendingLessonPlans ? t("manualLesson.retryPlans") : t("calendarUi.scheduleClass")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* FIRST-TIME CALENDAR SETUP MODAL */}
      {user && (
        <FirstTimeCalendarSetupModal
          isOpen={isFirstTimeSetupOpen}
          onClose={() => setIsFirstTimeSetupOpen(false)}
          teacherId={user.id}
          onOpenSetupFlow={() => {
            setCentralAvailTab("working_hours");
            setIsCentralAvailOpen(true);
          }}
        />
      )}

      {/* CENTRAL AVAILABILITY MODAL */}
      {user && (
        <CentralAvailabilityModal
          isOpen={isCentralAvailOpen}
          onClose={() => setIsCentralAvailOpen(false)}
          teacherId={user.id}
          initialTab={centralAvailTab}
          onSaved={() => {
            loadWorkingAvailability();
            loadTimeOffData();
          }}
        />
      )}

      {/* NON-WORKING DAYS SETUP & MANAGEMENT MODAL */}
      {user && (
        <NonWorkingDaysModal
          isOpen={isNonWorkingModalOpen}
          onClose={() => setIsNonWorkingModalOpen(false)}
          teacherId={user.id}
          onTimeOffUpdated={() => loadTimeOffData()}
        />
      )}

      {/* SCHEDULING CONFLICT DIALOG */}
      <SchedulingConflictDialog
        isOpen={isConflictDialogOpen}
        onClose={() => {
          setIsConflictDialogOpen(false);
          setConflictTimeOff(null);
        }}
        timeOffBlock={conflictTimeOff}
        targetDate={addDate}
        onConfirmOverride={() => {
          setIsConflictDialogOpen(false);
          if (pendingClassData) {
            executeCreateClass(pendingClassData);
            setPendingClassData(null);
          }
        }}
      />
    </div>
  );
}
