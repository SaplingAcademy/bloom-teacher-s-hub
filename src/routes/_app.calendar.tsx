import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
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
  Sparkles,
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
import { resolveEventColorMeta } from "@/lib/brand-colors";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar · Bloom" },
      {
        name: "description",
        content: "Schedule classes, manage availability, and review classroom timeline.",
      },
    ],
  }),
  component: CalendarPage,
});

// Translation dictionary
const t = {
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
  const { lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [availability, setAvailability] = useState<WorkingAvailability[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Supabase Data State & Error Resilience
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isEventsError, setIsEventsError] = useState(false);
  const [studentsList, setStudentsList] = useState<Array<{ id: string; full_name: string; level?: string; language_studied?: string; type?: string }>>([]);
  const [studentColorMap, setStudentColorMap] = useState<Record<string, string>>({});
  const [classColorMap, setClassColorMap] = useState<Record<string, string>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string>("none");

  // Filters State
  const [filterType, setFilterType] = useState<string>("All");
  const [filterFormat, setFilterFormat] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");

  // Availability Modal State
  const [isAvailOpen, setIsAvailOpen] = useState(false);
  const [tempAvail, setTempAvail] = useState<WorkingAvailability[]>([]);

  // Add Class Modal State
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDate, setAddDate] = useState(formatDateString(new Date()));
  const [addTime, setAddTime] = useState("09:00");
  const [addDuration, setAddDuration] = useState(60);
  const [addType, setAddType] = useState<"Private" | "Group">("Private");
  const [addLevel, setAddLevel] = useState<CEFRLevel>("B2");
  const [addFocus, setAddFocus] = useState<CourseFocus>("General English");
  const [addMode, setAddMode] = useState<"Online" | "In person">("Online");
  const [addLink, setAddLink] = useState("");

  // Quick Action Forms State
  const [hwTitle, setHwTitle] = useState("");
  const [attStatus, setAttStatus] = useState<"Present" | "Absent" | "Excused">("Present");
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
  const [pendingClassData, setPendingClassData] = useState<any | null>(null);

  // Load time off records and check first-time setup prompt
  const loadTimeOffData = useCallback(async () => {
    if (!user) return;
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

  // Fetch events from Supabase
  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setIsLoadingEvents(true);
    setIsEventsError(false);

    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("teacher_id", user.id)
        .order("date", { ascending: true });

      if (error) {
        console.error("[Calendar Load Failure]", {
          step: "fetch_calendar_events",
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        toast.error(lang === "pt" ? `Erro ao carregar agenda: ${error.message}` : `Error loading agenda: ${error.message}`);
        setIsEventsError(true);
        setEvents([]);
        setIsLoadingEvents(false);
        return;
      }

      if (data) {
        const mapped: CalendarEvent[] = data.map((d: any) => ({
          id: d.id,
          teacherId: d.teacher_id,
          studentId: d.student_id,
          scheduleId: d.schedule_id,
          studentName: d.student_name || "Aula",
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
        setEvents(mapped);
      }
    } catch (err: any) {
      console.error("[Calendar] Failed to fetch events:", err);
      setIsEventsError(true);
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [user, lang]);

  // Temporary development action: Manual Sync Agenda button handler
  const handleManualSyncAgenda = async () => {
    if (!user) return;
    setIsSyncingAgenda(true);
    toast.info(lang === "pt" ? "Sincronizando agenda com o banco de dados..." : "Syncing schedule with database...");

    try {
      // 1. Fetch all current teacher students
      const { data: studentsData, error: stErr } = await supabase
        .from("students")
        .select("id, full_name, level, language_studied, type")
        .eq("teacher_id", user.id);

      if (stErr) {
        console.error("[Calendar] Failed to load students for manual sync:", stErr);
        toast.error(`Falha ao carregar alunos: ${stErr.message}`);
        setIsSyncingAgenda(false);
        return;
      }

      if (!studentsData || studentsData.length === 0) {
        toast.info(lang === "pt" ? "Nenhum aluno encontrado para este professor." : "No students found for this teacher.");
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
          .select("id, weekday, start_time, end_time")
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
            ? `Agenda sincronizada! Ocorrências geradas: ${totalGenerated}, Inseridas/Upsert: ${totalInserted}.`
            : `Schedule synced! Occurrences generated: ${totalGenerated}, Inserted: ${totalInserted}.`
        );
      } else {
        toast.error(
          `Sincronização concluída com avisos. Inseridas: ${totalInserted}. Falhas: ${totalFailed}. ${errorsList.join(" | ")}`
        );
      }
    } catch (err: any) {
      console.error("[Calendar] Manual sync error:", err);
      toast.error(`Erro ao sincronizar agenda: ${err?.message || err}`);
    } finally {
      setIsSyncingAgenda(false);
    }
  };

  // Fetch teacher's students for the manual class modal selector
  const fetchStudents = useCallback(async () => {
    if (!user) return;
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
    } catch (e) {
      console.warn("[Calendar] Error fetching students for selector:", e);
    }
  }, [user]);

  const loadWorkingAvailability = useCallback(async () => {
    if (!user) return;
    const snapshot = await getTeacherAvailability(user.id, { force: true });
    setAvailabilitySnapshot(snapshot);
    setAvailability(snapshot.days);
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchEvents();
    fetchStudents();
    loadWorkingAvailability();
  }, [fetchEvents, fetchStudents, loadWorkingAvailability]);

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
      toast.error(res.error || (lang === "pt" ? "Erro ao salvar disponibilidade." : "Error saving availability."));
      return;
    }
    invalidateTeacherAvailability(user.id);
    await loadWorkingAvailability();
    setIsAvailOpen(false);
  };

  // Create class execution logic
  const executeCreateClass = async (overrideData?: any) => {
    const targetName = overrideData ? overrideData.name : addName;
    const targetDate = overrideData ? overrideData.date : addDate;
    const targetTime = overrideData ? overrideData.time : addTime;
    const targetDuration = overrideData ? overrideData.duration : addDuration;
    const targetType = overrideData ? overrideData.type : addType;
    const targetLevel = overrideData ? overrideData.level : addLevel;
    const targetFocus = overrideData ? overrideData.focus : addFocus;
    const targetMode = overrideData ? overrideData.mode : addMode;
    const targetLink = overrideData ? overrideData.link : addLink;
    const targetStudentId = overrideData ? overrideData.selectedStudentId : selectedStudentId;

    if (!targetName.trim()) return;

    const chosenStudent = studentsList.find((s) => s.id === targetStudentId);

    if (user) {
      const payload = {
        teacher_id: user.id,
        student_id: chosenStudent ? chosenStudent.id : null,
        student_name: targetName,
        level: targetLevel,
        focus: targetFocus,
        date: targetDate,
        start_time: targetTime,
        end_time: calculateEndTime(targetTime, targetDuration),
        duration: targetDuration,
        type: targetType,
        delivery_mode: targetMode,
        location_link: targetLink || null,
        status: "Scheduled",
        is_recurring: false,
      };

      try {
        const { data, error } = await supabase
          .from("calendar_events")
          .insert(payload)
          .select()
          .single();

        if (error) {
          console.warn("[Calendar] Supabase insert failed, adding locally:", error.message);
          const fallbackEvt: CalendarEvent = {
            id: `evt-${crypto.randomUUID()}`,
            studentId: chosenStudent?.id,
            studentName: targetName,
            level: targetLevel,
            focus: targetFocus,
            date: targetDate,
            startTime: targetTime,
            endTime: calculateEndTime(targetTime, targetDuration),
            duration: targetDuration,
            type: targetType,
            deliveryMode: targetMode,
            locationLink: targetLink || undefined,
            status: "Scheduled",
          };
          updateEventsState([...events, fallbackEvt]);
        } else if (data) {
          const createdEvt: CalendarEvent = {
            id: data.id,
            teacherId: data.teacher_id,
            studentId: data.student_id,
            studentName: data.student_name,
            level: data.level as CEFRLevel,
            focus: data.focus as CourseFocus,
            date: data.date,
            startTime: data.start_time,
            endTime: data.end_time,
            duration: data.duration,
            type: data.type as StudentType,
            deliveryMode: data.delivery_mode as "Online" | "In person",
            locationLink: data.location_link || undefined,
            status: data.status as TimelineStatus,
          };
          setEvents((prev) => [...prev, createdEvt]);
          toast.success(lang === "pt" ? "Aula agendada com sucesso!" : "Class scheduled successfully!");
        }
      } catch (err) {
        console.error("Failed to create class:", err);
      }
    } else {
      const newEvt: CalendarEvent = {
        id: `evt-${crypto.randomUUID()}`,
        studentId: chosenStudent?.id,
        studentName: targetName,
        level: targetLevel,
        focus: targetFocus,
        date: targetDate,
        startTime: targetTime,
        endTime: calculateEndTime(targetTime, targetDuration),
        duration: targetDuration,
        type: targetType,
        deliveryMode: targetMode,
        locationLink: targetLink || undefined,
        status: "Scheduled",
      };
      updateEventsState([...events, newEvt]);
    }

    setIsAddClassOpen(false);
    setAddName("");
    setSelectedStudentId("none");
    setAddDate(formatDateString(new Date()));
    setAddTime("09:00");
  };

  // Create class form submit handler with conflict check
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;

    // Warn (never silently block) when the slot falls outside the teacher availability
    if (availabilitySnapshot) {
      const check = isSlotAvailable(
        availabilitySnapshot,
        addDate,
        addTime,
        calculateEndTime(addTime, addDuration).slice(0, 5)
      );
      if (!check.available && check.reason?.kind !== "time_off") {
        toast.warning(check.reason?.message || "Horário fora da sua disponibilidade.");
      }
    }

    // Check if scheduling on a non-working date
    const matchedTimeOff = checkDateIsNonWorking(addDate, timeOffList);
    if (matchedTimeOff) {
      setConflictTimeOff(matchedTimeOff);
      setPendingClassData({
        name: addName,
        date: addDate,
        time: addTime,
        duration: addDuration,
        type: addType,
        level: addLevel,
        focus: addFocus,
        mode: addMode,
        link: addLink,
        selectedStudentId,
      });
      setIsConflictDialogOpen(true);
      return;
    }

    await executeCreateClass();
  };

  // Filter logic
  const filteredEvents = events.filter((evt) => {
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
      lang === "pt"
        ? "Deseja aplicar a alteração de status a toda a série recorrente de aulas?"
        : "Do you want to apply this status change to the entire recurring series of classes?",
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
      lang === "pt"
        ? "Aplicar reagendamento a toda a série recorrente?"
        : "Reschedule the entire recurring series?",
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
    alert(lang === "pt" ? "Reagendado com sucesso!" : "Rescheduled successfully!");
  };

  // Cancel class or series
  const handleCancelClass = (eventId: string) => {
    const isSeriesChange = window.confirm(
      lang === "pt"
        ? "Cancelar toda a série recorrente de aulas?"
        : "Cancel the entire recurring series of classes?",
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
    alert(lang === "pt" ? "Aula cancelada com sucesso." : "Class cancelled successfully.");
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
    alert(lang === "pt" ? "Anotações salvas!" : "Notes saved!");
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
      lang === "pt"
        ? "Lição de casa enviada e status atualizado!"
        : "Homework sent and status updated!",
    );
  };

  const handleSaveAttendance = () => {
    if (!selectedEvent) return;
    const updated = events.map((evt) => {
      if (evt.id === selectedEvent.id) {
        return { ...evt, attendanceRecorded: true, attendanceStatus: attStatus };
      }
      return evt;
    });
    updateEventsState(updated);
    setSelectedEvent({ ...selectedEvent, attendanceRecorded: true, attendanceStatus: attStatus });
    alert(lang === "pt" ? "Presença registrada!" : "Attendance recorded!");
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
    alert(lang === "pt" ? "Plano de aula vinculado!" : "Lesson plan linked!");
  };

  const currentTranslation = t[lang];

  // Hours for grid display in week/day view (08:00 to 21:00)
  const gridHours = [
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
  ];

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <PageHeader
        title={currentTranslation.title}
        description={currentTranslation.description}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSyncAgenda}
              disabled={isSyncingAgenda}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition-all hover:bg-primary/20 disabled:opacity-50 cursor-pointer"
              title="Sincronizar horários dos alunos para a agenda nos próximos 2 meses"
            >
              <RotateCcw className={`h-4 w-4 ${isSyncingAgenda ? "animate-spin" : ""}`} />
              <span>{isSyncingAgenda ? "Sincronizando..." : "Sincronizar agenda"}</span>
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
            <button
              onClick={() => setIsAddClassOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/95 shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{currentTranslation.addClass}</span>
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
              {lang === "pt"
                ? "Não foi possível carregar a agenda do Supabase."
                : "Failed to load schedule from Supabase."}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents()}
            className="h-8 border-destructive/30 text-destructive hover:bg-destructive/20"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {lang === "pt" ? "Tentar novamente" : "Retry"}
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
                    Você ainda não definiu seus horários de trabalho.
                  </p>
                  <p className="text-stone-600 dark:text-stone-400 text-xs">
                    Cadastre os dias e horários da semana em que você costuma dar aulas.
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
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Configurar disponibilidade
              </Button>
            </div>
          );
        }

        return (
          <div className="p-3 rounded-2xl border border-border bg-card flex flex-wrap items-center justify-between gap-2 text-xs shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-muted-foreground text-[11px] uppercase tracking-wider">
                Disponibilidade:
              </span>
              {enabledDays.map((a) => {
                const label =
                  WEEKDAYS_MAP.find((w) => w.key === a.day)?.labelPt || a.day;
                return (
                  <Badge key={a.day} variant="secondary" className="text-[11px] font-bold gap-1 bg-muted px-2 py-0.5">
                    <span>{label}</span>
                    <span className="text-muted-foreground font-semibold">{a.startTime}–{a.endTime}</span>
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
              <span>Editar</span>
            </button>
          </div>
        );
      })()}

      {/* MAIN CONTAINER: SIDEBAR + GRID */}
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* LEFT COLUMN: FILTERS & INFOS */}
        <div className="space-y-5">
          {/* Filters card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
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
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {currentTranslation.workingHours}
            </h4>
            <ul className="space-y-2 text-xs font-medium text-muted-foreground">
              {availability.map((av) => (
                <li key={av.day} className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-foreground/80">{av.day.substring(0, 3)}</span>
                  <span>{av.enabled ? `${av.startTime} – ${av.endTime}` : "Closed"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT COLUMN: CALENDAR RENDER CONTAINER */}
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-md)] overflow-hidden">
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

                      return (
                        <div
                          key={dayIdx}
                          className="p-1 border-r border-border/60 relative bg-card hover:bg-secondary/10 transition-colors flex flex-col gap-1 min-h-[64px]"
                        >
                          {cellEvents.map((evt) => {
                            const colorMeta = resolveEventColorMeta(
                              evt.studentId ? studentColorMap[evt.studentId] : undefined,
                              evt.groupId ? classColorMap[evt.groupId] : undefined
                            );
                            return (
                              <div
                                key={evt.id}
                                onClick={() => {
                                  setSelectedEvent(evt);
                                  setNotesText(evt.notes || "");
                                }}
                                className={`rounded-xl border p-2 text-left cursor-pointer transition-all hover:scale-[1.02] hover:shadow-sm space-y-1 ${colorMeta.calendarEventClass}`}
                              >
                              <div className="font-display text-xs font-bold leading-tight truncate text-foreground">
                                {evt.studentName}
                              </div>
                              <div className="text-[10px] font-semibold flex items-center justify-between opacity-80">
                                <span>
                                  {evt.startTime}–{evt.endTime}
                                </span>
                                <span>{evt.level}</span>
                              </div>
                              <div className="text-[9px] font-medium opacity-70 truncate">
                                {evt.focus}
                              </div>
                              {/* Small status indicator pill */}
                              <div className="text-[8px] font-bold uppercase tracking-wider mt-1 inline-block border border-current px-1.5 py-0.5 rounded-md">
                                {evt.status === "Needs Preparation" &&
                                  (lang === "pt" ? "Prep Necessária" : "Prep Needed")}
                                {evt.status === "Lesson Ready" &&
                                  (lang === "pt" ? "Pronta" : "Ready")}
                                {evt.status === "Homework Pending" &&
                                  (lang === "pt" ? "Tarefa Pendente" : "Hw Pending")}
                                {evt.status === "Homework Sent" &&
                                  (lang === "pt" ? "Tarefa Enviada" : "Hw Sent")}
                                {evt.status === "Feedback Pending" &&
                                  (lang === "pt" ? "Feedback Pendente" : "Fb Pending")}
                                {evt.status === "Completed" &&
                                  (lang === "pt" ? "Concluída" : "Completed")}
                                {evt.status === "Closed" &&
                                  (lang === "pt" ? "Arquivada" : "Closed")}
                              </div>
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

                return (
                  <div
                    key={hour}
                    className="grid grid-cols-[100px_1fr] p-2 min-h-[64px] items-center"
                  >
                    <div className="text-right pr-4 text-xs font-bold text-muted-foreground">
                      {hour}
                    </div>
                    <div className="flex flex-col gap-2">
                      {cellEvents.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground/40 italic ml-2">
                          Empty
                        </span>
                      ) : (
                        cellEvents.map((evt) => {
                          const colorMeta = resolveEventColorMeta(
                            evt.studentId ? studentColorMap[evt.studentId] : undefined,
                            evt.groupId ? classColorMap[evt.groupId] : undefined
                          );
                          return (
                            <div
                              key={evt.id}
                              onClick={() => {
                                setSelectedEvent(evt);
                                setNotesText(evt.notes || "");
                              }}
                              className={`rounded-2xl border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between cursor-pointer max-w-2xl transition-all hover:scale-[1.01] ${colorMeta.cardTintClass} ${
                                colorMeta.key !== "default" ? `border-l-4 ${colorMeta.borderClass}` : "border-border bg-card"
                              }`}
                            >
                              <div className="space-y-1">
                                <h4 className="font-display font-bold text-foreground text-sm">
                                  {evt.studentName}
                                </h4>
                                <p className="text-xs font-semibold opacity-85">
                                  {evt.startTime} – {evt.endTime} ({evt.duration}m) · {evt.level} ·{" "}
                                  {evt.focus}
                                </p>
                                {evt.locationLink && (
                                  <p className="text-[11px] opacity-75 flex items-center gap-1">
                                    <Video className="h-3.5 w-3.5" />
                                    <a
                                      href={evt.locationLink}
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
                                  {evt.status}
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
                <div>Seg</div>
                <div>Ter</div>
                <div>Qua</div>
                <div>Qui</div>
                <div>Sex</div>
                <div>Sáb</div>
                <div>Dom</div>
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
                        className={`border border-border/80 rounded-xl min-h-[85px] p-1.5 space-y-1 transition-colors flex flex-col justify-between ${
                          isCurrentMonth ? "bg-secondary/5 hover:bg-secondary/10" : "bg-muted/10 opacity-50"
                        }`}
                      >
                        <span className="text-xs font-bold text-foreground/60">
                          {cellDate.getDate()}
                        </span>
                        <div className="space-y-0.5 flex-1 flex flex-col justify-end">
                          {cellEvents.slice(0, 3).map((e) => {
                            const colorMeta = resolveEventColorMeta(
                              e.studentId ? studentColorMap[e.studentId] : undefined,
                              e.groupId ? classColorMap[e.groupId] : undefined
                            );
                            return (
                              <div
                                key={e.id}
                                onClick={() => {
                                  setSelectedEvent(e);
                                  setNotesText(e.notes || "");
                                }}
                                className={`text-[9px] font-bold truncate rounded px-1 py-0.5 cursor-pointer border ${colorMeta.calendarEventClass}`}
                              >
                                {e.startTime} {e.studentName}
                              </div>
                            );
                          })}
                          {cellEvents.length > 3 && (
                            <div className="text-[8px] text-muted-foreground font-semibold text-center mt-0.5">
                              + {cellEvents.length - 3} more
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

      {/* SIDE DETAILS MODAL PANEL */}
      <Dialog
        open={selectedEvent !== null}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      >
        {selectedEvent && (
          <DialogContent className="max-w-xl rounded-2xl p-6 overflow-y-auto max-h-[85vh]">
            <DialogHeader className="border-b border-border/60 pb-3">
              <DialogTitle className="font-display text-lg font-bold text-foreground flex items-center justify-between">
                <span>{currentTranslation.detailsTitle}</span>
                <Badge
                  variant="outline"
                  className={`text-xs py-0.5 border-current ${getStatusStyles(selectedEvent.status)}`}
                >
                  {selectedEvent.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-3 text-sm">
              {/* Grid data */}
              <div className="grid grid-cols-2 gap-4 border-b border-border/60 pb-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    Student / Group
                  </span>
                  <span className="font-bold text-foreground text-base flex items-center gap-1">
                    <User className="h-4 w-4 text-primary shrink-0" />
                    {selectedEvent.studentName}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    Schedule
                  </span>
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Clock className="h-4 w-4 text-accent shrink-0" />
                    {selectedEvent.date} @ {selectedEvent.startTime} – {selectedEvent.endTime}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    Level & Focus
                  </span>
                  <span className="font-semibold text-foreground">
                    {selectedEvent.level} · {selectedEvent.focus} ({selectedEvent.type})
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    Format & Delivery
                  </span>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {selectedEvent.deliveryMode === "Online" ? (
                      <Video className="h-4 w-4 text-primary" />
                    ) : (
                      <MapPin className="h-4 w-4 text-accent" />
                    )}
                    {selectedEvent.deliveryMode}
                  </span>
                </div>
              </div>

              {/* Link / Location */}
              {selectedEvent.locationLink && (
                <div className="space-y-1 border-b border-border/60 pb-4">
                  <span className="text-xs text-muted-foreground font-semibold block uppercase">
                    Location / Link
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

              {/* Attendance Track */}
              <div className="space-y-2 border-b border-border/60 pb-4 bg-secondary/10 p-3 rounded-xl">
                <h5 className="font-bold text-xs uppercase text-foreground">
                  Attendance & Presence
                </h5>
                <div className="flex items-center gap-3">
                  <Select value={attStatus} onValueChange={(val: any) => setAttStatus(val)}>
                    <SelectTrigger className="h-9 w-36 rounded-lg text-xs bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Present">Present</SelectItem>
                      <SelectItem value="Absent">Absent</SelectItem>
                      <SelectItem value="Excused">Excused</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={handleSaveAttendance}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                  >
                    Record Attendance
                  </button>
                  {selectedEvent.attendanceRecorded && (
                    <Badge className="bg-success text-success-foreground text-[10px] font-bold">
                      Saved: {selectedEvent.attendanceStatus}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Lesson Plan linking */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <h5 className="font-bold text-xs uppercase text-foreground">Linked Lesson Plan</h5>
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
                    Link Plan
                  </button>
                </div>
                {selectedEvent.lessonPlanUrl && (
                  <a
                    href={selectedEvent.lessonPlanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline mt-1"
                  >
                    Open Linked Lesson Plan <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Homework management */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <h5 className="font-bold text-xs uppercase text-foreground">Homework Status</h5>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. Write business email draft"
                    value={hwTitle}
                    onChange={(e) => setHwTitle(e.target.value)}
                    className="h-9 rounded-lg text-xs flex-1"
                  />
                  <button
                    onClick={handleSaveHomework}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                  >
                    Send Homework
                  </button>
                </div>
                {selectedEvent.homeworkTitle && (
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    Homework:{" "}
                    <span className="font-semibold text-foreground">
                      {selectedEvent.homeworkTitle}
                    </span>
                  </p>
                )}
              </div>

              {/* Class Notes */}
              <div className="space-y-2 border-b border-border/60 pb-4">
                <h5 className="font-bold text-xs uppercase text-foreground">Class Notes</h5>
                <Textarea
                  placeholder="Notes about student performance, next steps..."
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  className="rounded-xl text-xs min-h-[70px]"
                />
                <button
                  onClick={handleUpdateNotes}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
                >
                  Save Notes
                </button>
              </div>

              {/* Timeline status transition buttons */}
              <div className="space-y-2">
                <h5 className="font-bold text-xs uppercase text-foreground">
                  Classroom Timeline Transition
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Needs Preparation")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-warning/30 bg-warning/5 px-2.5 text-xs font-bold text-warning-foreground hover:bg-warning/10 cursor-pointer"
                  >
                    Needs Prep
                  </button>
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Lesson Ready")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-success/30 bg-success/5 px-2.5 text-xs font-bold text-success hover:bg-success/10 cursor-pointer"
                  >
                    Mark Ready
                  </button>
                  <button
                    onClick={() => {
                      if (selectedEvent.locationLink)
                        window.open(selectedEvent.locationLink, "_blank");
                      else alert("No meeting link set!");
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 text-xs font-bold text-primary hover:bg-primary/10 cursor-pointer"
                  >
                    Start Class <ExternalLink className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Completed")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/95 cursor-pointer"
                  >
                    Complete Class
                  </button>
                  <button
                    onClick={() => updateEventStatus(selectedEvent.id, "Closed")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-muted-foreground hover:bg-secondary cursor-pointer"
                  >
                    Close & Archive
                  </button>
                </div>
              </div>

              {/* Destructive / Admin Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-border/80">
                <Link
                  to="/students"
                  search={{ studentId: selectedEvent.studentId || selectedEvent.groupId }}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3.5 text-xs font-bold text-foreground transition-all hover:bg-secondary"
                >
                  Open Student Profile
                </Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCancelClass(selectedEvent.id)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 text-xs font-bold text-destructive hover:bg-destructive/10 cursor-pointer"
                  >
                    Cancel Class
                  </button>
                  <DialogClose asChild>
                    <button className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-bold text-foreground transition-all hover:bg-secondary cursor-pointer">
                      Close Panel
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
                  <span className="text-xs text-muted-foreground/60 italic pr-8">Closed</span>
                )}
              </div>
            ))}

            <div className="flex items-center justify-end gap-2 pt-4">
              <DialogClose asChild>
                <button className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-bold text-foreground transition-all hover:bg-secondary cursor-pointer">
                  Cancel
                </button>
              </DialogClose>
              <button
                onClick={handleSaveAvail}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow hover:bg-primary/95 cursor-pointer"
              >
                Save Availability
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SCHEDULE CUSTOM CLASS MODAL */}
      <Dialog open={isAddClassOpen} onOpenChange={setIsAddClassOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {lang === "pt" ? "Agendar Nova Aula" : "Schedule Class"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateClass} className="space-y-4 pt-3 text-sm">
            {/* Student Selector */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                {lang === "pt" ? "Selecionar Aluno (Opcional)" : "Select Student (Optional)"}
              </Label>
              {studentsList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-3 text-center space-y-2 bg-secondary/20">
                  <p className="text-xs text-muted-foreground">
                    {lang === "pt" ? "Você ainda não cadastrou nenhum aluno." : "You haven't added any students yet."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => {
                      setIsAddClassOpen(false);
                      navigate({ to: "/students" });
                    }}
                  >
                    <User className="w-3.5 h-3.5 mr-1.5" />
                    {lang === "pt" ? "Cadastrar aluno" : "Add Student"}
                  </Button>
                </div>
              ) : (
                <Select
                  value={selectedStudentId}
                  onValueChange={(val) => {
                    setSelectedStudentId(val);
                    const matched = studentsList.find((s) => s.id === val);
                    if (matched) {
                      setAddName(matched.full_name);
                      if (matched.level) setAddLevel(matched.level as CEFRLevel);
                      if (matched.language_studied) setAddFocus(matched.language_studied as CourseFocus);
                      if (matched.type) setAddType(matched.type as StudentType);
                    }
                  }}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder={lang === "pt" ? "Escolha um aluno ou digite abaixo..." : "Choose a student or enter custom name..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {lang === "pt" ? "Nenhum (Evento Pessoal / Outro)" : "None (Personal Event / Other)"}
                    </SelectItem>
                    {studentsList.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.full_name} {st.level ? `(${st.level})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Student / Event Name */}
            <div className="space-y-1">
              <Label htmlFor="add-name" className="text-xs font-semibold text-foreground">
                {lang === "pt" ? "Nome do Aluno ou Evento" : "Student or Event Name"}
              </Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Lucas Meyer / Reunião"
                required
                className="h-10 rounded-xl"
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-date" className="text-xs font-semibold text-foreground">
                  Date
                </Label>
                <Input
                  id="add-date"
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  required
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-time" className="text-xs font-semibold text-foreground">
                  Start Time
                </Label>
                <Input
                  id="add-time"
                  type="time"
                  value={addTime}
                  onChange={(e) => setAddTime(e.target.value)}
                  required
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            {/* Duration & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-duration" className="text-xs font-semibold text-foreground">
                  Duration (Minutes)
                </Label>
                <Select
                  value={String(addDuration)}
                  onValueChange={(val) => setAddDuration(Number(val))}
                >
                  <SelectTrigger id="add-duration" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min (1h)</SelectItem>
                    <SelectItem value="90">90 min</SelectItem>
                    <SelectItem value="120">120 min (2h)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-type" className="text-xs font-semibold text-foreground">
                  Class Type
                </Label>
                <Select value={addType} onValueChange={(val: any) => setAddType(val)}>
                  <SelectTrigger id="add-type" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Private">Private</SelectItem>
                    <SelectItem value="Group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Level & Focus */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-level" className="text-xs font-semibold text-foreground">
                  CEFR Level
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
                  Course Focus
                </Label>
                <Select value={addFocus} onValueChange={(val: any) => setAddFocus(val)}>
                  <SelectTrigger id="add-focus" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General English">General English</SelectItem>
                    <SelectItem value="Business English">Business English</SelectItem>
                    <SelectItem value="Travel">Travel</SelectItem>
                    <SelectItem value="Conversation">Conversation</SelectItem>
                    <SelectItem value="IELTS">IELTS</SelectItem>
                    <SelectItem value="TOEFL">TOEFL</SelectItem>
                    <SelectItem value="Cambridge">Cambridge</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mode & Link */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-mode" className="text-xs font-semibold text-foreground">
                  Format
                </Label>
                <Select value={addMode} onValueChange={(val: any) => setAddMode(val)}>
                  <SelectTrigger id="add-mode" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="In person">In person</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-link" className="text-xs font-semibold text-foreground">
                  Meeting Link / Location
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

            <div className="flex items-center justify-end gap-2 pt-4">
              <DialogClose asChild>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                >
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all cursor-pointer"
              >
                Schedule Class
              </button>
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
