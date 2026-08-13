import { resolveTeacherFirstName } from "@/lib/teacher-name";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { UrgentWidget } from "@/components/bloom/UrgentWidget";
import { DailyPrioritiesCard } from "@/components/bloom/DailyPrioritiesCard";

/**
 * Helper to extract canonical teacher first name from profile or auth user metadata.
 * Returns null if name is unconfigured, empty, or default.
 */
export function getTeacherFirstName(profile: any, user: any): string | null {
  return resolveTeacherFirstName(profile, user);
}
import {
  getCalendarEvents,
  CalendarEvent,
  formatDateString,
  saveCalendarEvents,
} from "@/lib/calendar-sync";
import {
  fetchDashboardMetrics,
  EMPTY_DASHBOARD_METRICS,
  type DashboardMetrics,
} from "@/lib/dashboard-metrics";
import { formatCentsToBRL } from "@/lib/finance-engine";
import {
  Users,
  Wallet,
  UserPlus,
  CalendarClock,
  Clock,
  Video,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Search,
  ChevronDown,
  Check,
  Settings,
  BookOpen,
  Megaphone,
  User,
  ShieldAlert,
  CheckSquare,
  MessageSquare,
  Star,
  Calendar,
  FileText,
  Flag,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { StatCard } from "@/components/bloom/StatCard";
import { PanelCard } from "@/components/bloom/PanelCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTags, Tag, BRAND_COLORS, TAG_ICONS, getTagColorStyles } from "@/hooks/use-tags";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "Today · Bloom" },
      {
        name: "description",
        content: "Your teaching day at a glance — classes, tasks and quick actions.",
      },
    ],
  }),
  component: TodayPage,
});

// CategoryIcon component to render chosen icons dynamically
const CategoryIcon = ({ name, className }: { name: string; className?: string }) => {
  switch (name) {
    case "Users":
      return <Users className={className} />;
    case "BookOpen":
      return <BookOpen className={className} />;
    case "Wallet":
      return <Wallet className={className} />;
    case "Megaphone":
      return <Megaphone className={className} />;
    case "User":
      return <User className={className} />;
    case "ShieldAlert":
      return <ShieldAlert className={className} />;
    case "CheckSquare":
      return <CheckSquare className={className} />;
    case "MessageSquare":
      return <MessageSquare className={className} />;
    case "Star":
      return <Star className={className} />;
    case "Calendar":
      return <Calendar className={className} />;
    case "FileText":
      return <FileText className={className} />;
    case "Flag":
      return <Flag className={className} />;
    default:
      return null;
  }
};

// Priority definition type
type Priority = "Low" | "Medium" | "High";

// Task interface
interface Task {
  id: string;
  title: string;
  tagIds: string[];
  student?: string;
  priority: Priority;
  dueTime?: string;
  date?: string;
  notes?: string;
  completed: boolean;
}

// Translations dictionary
const translations = {
  en: {
    langToggle: "PT",
    planDay: "Plan my day with AI",
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    greeting: "Good morning",
    subtitle: "Here's everything that needs your attention today. Bloom keeps the busywork out of your way.",
    finishSetupTitle: "Finish personalizing your Bloom 🌱",
    finishSetupSubtitle: "Complete a few details to get the most out of your schedule, finances, and insights.",
    continueSetup: "Continue setup",
    prioritiesTitle: "Today's Priorities",
    prioritiesSubtitle:
      "Everything Bloom believes you should accomplish today, based on your students, classes and business.",
    addTask: "Add Task",
    editTask: "Edit Task",
    save: "Save",
    cancel: "Cancel",
    completedOf: "completed",
    complete: "complete",
    allDone: "Everything is done for today. Great job! 🎉",
    noTasks: "No priorities set for today.",
    taskTitle: "Task Title",
    category: "Tag",
    relatedStudent: "Related Student/Lead (Optional)",
    priority: "Priority",
    dueTime: "Due Time (Optional, e.g. 14:30)",
    notes: "Notes (Optional)",
    placeholderTitle: "e.g., Prepare grammar worksheet",
    placeholderStudent: "e.g., Sophia Almeida",
    placeholderNotes: "Additional context...",
    classesToday: "Classes today",
    activeStudents: "Active students",
    newLeads: "New leads",
    thisMonth: "This month",
    nextAt: "Next at {time}",
    scheduleTitle: "Today's schedule",
    classesCount: "1 class today",
    classesCountPlural: "{count} classes today",
    noClassesToday: "No classes scheduled for today.",
    openCalendar: "Open calendar",
    aiTipTitle: "Bloom AI tip",
    aiTipContent:
      "Yuki's IELTS test is in 3 weeks. Want me to draft a focused writing plan for your 16:30 class?",
    aiTipAction: "Draft the plan",
    online: "Online",
    inPerson: "In person",
    classDuration: "60m",
    manageTags: "Manage Tags",
    tagsTitle: "Manage Tags",
    tagsSubtitle: "Create, edit, or delete tags for your tasks.",
    tagName: "Tag Name",
    tagColor: "Color",
    tagIcon: "Icon (Optional)",
    createTag: "Create Tag",
    editTag: "Edit Tag",
    deleteTagConfirm: "What would you like to do with the tasks currently using this tag?",
    optionRemoveTag: "Remove the tag from those tasks (become Uncategorized)",
    optionMoveTag: "Move tasks to another tag",
    confirmDelete: "Confirm Delete",
    noIcon: "None",
    tagPlaceholder: "e.g., Urgent",
  },
  pt: {
    langToggle: "EN",
    planDay: "Planejar meu dia com IA",
    greetingMorning: "Bom dia",
    greetingAfternoon: "Boa tarde",
    greetingEvening: "Boa noite",
    greeting: "Bom dia",
    subtitle:
      "Aqui está tudo o que precisa de você hoje. A Bloom mantém o trabalho chato longe de você.",
    finishSetupTitle: "Termine de personalizar sua Bloom 🌱",
    finishSetupSubtitle: "Complete algumas informações para aproveitar melhor sua agenda, finanças e recomendações.",
    continueSetup: "Continuar configuração",
    prioritiesTitle: "Prioridades de Hoje",
    prioritiesSubtitle:
      "Tudo o que a Bloom acredita que você deve realizar hoje, com base em seus alunos, turmas e negócios.",
    addTask: "Adicionar Tarefa",
    editTask: "Editar Tarefa",
    save: "Salvar",
    cancel: "Cancelar",
    completedOf: "concluídas",
    complete: "concluído",
    allDone: "Tudo pronto por hoje. Excelente trabalho! 🎉",
    noTasks: "Nenhuma prioridade definida para hoje.",
    taskTitle: "Título da Tarefa",
    category: "Marcador",
    relatedStudent: "Aluno/Lead Relacionado (Opcional)",
    priority: "Prioridade",
    dueTime: "Horário Limite (Opcional, ex: 14:30)",
    notes: "Anotações (Opcional)",
    placeholderTitle: "ex: Preparar folha de exercícios de gramática",
    placeholderStudent: "ex: Sophia Almeida",
    placeholderNotes: "Contexto adicional...",
    classesToday: "Aulas hoje",
    activeStudents: "Alunos ativos",
    newLeads: "Novos contatos",
    thisMonth: "Este mês",
    nextAt: "Próxima às {time}",
    scheduleTitle: "Agenda de hoje",
    classesCount: "1 aula hoje",
    classesCountPlural: "{count} aulas hoje",
    noClassesToday: "Nenhuma aula agendada para hoje.",
    openCalendar: "Abrir calendário",
    aiTipTitle: "Dica do Bloom AI",
    aiTipContent:
      "O teste de IELTS do Yuki é em 3 semanas. Quer que eu elabore um plano de redação focado para a sua aula das 16:30?",
    aiTipAction: "Rascunhar plano",
    online: "Online",
    inPerson: "Presencial",
    classDuration: "60m",
    manageTags: "Gerenciar Marcadores",
    tagsTitle: "Gerenciar Marcadores",
    tagsSubtitle: "Crie, edite ou exclua marcadores para suas tarefas.",
    tagName: "Nome do Marcador",
    tagColor: "Cor",
    tagIcon: "Ícone (Opcional)",
    createTag: "Criar Marcador",
    editTag: "Editar Marcador",
    deleteTagConfirm: "O que você gostaria de fazer com as tarefas que usam este marcador?",
    optionRemoveTag: "Remover o marcador dessas tarefas (ficar Sem Marcador)",
    optionMoveTag: "Mover tarefas para outro marcador",
    confirmDelete: "Confirmar Exclusão",
    noIcon: "Nenhum",
    tagPlaceholder: "ex: Urgente",
  },
};

// Priority badge colors helper
const getPriorityStyles = (priority: Priority) => {
  switch (priority) {
    case "High":
      return "bg-destructive/15 text-destructive border-destructive/20";
    case "Medium":
      return "bg-warning/15 text-warning-foreground border-warning/20";
    case "Low":
      return "bg-primary-soft text-primary border-primary/20";
  }
};

interface NotificationState {
  dueSoonSent: boolean;
  overdueSent: boolean;
  lastDeadline: string;
}

function checkAndNotify(task: Task, lang: "en" | "pt") {
  if (task.completed || !task.dueTime) return;

  const dateStr = task.date || formatDateString(new Date());
  const [hours, minutes] = task.dueTime.split(":").map(Number);
  const [year, month, day] = dateStr.split("-").map(Number);
  const deadlineDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const now = new Date();
  const diffMins = (deadlineDate.getTime() - now.getTime()) / (1000 * 60);
  const deadlineStr = `${dateStr} ${task.dueTime}`;

  const storedStr = localStorage.getItem("bloom.notified.deadlines") || "{}";
  let notified: Record<string, NotificationState> = {};
  try {
    notified = JSON.parse(storedStr);
  } catch (e) {
    console.error(e);
  }

  const state = notified[task.id] || { dueSoonSent: false, overdueSent: false, lastDeadline: "" };

  if (state.lastDeadline !== deadlineStr) {
    state.dueSoonSent = false;
    state.overdueSent = false;
    state.lastDeadline = deadlineStr;
  }

  let updated = false;

  // 1. Due soon warning (0 to 30 mins remaining)
  if (diffMins > 0 && diffMins <= 30) {
    if (!state.dueSoonSent) {
      const minsRounded = Math.max(1, Math.round(diffMins));
      const message =
        lang === "pt"
          ? `Sua tarefa "${task.title}" vence em ${minsRounded} minutos.`
          : `Your task "${task.title}" is due in ${minsRounded} minutes.`;

      toast.warning(message, {
        description: lang === "pt" ? "Tarefa Urgente" : "Urgent Task",
      });
      state.dueSoonSent = true;
      updated = true;
    }
  }

  // 2. Overdue warning (< 0 mins remaining)
  if (diffMins <= 0) {
    if (!state.overdueSent) {
      const message =
        lang === "pt"
          ? `Sua tarefa "${task.title}" está atrasada.`
          : `Your task "${task.title}" is overdue.`;

      toast.error(message, {
        description: lang === "pt" ? "Tarefa Atrasada" : "Overdue Task",
      });
      state.overdueSent = true;
      updated = true;
    }
  }

  if (updated) {
    notified[task.id] = state;
    localStorage.setItem("bloom.notified.deadlines", JSON.stringify(notified));
  }
}

function TodayPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { lang, formatStatus } = useLanguage();
  const [manualTasks, setManualTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_DASHBOARD_METRICS);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const todayEvents = metrics.todayEvents;

  // Dynamic tags hook
  const { tags, addTag, updateTag, deleteTag } = useTags(lang);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formTagId, setFormTagId] = useState<string>("");
  const [formStudent, setFormStudent] = useState("");
  const [formPriority, setFormPriority] = useState<Priority>("Medium");
  const [formDueTime, setFormDueTime] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Searchable Tags Dropdown State
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  // Timer Tick for Dynamic Deadlines Updates
  const [tick, setTick] = useState(0);

  // Manage Tags Modal State
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
  const [isTagEditModalOpen, setIsTagEditModalOpen] = useState(false);
  const [editingTagObj, setEditingTagObj] = useState<Tag | null>(null);

  // Tag Deletion State
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [deleteAction, setDeleteAction] = useState<"remove" | "move">("remove");
  const [moveTargetTagId, setMoveTargetTagId] = useState<string>("");

  // Tag Form State (Create / Edit)
  const [tagFormName, setTagFormName] = useState("");
  const [tagFormColor, setTagFormColor] = useState("green");
  const [tagFormIcon, setTagFormIcon] = useState("");

  const refreshEventsAndTasks = () => setRefreshKey((k) => k + 1);

  // Load real, teacher-scoped metrics from Supabase
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setMetrics(EMPTY_DASHBOARD_METRICS);
      setMetricsLoading(false);
      return;
    }
    setMetricsLoading(true);
    fetchDashboardMetrics(user.id)
      .then((res) => {
        if (!cancelled) setMetrics(res);
      })
      .catch((err) => console.error("[Today] Error loading metrics:", err))
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, refreshKey]);

  // Auto-refresh when the teacher returns to the dashboard after editing other modules
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // Load manual tasks from localStorage
  useEffect(() => {
    const savedTasks = localStorage.getItem("bloom.dashboard.tasks");
    if (savedTasks) {
      try {
        const parsed = JSON.parse(savedTasks);
        // Migrate tasks from category: string to tagIds: string[] & ensure date field exists
        const migrated = parsed.map((t: any) => {
          let updatedT = { ...t };
          if (t.category && !t.tagIds) {
            let mappedTagId = "";
            switch (t.category) {
              case "Lessons":
              case "Homework":
              case "Feedback":
                mappedTagId = "tag-lessons";
                break;
              case "Students":
                mappedTagId = "tag-students";
                break;
              case "Leads":
                mappedTagId = "tag-marketing";
                break;
              case "Contracts":
              case "Admin":
                mappedTagId = "tag-admin";
                break;
              case "Finance":
                mappedTagId = "tag-finance";
                break;
              case "Personal":
                mappedTagId = "tag-personal";
                break;
              default:
                mappedTagId = "tag-personal";
            }
            const { category, ...rest } = updatedT;
            updatedT = { ...rest, tagIds: [mappedTagId] };
          }
          if (!updatedT.date) {
            updatedT.date = formatDateString(new Date());
          }
          return updatedT;
        });
        setManualTasks(migrated);
        localStorage.setItem("bloom.dashboard.tasks", JSON.stringify(migrated));
      } catch (e) {
        console.error("Failed to parse tasks", e);
      }
    } else {
      // Default Initial Tasks (Manual only)
      const initialTasks = [
        {
          id: "m1",
          title: "Renew Emily's contract",
          tagIds: ["tag-admin"],
          student: "Emily Jones",
          priority: "High",
          date: formatDateString(new Date()),
          completed: false,
        },
        {
          id: "m2",
          title: "Follow up with new Instagram lead",
          tagIds: ["tag-marketing"],
          priority: "High",
          date: formatDateString(new Date()),
          completed: false,
        },
      ];
      setManualTasks(initialTasks as any);
      localStorage.setItem("bloom.dashboard.tasks", JSON.stringify(initialTasks));
    }

    refreshEventsAndTasks();

    // Listen to storage changes to keep synced if updated elsewhere
    const handleStorageChange = () => {
      refreshEventsAndTasks();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Timer interval for automatic deadline recalculations (every 30 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Save manual tasks helper
  const saveManualTasks = (newTasks: Task[]) => {
    setManualTasks(newTasks);
    localStorage.setItem("bloom.dashboard.tasks", JSON.stringify(newTasks));
  };

  // Toggle task complete status (with calendar timeline two-way sync)
  const handleToggle = (id: string) => {
    if (id.startsWith("timeline-")) {
      const parts = id.split("-");
      const taskType = parts[parts.length - 1];
      const eventId = parts.slice(1, parts.length - 1).join("-");

      const allEvents = getCalendarEvents();
      const updatedEvents = allEvents.map((evt) => {
        if (evt.id === eventId) {
          let nextStatus = evt.status;
          if (taskType === "prep") {
            nextStatus = "Lesson Ready";
          } else if (taskType === "hw") {
            nextStatus = "Homework Sent";
          } else if (taskType === "fb") {
            nextStatus = "Closed";
          }
          return { ...evt, status: nextStatus };
        }
        return evt;
      });

      saveCalendarEvents(updatedEvents);
      refreshEventsAndTasks();
    } else {
      const newTasks = manualTasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t,
      );
      saveManualTasks(newTasks);
    }
  };

  // Delete task
  const handleDelete = (id: string) => {
    if (id.startsWith("timeline-")) {
      const parts = id.split("-");
      const eventId = parts.slice(1, parts.length - 1).join("-");
      const allEvents = getCalendarEvents();
      const updatedEvents = allEvents.map((evt) => {
        if (evt.id === eventId) {
          return { ...evt, status: "Scheduled" as const }; // Revert to Scheduled
        }
        return evt;
      });
      saveCalendarEvents(updatedEvents);
      refreshEventsAndTasks();
    } else {
      const newTasks = manualTasks.filter((t) => t.id !== id);
      saveManualTasks(newTasks);
    }
  };

  // Reorder manual tasks
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newTasks = [...manualTasks];
    const temp = newTasks[index];
    newTasks[index] = newTasks[index - 1];
    newTasks[index - 1] = temp;
    saveManualTasks(newTasks);
  };

  const handleMoveDown = (index: number) => {
    if (index === manualTasks.length - 1) return;
    const newTasks = [...manualTasks];
    const temp = newTasks[index];
    newTasks[index] = newTasks[index + 1];
    newTasks[index + 1] = temp;
    saveManualTasks(newTasks);
  };

  // Open modal for add
  const handleOpenAddModal = () => {
    setEditingTask(null);
    setFormTitle("");
    setFormTagId(tags[0]?.id || "");
    setFormStudent("");
    setFormPriority("Medium");
    setFormDueTime("");
    setFormDate(formatDateString(new Date()));
    setFormNotes("");
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEditModal = (task: Task) => {
    if (task.id.startsWith("timeline-")) return; // Timeline tasks are edited in calendar

    setEditingTask(task);
    setFormTitle(task.title);
    setFormTagId(task.tagIds?.[0] || "");
    setFormStudent(task.student || "");
    setFormPriority(task.priority);
    setFormDueTime(task.dueTime || "");
    setFormDate(task.date || formatDateString(new Date()));
    setFormNotes(task.notes || "");
    setIsModalOpen(true);
  };

  // Submit Form (Add or Edit)
  const handleSubmitTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingTask) {
      // Edit
      const updatedTasks = manualTasks.map((t) =>
        t.id === editingTask.id
          ? {
            ...t,
            title: formTitle,
            tagIds: formTagId ? [formTagId] : [],
            student: formStudent.trim() || undefined,
            priority: formPriority,
            dueTime: formDueTime.trim() || undefined,
            date: formDate.trim() || formatDateString(new Date()),
            notes: formNotes.trim() || undefined,
          }
          : t,
      );
      saveManualTasks(updatedTasks);
    } else {
      // Add
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: formTitle,
        tagIds: formTagId ? [formTagId] : [],
        student: formStudent.trim() || undefined,
        priority: formPriority,
        dueTime: formDueTime.trim() || undefined,
        date: formDate.trim() || formatDateString(new Date()),
        notes: formNotes.trim() || undefined,
        completed: false,
      };
      saveManualTasks([...manualTasks, newTask]);
    }

    setIsModalOpen(false);
  };

  // Manage tags actions
  const handleOpenManageModal = () => {
    setIsManageTagsOpen(true);
  };

  const handleOpenCreateTagModal = () => {
    setEditingTagObj(null);
    setTagFormName("");
    setTagFormColor("green");
    setTagFormIcon("");
    setIsTagEditModalOpen(true);
  };

  const handleOpenEditTagModal = (tag: Tag) => {
    setEditingTagObj(tag);
    setTagFormName(tag.name);
    setTagFormColor(tag.color);
    setTagFormIcon(tag.icon || "");
    setIsTagEditModalOpen(true);
  };

  const handleSaveTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagFormName.trim()) return;

    if (editingTagObj) {
      updateTag(editingTagObj.id, {
        name: tagFormName.trim(),
        color: tagFormColor,
        icon: tagFormIcon || undefined,
      });
    } else {
      addTag({
        name: tagFormName.trim(),
        color: tagFormColor,
        icon: tagFormIcon || undefined,
      });
    }
    setIsTagEditModalOpen(false);
  };

  const handleDeleteTagStart = (tag: Tag) => {
    setDeletingTag(tag);
    setDeleteAction("remove");
    // Find first other tag to default as move target
    const firstOther = tags.find((t) => t.id !== tag.id);
    setMoveTargetTagId(firstOther?.id || "");
  };

  const handleDeleteTagConfirm = () => {
    if (!deletingTag) return;

    // Update tasks using this tag
    const updatedTasks = manualTasks.map((t) => {
      if (t.tagIds?.includes(deletingTag.id)) {
        if (deleteAction === "remove") {
          return { ...t, tagIds: t.tagIds.filter((id) => id !== deletingTag.id) };
        } else if (deleteAction === "move" && moveTargetTagId) {
          return {
            ...t,
            tagIds: [...t.tagIds.filter((id) => id !== deletingTag.id), moveTargetTagId],
          };
        }
      }
      return t;
    });

    saveManualTasks(updatedTasks);
    deleteTag(deletingTag.id);

    // Reset deleting state
    setDeletingTag(null);
  };

  // Dynamic Timeline tasks generation
  const allEvents = getCalendarEvents();
  const timelineTasks: Task[] = [];
  const todayStr = formatDateString(new Date());

  allEvents.forEach((evt) => {
    const isPast = evt.date < todayStr;

    if (evt.status === "Needs Preparation") {
      if (evt.date === todayStr || isPast) {
        timelineTasks.push({
          id: `timeline-${evt.id}-prep`,
          title:
            lang === "pt"
              ? `Preparar aula: ${evt.studentName}`
              : `Prepare lesson: ${evt.studentName}`,
          tagIds: ["tag-lessons"],
          student: evt.studentName,
          priority: "High",
          dueTime: evt.startTime,
          date: evt.date,
          completed: false,
        });
      }
    } else if (evt.status === "Homework Pending") {
      if (evt.date === todayStr || isPast) {
        timelineTasks.push({
          id: `timeline-${evt.id}-hw`,
          title:
            lang === "pt"
              ? `Enviar lição de casa: ${evt.studentName}`
              : `Send homework: ${evt.studentName}`,
          tagIds: ["tag-lessons"],
          student: evt.studentName,
          priority: "Medium",
          date: evt.date,
          completed: false,
        });
      }
    } else if (evt.status === "Feedback Pending") {
      if (evt.date === todayStr || isPast) {
        timelineTasks.push({
          id: `timeline-${evt.id}-fb`,
          title:
            lang === "pt"
              ? `Dar feedback da aula: ${evt.studentName}`
              : `Write lesson feedback: ${evt.studentName}`,
          tagIds: ["tag-lessons"],
          student: evt.studentName,
          priority: "Low",
          date: evt.date,
          completed: false,
        });
      }
    }
  });

  const filteredManualTasks = manualTasks.filter((t) => {
    if (!t.date) return true;
    return t.date === todayStr || (t.date < todayStr && !t.completed);
  });

  const tasks = [...filteredManualTasks, ...timelineTasks];

  // Monitor deadlines and trigger notifications
  useEffect(() => {
    tasks.forEach((task) => {
      checkAndNotify(task, lang);
    });
  }, [tasks, lang, tick]);

  // Computed values
  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;
  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const allCompleted = totalTasks > 0 && completedTasks === totalTasks;

  const t = translations[lang];

  const firstName = getTeacherFirstName(profile, user);
  const currentHour = new Date().getHours();
  let periodText = t.greetingMorning;
  if (currentHour >= 12 && currentHour < 18) {
    periodText = t.greetingAfternoon;
  } else if (currentHour >= 18 || currentHour < 5) {
    periodText = t.greetingEvening;
  }

  const greetingTitle = firstName ? `${periodText}, ${firstName}` : `${periodText}!`;

  const today = new Date().toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        eyebrow={today}
        title={greetingTitle}
        description={t.subtitle}
        actions={
          <button className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-warm px-4 text-sm font-semibold text-accent-foreground shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 cursor-pointer">
            <Sparkles className="h-4 w-4" /> {t.planDay}
          </button>
        }
      />

      {/* Skipped Onboarding Completion Card */}
      {(!profile?.onboarding_completed || profile?.onboarding_status === "skipped") && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 shadow-inner">
              <Sparkles className="h-5 w-5 text-amber-800" />
            </div>
            <div className="space-y-1">
              <h4 className="font-outfit font-extrabold text-base text-stone-900">
                {t.finishSetupTitle}
              </h4>
              <p className="text-xs text-stone-600 font-medium leading-relaxed">
                {t.finishSetupSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/onboarding" })}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-[#163020] text-[#F4EBE1] hover:bg-emerald-950 font-bold text-xs shadow-sm transition-all cursor-pointer"
          >
            {t.continueSetup}
          </button>
        </div>
      )}

      {/* SINGLE URGENT SECTION */}
      {user?.id && <UrgentWidget teacherId={user.id} />}

      {/* DAILY PRIORITIES SECTION */}
      {user?.id && <DailyPrioritiesCard teacherId={user.id} />}

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t.classesToday}
          value={metricsLoading ? "—" : String(todayEvents.length)}
          icon={CalendarClock}
          tone="primary"
          hint={
            todayEvents.length > 0
              ? t.nextAt.replace("{time}", todayEvents[0].startTime)
              : undefined
          }
        />
        <StatCard
          label={t.activeStudents}
          value={metricsLoading ? "—" : String(metrics.activeStudents)}
          icon={Users}
          tone="lilac"
          trend={metrics.activeStudentsTrend ?? undefined}
        />
        <StatCard
          label={t.newLeads}
          value={metricsLoading ? "—" : String(metrics.newLeads)}
          icon={UserPlus}
          tone="accent"
          trend={metrics.newLeadsTrend ?? undefined}
        />
        <StatCard
          label={t.thisMonth}
          value={
            metricsLoading || !metrics.hasRevenueSource
              ? "—"
              : formatCentsToBRL(metrics.monthRevenueCents)
          }
          icon={Wallet}
          tone="warning"
          trend={metrics.monthRevenueTrend ?? undefined}
        />
      </div>

      {/* SCHEDULE & AI TIPS */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <PanelCard
          title={t.scheduleTitle}
          description={
            todayEvents.length === 1
              ? t.classesCount.replace("{count}", "1")
              : t.classesCountPlural.replace("{count}", String(todayEvents.length))
          }
          icon={<CalendarClock className="h-4 w-4" />}
          action={{ label: t.openCalendar, to: "/calendar" }}
          contentClassName="p-0"
        >
          <ul className="divide-y divide-border/70">
            {todayEvents.length === 0 ? (
              <li className="p-5 text-center text-xs text-muted-foreground">
                {t.noClassesToday}
              </li>
            ) : (
              todayEvents.map((c) => (
                <li key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex w-14 shrink-0 flex-col">
                    <span className="font-display text-sm font-bold text-foreground">
                      {c.startTime}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {c.duration}m
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.studentName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.level} · {c.focus} ({formatStatus(c.status)})
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                    {c.deliveryMode === "Online" && <Video className="h-3 w-3" />}
                    {formatStatus(c.deliveryMode)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </PanelCard>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-gradient-lilac p-5 text-lilac-foreground shadow-[var(--shadow-md)]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                {t.aiTipTitle}
              </p>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug">{t.aiTipContent}</p>
            <button className="mt-3 inline-flex items-center gap-1 rounded-lg bg-lilac-foreground/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors hover:bg-lilac-foreground/25 cursor-pointer">
              {t.aiTipAction} <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ADD/EDIT TASK MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {editingTask ? t.editTask : t.addTask}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmitTask} className="space-y-4">
            {/* Task Title */}
            <div className="space-y-1">
              <Label htmlFor="task-title" className="text-xs font-semibold text-foreground">
                {t.taskTitle}
              </Label>
              <Input
                id="task-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={t.placeholderTitle}
                required
                className="h-10 rounded-xl"
              />
            </div>

            {/* Tag & Priority Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 relative">
                <Label className="text-xs font-semibold text-foreground">{t.category}</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer text-left"
                  >
                    {formTagId ? (
                      (() => {
                        const selectedTag = tags.find((tag) => tag.id === formTagId);
                        if (!selectedTag)
                          return (
                            <span className="text-muted-foreground">
                              {lang === "pt" ? "Selecionar marcador..." : "Select tag..."}
                            </span>
                          );
                        const colorStyles = getTagColorStyles(selectedTag.color);
                        return (
                          <span className="flex items-center gap-1.5 truncate">
                            {selectedTag.icon ? (
                              <CategoryIcon
                                name={selectedTag.icon}
                                className="h-3.5 w-3.5 shrink-0"
                              />
                            ) : (
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${colorStyles.dotClass}`}
                              />
                            )}
                            <span className="truncate">{selectedTag.name}</span>
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-muted-foreground">
                        {lang === "pt" ? "Selecionar marcador..." : "Select tag..."}
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
                  </button>

                  {isTagDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsTagDropdownOpen(false)}
                      />
                      <div className="absolute left-0 right-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in duration-100 min-w-[200px]">
                        {/* Search input */}
                        <div className="flex items-center border-b border-border/60 px-2.5 py-1.5">
                          <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-2" />
                          <input
                            type="text"
                            placeholder={lang === "pt" ? "Buscar..." : "Search..."}
                            value={tagSearchQuery}
                            onChange={(e) => setTagSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                          />
                        </div>

                        {/* Options list */}
                        <div className="py-1">
                          {tags
                            .filter((tag) =>
                              tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase()),
                            )
                            .map((tag) => {
                              const colorStyles = getTagColorStyles(tag.color);
                              return (
                                <button
                                  key={tag.id}
                                  type="button"
                                  onClick={() => {
                                    setFormTagId(tag.id);
                                    setIsTagDropdownOpen(false);
                                    setTagSearchQuery("");
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-secondary transition-colors text-left cursor-pointer"
                                >
                                  {tag.icon ? (
                                    <CategoryIcon
                                      name={tag.icon}
                                      className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                                    />
                                  ) : (
                                    <span
                                      className={`h-2 w-2 rounded-full shrink-0 ${colorStyles.dotClass}`}
                                    />
                                  )}
                                  <span className="truncate">{tag.name}</span>
                                  {formTagId === tag.id && (
                                    <Check className="ml-auto h-4 w-4 text-primary shrink-0" />
                                  )}
                                </button>
                              );
                            })}

                          {tags.filter((tag) =>
                            tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase()),
                          ).length === 0 && (
                              <p className="px-2.5 py-2 text-xs text-muted-foreground text-center">
                                {lang === "pt" ? "Nenhum resultado" : "No results"}
                              </p>
                            )}
                        </div>

                        {/* Actions at the bottom */}
                        <div className="border-t border-border/60 p-1 flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsTagDropdownOpen(false);
                              handleOpenManageModal();
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary transition-colors text-left cursor-pointer"
                          >
                            <Settings className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {t.manageTags}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsTagDropdownOpen(false);
                              handleOpenCreateTagModal();
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-primary hover:bg-primary-soft transition-colors text-left cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                            {lang === "pt" ? "Criar Marcador" : "Create Tag"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="task-priority" className="text-xs font-semibold text-foreground">
                  {t.priority}
                </Label>
                <Select
                  value={formPriority}
                  onValueChange={(val) => setFormPriority(val as Priority)}
                >
                  <SelectTrigger id="task-priority" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Student Field */}
            <div className="space-y-1">
              <Label htmlFor="task-student" className="text-xs font-semibold text-foreground">
                {t.relatedStudent}
              </Label>
              <Input
                id="task-student"
                value={formStudent}
                onChange={(e) => setFormStudent(e.target.value)}
                placeholder={t.placeholderStudent}
                className="h-10 rounded-xl"
              />
            </div>

            {/* Date & Time Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="task-date" className="text-xs font-semibold text-foreground">
                  {lang === "pt" ? "Data de Vencimento" : "Due Date"}
                </Label>
                <Input
                  id="task-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="task-due-time" className="text-xs font-semibold text-foreground">
                  {t.dueTime}
                </Label>
                <Input
                  id="task-due-time"
                  value={formDueTime}
                  onChange={(e) => setFormDueTime(e.target.value)}
                  placeholder="e.g. 14:30"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="task-notes" className="text-xs font-semibold text-foreground">
                {t.notes}
              </Label>
              <Textarea
                id="task-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={t.placeholderNotes}
                className="min-h-[70px] rounded-xl resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                >
                  {t.cancel}
                </button>
              </DialogClose>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
              >
                {t.save}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MANAGE TAGS DIALOG */}
      <Dialog open={isManageTagsOpen} onOpenChange={setIsManageTagsOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {t.tagsTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">Manage category tags</DialogDescription>
          </DialogHeader>

          {deletingTag ? (
            /* Safe Deletion Workflow Confirmation State */
            <div className="space-y-5 py-2 animate-in fade-in zoom-in-95 duration-150">
              <p className="text-sm font-medium text-foreground">{t.deleteTagConfirm}</p>
              <div className="space-y-3 rounded-xl border border-border/80 p-4 bg-muted/20">
                <label className="flex items-center gap-3 cursor-pointer text-sm font-medium text-foreground">
                  <input
                    type="radio"
                    name="delete-action"
                    value="remove"
                    checked={deleteAction === "remove"}
                    onChange={() => setDeleteAction("remove")}
                    className="accent-primary h-4 w-4"
                  />
                  <span>{t.optionRemoveTag}</span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer text-sm font-medium text-foreground">
                    <input
                      type="radio"
                      name="delete-action"
                      value="move"
                      checked={deleteAction === "move"}
                      onChange={() => setDeleteAction("move")}
                      disabled={tags.length <= 1}
                      className="accent-primary h-4 w-4"
                    />
                    <span>{t.optionMoveTag}</span>
                  </label>
                  {deleteAction === "move" && tags.length > 1 && (
                    <Select value={moveTargetTagId} onValueChange={setMoveTargetTagId}>
                      <SelectTrigger className="h-9 rounded-xl text-xs bg-card mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tags
                          .filter((tag) => tag.id !== deletingTag.id)
                          .map((tag) => (
                            <SelectItem key={tag.id} value={tag.id} className="text-xs">
                              {tag.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingTag(null)}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTagConfirm}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-destructive px-4 text-xs font-semibold text-destructive-foreground transition-all hover:bg-destructive/90 cursor-pointer"
                >
                  {t.confirmDelete}
                </button>
              </div>
            </div>
          ) : (
            /* Regular Tag List state */
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{t.tagsSubtitle}</p>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {tags.map((tag) => {
                  const colorStyles = getTagColorStyles(tag.color);
                  return (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 p-2.5 bg-card hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {tag.icon ? (
                          <CategoryIcon
                            name={tag.icon}
                            className="h-4 w-4 text-muted-foreground shrink-0"
                          />
                        ) : (
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${colorStyles.dotClass}`}
                          />
                        )}
                        <span className="text-sm font-semibold text-foreground">{tag.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditTagModal(tag)}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                          title={t.editTag}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTagStart(tag)}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-2">
                <DialogClose asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                  >
                    {lang === "pt" ? "Fechar" : "Close"}
                  </button>
                </DialogClose>
                <button
                  type="button"
                  onClick={handleOpenCreateTagModal}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                >
                  <Plus className="h-4 w-4 mr-1 shrink-0" />
                  {t.createTag}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CREATE/EDIT TAG DIALOG */}
      <Dialog open={isTagEditModalOpen} onOpenChange={setIsTagEditModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {editingTagObj ? t.editTag : t.createTag}
            </DialogTitle>
            <DialogDescription className="sr-only">Create or edit a tag</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTag} className="space-y-4">
            {/* Tag Name */}
            <div className="space-y-1">
              <Label htmlFor="tag-name" className="text-xs font-semibold text-foreground">
                {t.tagName}
              </Label>
              <Input
                id="tag-name"
                value={tagFormName}
                onChange={(e) => setTagFormName(e.target.value)}
                placeholder={t.tagPlaceholder}
                required
                className="h-10 rounded-xl"
              />
            </div>

            {/* Tag Color Predefined Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">{t.tagColor}</Label>
              <div className="flex flex-wrap gap-2.5 p-2.5 rounded-xl border border-border/80 bg-muted/20 justify-center sm:justify-start">
                {BRAND_COLORS.map((color) => {
                  const isSelected = tagFormColor === color.id;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setTagFormColor(color.id)}
                      className={`h-7 w-7 rounded-full transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${color.dotClass}`}
                      title={lang === "pt" ? color.namePt : color.name}
                    >
                      {isSelected && <Check className="h-4 w-4 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tag Icon Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">{t.tagIcon}</Label>
              <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl border border-border/80 bg-muted/20">
                <button
                  type="button"
                  onClick={() => setTagFormIcon("")}
                  className={`flex h-9 items-center justify-center rounded-lg border text-xs font-medium transition-all cursor-pointer ${tagFormIcon === ""
                      ? "border-primary bg-primary-soft text-primary font-bold shadow-sm"
                      : "border-border bg-card hover:bg-secondary text-muted-foreground"
                    }`}
                >
                  {t.noIcon}
                </button>
                {TAG_ICONS.map((iconOpt) => {
                  const isSelected = tagFormIcon === iconOpt.id;
                  return (
                    <button
                      key={iconOpt.id}
                      type="button"
                      onClick={() => setTagFormIcon(iconOpt.id)}
                      className={`flex h-9 items-center justify-center rounded-lg border transition-all cursor-pointer ${isSelected
                          ? "border-primary bg-primary-soft text-primary shadow-sm"
                          : "border-border bg-card hover:bg-secondary text-muted-foreground"
                        }`}
                      title={iconOpt.label}
                    >
                      <CategoryIcon name={iconOpt.id} className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsTagEditModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
              >
                {t.save}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
