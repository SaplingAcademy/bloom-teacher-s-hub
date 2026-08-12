import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { t as i18nT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import {
  saveStudentEnrollmentAgreement,
  calculateLastDueDate,
  calculateInstallmentSchedule,
  getStudentFinancialSummary,
  getStudentPackageHistory,
  getStudentPaymentHistory,
  getStudentFinancialTimeline,
  checkPackageExpirationAlerts,
  markInvoiceAsPaid,
  updateInvoiceStatus,
  formatCentsToBRL,
  StudentFinancialSummary,
  PackageRenewalAlert,
  PackageAgreementRecord,
  PaymentHistoryItem,
  FinancialTimelineEvent,
} from "@/lib/finance-engine";
import { PackageRenewalModal } from "@/components/bloom/PackageRenewalModal";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Users,
  Search,
  Plus,
  ChevronLeft,
  Phone,
  Mail,
  Calendar,
  Clock,
  BookOpen,
  CheckSquare,
  FileText,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Settings,
  Trash2,
  FileCode,
  Tag,
  AlertCircle,
  User,
  UserX,
  Sparkles,
  Receipt,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_app/students")({
  head: () => ({
    meta: [
      { title: "Students · Bloom" },
      {
        name: "description",
        content: "Manage your students, progress and class history in one place.",
      },
    ],
  }),
  component: StudentsPage,
});

import {
  CEFRLevel,
  CourseFocus,
  StudentStatus,
  StudentType,
  ScheduleDetails,
  CalendarEvent,
  getCalendarEvents,
  saveCalendarEvents,
  syncStudentScheduleWithEvents,
  deleteStudentEvents,
  syncStudentSchedulesToSupabaseEvents,
} from "@/lib/calendar-sync";
import { StudentLessonPlanTable } from "@/components/bloom/StudentLessonPlanTable";
import {
  StudentLesson,
  fetchStudentLessons,
  ensureStudentLessonPlanInitialized,
} from "@/lib/lesson-plan-sync";

import {
  AddTypeSelectionModal,
  ClassFormModal,
  ClassSessionAttendanceModal,
  ClassCard,
  ClassDetailsView,
  RegisterClassLessonModal,
} from "@/components/bloom/ClassManagementComponents";
import {
  ClassWithDetails,
  fetchTeacherClasses,
  fetchActiveClassMemberStudentIds,
} from "@/lib/class-sync";
import { InactivateStudentModal } from "@/components/bloom/InactivateStudentModal";

export interface ScheduleInput {
  id?: string;
  weekday: string;
  startTime: string;
  duration: number;
  deliveryMode: "Online" | "In person";
  locationLink: string;
}

import { ColorSelector } from "@/components/bloom/ColorSelector";
import { getBrandColorMeta } from "@/lib/brand-colors";

interface Student {
  id: string;
  name: string;
  whatsapp: string;
  email?: string;
  level: CEFRLevel;
  focus: string;
  type: StudentType;
  status: StudentStatus;
  schedule: string; // e.g. "Tue • 7:00 PM"
  groupSize?: number; // only if type === "Group"
  packageId?: string; // linked package
  createdAt: string;
  lastActive: string;
  notes?: string;
  color_key?: string;
  scheduleDetails?: ScheduleDetails;
  schedules?: ScheduleInput[];
  linkedGroupId?: string;
  lessonsRemaining?: number;
  lessonsDelivered?: number;
  inactivationDate?: string;
  inactivationReason?: string;
}

interface Package {
  id: string;
  name: string;
  price: number;
  frequency: string;
  duration: number;
  lessons: number;
  method: string;
}

interface Transaction {
  id: string;
  studentId: string;
  studentName: string;
  packageName: string;
  amount: number;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue";
}

// Translations
const translations = {
  en: {
    langToggle: "PT",
    title: "Students & Groups",
    description: "Manage your student profiles, class groups, levels and schedules.",
    addStudent: "Add Student",
    searchPlaceholder: "Search students or groups...",
    filterLevel: "All Levels",
    filterFocus: "All Languages",
    filterStatus: "All Statuses",
    sortLabel: "Sort by",
    sortByActive: "Recently Active",
    sortByAlpha: "Alphabetical",
    sortByCreated: "Recently Created",
    studentCardClasses: "Classes:",
    active: "Active",
    paused: "Paused",
    trial: "Trial",
    lead: "Lead",
    groupBadge: "group",
    studentsCount: "students",
    emptyList: "No students or groups found matching the filters.",
    backToGrid: "Back to list",
    tabOverview: "Overview",
    tabLessons: "Lessons",
    tabAttendance: "Attendance",
    tabHomework: "Homework",
    tabNotes: "Notes",
    tabResources: "Resources",
    tabFinance: "Finance",
    tabMessages: "Messages",
    tabTimeline: "Timeline",
    tabProgress: "Progress",
    tabContracts: "Contracts",
    tabSettings: "Settings",
    hubTitle: "Student Hub",
    deleteStudent: "Delete Student",
    confirmDelete: "Are you sure you want to delete this student?",
    // Modal fields
    modalTitle: "Create Student Profile",
    fieldName: "Full Name or Group Title",
    fieldWhatsApp: "WhatsApp Number",
    fieldEmail: "Email (Optional)",
    fieldLevel: "CEFR Level",
    fieldFocus: "Language Studied",
    fieldType: "Student Type",
    fieldStatus: "Initial Status",
    fieldSchedule: "Weekly Schedule (e.g. Wed • 14:00)",
    fieldGroupSize: "Group Size (if Group)",
    fieldPackage: "Assigned Finance Package",
    btnCreate: "Create Student",
    btnSave: "Save Changes",
    btnCancel: "Cancel",
    placeholderName: "e.g., John Smith or Group B1",
    placeholderWhatsApp: "e.g., +55 11 99999-9999",
    placeholderSchedule: "e.g., Mon • 10:00 AM",
    // Student Hub Finance Tab
    financeCurrentPkg: "Current Active Package",
    financeNoPkg: "No active package assigned.",
    financeHistory: "Payment Ledger",
    financeUpcoming: "Upcoming / Due payments",
    financeOutstanding: "Outstanding Balance",
    financePriceCycle: "cycle",
    financePaid: "Paid",
    financePending: "Pending",
    financeOverdue: "Overdue",
    lessonsCount: "lessons",
    durationMonths: "months",
    markInactive: "Mark as inactive",
    reactivateStudent: "Reactivate student",
    detailsTitle: "Student Details",
    privateNotesTitle: "Private Student Notes",
  },
  pt: {
    langToggle: "EN",
    title: "Alunos & Grupos",
    description: "Gerencie perfis de alunos, grupos de conversação, níveis e agendas.",
    addStudent: "Adicionar Aluno",
    searchPlaceholder: "Buscar alunos ou grupos...",
    filterLevel: "Todos os Níveis",
    filterFocus: "Todos os Idiomas",
    filterStatus: "Todos os Status",
    sortLabel: "Ordenar por",
    sortByActive: "Ativos Recentemente",
    sortByAlpha: "Alfabética",
    sortByCreated: "Criados Recentemente",
    studentCardClasses: "Aulas:",
    active: "Ativo",
    paused: "Pausado",
    trial: "Experimental",
    lead: "Contato",
    groupBadge: "grupo",
    studentsCount: "alunos",
    emptyList: "Nenhum aluno ou grupo encontrado com estes filtros.",
    backToGrid: "Voltar para lista",
    tabOverview: "Visão Geral",
    tabLessons: "Aulas",
    tabAttendance: "Presença",
    tabHomework: "Tarefas",
    tabNotes: "Notas",
    tabResources: "Materiais",
    tabFinance: "Financeiro",
    tabMessages: "Mensagens",
    tabTimeline: "Histórico",
    tabProgress: "Progresso",
    tabContracts: "Contratos",
    tabSettings: "Configurações",
    hubTitle: "Painel do Aluno",
    deleteStudent: "Excluir Aluno",
    confirmDelete: "Tem certeza que deseja excluir este aluno?",
    // Modal fields
    modalTitle: "Criar Perfil de Aluno",
    fieldName: "Nome Completo ou Nome do Grupo",
    fieldWhatsApp: "WhatsApp",
    fieldEmail: "E-mail (Opcional)",
    fieldLevel: "Nível CEFR",
    fieldFocus: "Idioma Estudado",
    fieldType: "Tipo de Aluno",
    fieldStatus: "Status Inicial",
    fieldSchedule: "Horário Semanal (ex: Qua • 14:00)",
    fieldGroupSize: "Tamanho do Grupo (se Grupo)",
    fieldPackage: "Plano Financeiro Vinculado",
    btnCreate: "Criar Aluno",
    btnSave: "Salvar Alterações",
    btnCancel: "Cancelar",
    placeholderName: "ex: John Smith ou Grupo B1",
    placeholderWhatsApp: "ex: +55 11 99999-9999",
    placeholderSchedule: "ex: Seg • 10:00",
    // Student Hub Finance Tab
    financeCurrentPkg: "Plano Ativo Atual",
    financeNoPkg: "Nenhum plano financeiro vinculado.",
    financeHistory: "Histórico de Faturas",
    financeUpcoming: "Faturas Pendentes / Atrasadas",
    financeOutstanding: "Saldo Devedor total",
    financePriceCycle: "ciclo",
    financePaid: "Pago",
    financePending: "Pendente",
    financeOverdue: "Atrasado",
    lessonsCount: "aulas",
    durationMonths: "meses",
    markInactive: "Marcar como inativo",
    reactivateStudent: "Reativar aluno",
    detailsTitle: "Detalhes do Aluno",
    privateNotesTitle: "Notas Privadas do Aluno",
  },
};

// Default Mock Data
const defaultStudents: Student[] = [
  {
    id: "s1",
    name: "Lucas Meyer",
    whatsapp: "+55 11 98888-7777",
    email: "lucas.meyer@business.com",
    level: "C1",
    focus: "Business English",
    type: "Private",
    status: "Active",
    schedule: "Tue • 7:00 PM",
    packageId: "p1", // Premium Business
    createdAt: "2026-06-01T10:00:00Z",
    lastActive: "2026-07-12T18:00:00Z",
    lessonsRemaining: 4,
    lessonsDelivered: 8,
    scheduleDetails: {
      day: "Tuesday",
      startTime: "19:00",
      duration: 60,
      frequency: "Weekly",
      startDate: "2026-06-01",
      timezone: "America/Sao_Paulo",
      deliveryMode: "In person",
      locationLink: "Room 102 - Downtown Hub",
    },
  },
  {
    id: "s2",
    name: "Sofia Almeida",
    whatsapp: "+55 21 97777-6666",
    email: "sofia.almeida@gmail.com",
    level: "B2",
    focus: "Business English",
    type: "Private",
    status: "Active",
    schedule: "Mon • 9:00 AM",
    packageId: "p1", // Premium Business
    createdAt: "2026-05-15T09:00:00Z",
    lastActive: "2026-07-13T09:00:00Z",
    lessonsRemaining: 3,
    lessonsDelivered: 12,
    scheduleDetails: {
      day: "Monday",
      startTime: "09:00",
      duration: 60,
      frequency: "Weekly",
      startDate: "2026-05-15",
      timezone: "America/Sao_Paulo",
      deliveryMode: "Online",
      locationLink: "https://zoom.us/j/sofiaalmeida",
    },
  },
  {
    id: "s3",
    name: "Yuki Tanaka",
    whatsapp: "+81 90 1234-5678",
    email: "yuki.tanaka@yahoo.co.jp",
    level: "C1",
    focus: "IELTS",
    type: "Private",
    status: "Active",
    schedule: "Thu • 4:30 PM",
    packageId: "p1", // Premium Business
    createdAt: "2026-06-10T14:00:00Z",
    lastActive: "2026-07-12T16:30:00Z",
    lessonsRemaining: 2,
    lessonsDelivered: 5,
    scheduleDetails: {
      day: "Thursday",
      startTime: "16:30",
      duration: 60,
      frequency: "Weekly",
      startDate: "2026-06-10",
      timezone: "America/Sao_Paulo",
      deliveryMode: "Online",
      locationLink: "https://zoom.us/j/yukitanaka",
    },
  },
  {
    id: "s4",
    name: "Emily Jones",
    whatsapp: "+44 7911 123456",
    email: "emily.jones@outlook.com",
    level: "A2",
    focus: "General English",
    type: "Private",
    status: "Trial",
    schedule: "Wed • 3:00 PM",
    packageId: "p2", // General VIP
    createdAt: "2026-07-10T11:00:00Z",
    lastActive: "2026-07-11T12:00:00Z",
    lessonsRemaining: 1,
    lessonsDelivered: 1,
    scheduleDetails: {
      day: "Wednesday",
      startTime: "15:00",
      duration: 60,
      frequency: "Weekly",
      startDate: "2026-07-10",
      timezone: "America/Sao_Paulo",
      deliveryMode: "Online",
      locationLink: "https://zoom.us/j/emilyjones",
    },
  },
  {
    id: "s5",
    name: "Tuesday A2 Group",
    whatsapp: "+55 11 90000-0000",
    level: "A2",
    focus: "General English",
    type: "Group",
    status: "Active",
    schedule: "Tuesday • 6:30 PM",
    packageId: "p3", // Conversation Group
    createdAt: "2026-04-10T18:00:00Z",
    lastActive: "2026-07-13T19:30:00Z",
    lessonsRemaining: 4,
    lessonsDelivered: 20,
    scheduleDetails: {
      day: "Tuesday",
      startTime: "18:30",
      duration: 60,
      frequency: "Weekly",
      startDate: "2026-04-10",
      timezone: "America/Sao_Paulo",
      deliveryMode: "Online",
      locationLink: "https://zoom.us/j/tuesdaya2",
    },
  },
  {
    id: "s6",
    name: "Business English Advanced",
    whatsapp: "+55 11 91111-1111",
    level: "C2",
    focus: "Business English",
    type: "Group",
    status: "Paused",
    schedule: "Thursday • 8:00 PM",
    packageId: "p1", // Premium Business
    createdAt: "2026-03-01T20:00:00Z",
    lastActive: "2026-06-25T21:00:00Z",
    lessonsRemaining: 4,
    lessonsDelivered: 15,
    scheduleDetails: {
      day: "Thursday",
      startTime: "20:00",
      duration: 60,
      frequency: "Weekly",
      startDate: "2026-03-01",
      timezone: "America/Sao_Paulo",
      deliveryMode: "Online",
      locationLink: "https://zoom.us/j/beadvanced",
    },
  },
];

// Helper styles for status badges
const getStatusStyles = (status: StudentStatus) => {
  switch (status) {
    case "Active":
      return "bg-success/15 text-success border-success/20";
    case "Paused":
      return "bg-warning/15 text-warning-foreground border-warning/20";
    case "Trial":
      return "bg-accent-soft text-accent border-accent/20";
    case "Lead":
      return "bg-muted text-muted-foreground border-border";
  }
};

const getTxStatusStyles = (status: string) => {
  switch (status) {
    case "Paid":
      return "bg-success/15 text-success border-success/20";
    case "Pending":
      return "bg-warning/15 text-warning-foreground border-warning/20";
    case "Overdue":
      return "bg-destructive/15 text-destructive border-destructive/20";
    default:
      return "";
  }
};

function StudentsPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { languages: teacherLanguages, hasConfiguredLanguages, formatLanguageLabel } = useTeacherLanguages();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Loaded packages and ledger from localStorage
  const [packages, setPackages] = useState<Package[]>([]);
  const [ledger, setLedger] = useState<Transaction[]>([]);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [selectedFocus, setSelectedFocus] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("active");

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudentIdForModal, setEditingStudentIdForModal] = useState<string | null>(null);
  const [showZeroStudentsWelcome, setShowZeroStudentsWelcome] = useState(false);
  // Inactive Student Modal State
  const [isInactivateModalOpen, setIsInactivateModalOpen] = useState(false);
  const [studentToInactivate, setStudentToInactivate] = useState<Student | null>(null);

  // Classes & Groups States
  const [activeViewTab, setActiveViewTab] = useState<"all_students" | "individual_students" | "classes" | "inactive">("all_students");
  const [activeMemberStudentIds, setActiveMemberStudentIds] = useState<Set<string>>(new Set());
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [previousClassId, setPreviousClassId] = useState<string | null>(null);
  const [isAddSelectionOpen, setIsAddSelectionOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classModalType, setClassModalType] = useState<"pair" | "group">("group");
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceClass, setAttendanceClass] = useState<ClassWithDetails | null>(null);
  const [classesList, setClassesList] = useState<ClassWithDetails[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formWhatsApp, setFormWhatsApp] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formLevel, setFormLevel] = useState<CEFRLevel>("B1");
  const [formFocus, setFormFocus] = useState<string>("English");
  const [formType, setFormType] = useState<StudentType>("Private");
  const [formStatus, setFormStatus] = useState<StudentStatus>("Active");
  const [formSchedule, setFormSchedule] = useState("");
  const [formGroupSize, setFormGroupSize] = useState<number>(3);
  const [formPackageId, setFormPackageId] = useState<string>("");
  const [formNotes, setFormNotes] = useState("");
  const [formColorKey, setFormColorKey] = useState<string>("default");

  // Enrollment Agreement Form States
  const [formInstallmentCount, setFormInstallmentCount] = useState<number>(6);
  const [formFirstDueDate, setFormFirstDueDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>("Pix");
  const [formDueDay, setFormDueDay] = useState<number>(5);

  // Edit Student Form State
  const [editColorKey, setEditColorKey] = useState<string>("default");

  // Schedule Fields States
  const [formClassFrequency, setFormClassFrequency] = useState<number>(1);
  const [formSchedulesList, setFormSchedulesList] = useState<ScheduleInput[]>([
    { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online", locationLink: "" }
  ]);
  const [editClassFrequency, setEditClassFrequency] = useState<number>(1);
  const [editSchedulesList, setEditSchedulesList] = useState<ScheduleInput[]>([
    { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online", locationLink: "" }
  ]);

  const handleFormFrequencyChange = (freq: number) => {
    setFormClassFrequency(freq);
    setFormSchedulesList((prev) => {
      const newList = [...prev];
      if (newList.length < freq) {
        for (let i = newList.length; i < freq; i++) {
          newList.push({
            weekday: "Monday",
            startTime: "09:00",
            duration: 60,
            deliveryMode: "Online",
            locationLink: "",
          });
        }
      } else if (newList.length > freq) {
        newList.splice(freq);
      }
      return newList;
    });
  };

  const handleEditFrequencyChange = (freq: number) => {
    setEditClassFrequency(freq);
    setEditSchedulesList((prev) => {
      const newList = [...prev];
      if (newList.length < freq) {
        for (let i = newList.length; i < freq; i++) {
          newList.push({
            weekday: "Monday",
            startTime: "09:00",
            duration: 60,
            deliveryMode: "Online",
            locationLink: "",
          });
        }
      } else if (newList.length > freq) {
        newList.splice(freq);
      }
      return newList;
    });
  };

  const [formClassDay, setFormClassDay] = useState("Monday");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formDuration, setFormDuration] = useState(60);
  const [formFrequency, setFormFrequency] = useState<"Weekly" | "Bi-weekly" | "Monthly">("Weekly");
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formEndDate, setFormEndDate] = useState("");
  const [formTimezone, setFormTimezone] = useState("America/Sao_Paulo");
  const [formDeliveryMode, setFormDeliveryMode] = useState<"Online" | "In person">("Online");
  const [formLocationLink, setFormLocationLink] = useState("");
  const [formLinkedGroupId, setFormLinkedGroupId] = useState("");

  // Edit Student Form State (for Settings tab in Student Hub)
  const [editName, setEditName] = useState("");
  const [editWhatsApp, setEditWhatsApp] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editLevel, setEditLevel] = useState<CEFRLevel>("B2");
  const [editFocus, setEditFocus] = useState<string>("English");
  const [editType, setEditType] = useState<StudentType>("Private");
  const [editStatus, setEditStatus] = useState<StudentStatus>("Active");
  const [editPackageId, setEditPackageId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editClassDay, setEditClassDay] = useState("Monday");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editDuration, setEditDuration] = useState(60);
  const [editFrequency, setEditFrequency] = useState<"Weekly" | "Bi-weekly" | "Monthly">("Weekly");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/Sao_Paulo");
  const [editDeliveryMode, setEditDeliveryMode] = useState<"Online" | "In person">("Online");
  const [editLocationLink, setEditLocationLink] = useState("");
  const [editLinkedGroupId, setEditLinkedGroupId] = useState("");

  // Hub Active Tab State & Financial Engine States
  const [hubTab, setHubTab] = useState<string>("Overview");
  const [currentStudentLessons, setCurrentStudentLessons] = useState<StudentLesson[]>([]);
  const [financialSummary, setFinancialSummary] = useState<StudentFinancialSummary | null>(null);
  const [studentRenewalAlert, setStudentRenewalAlert] = useState<PackageRenewalAlert | null>(null);
  const [studentAgreements, setStudentAgreements] = useState<PackageAgreementRecord[]>([]);
  const [studentPaymentHistory, setStudentPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [studentTimeline, setStudentTimeline] = useState<FinancialTimelineEvent[]>([]);
  const [isStudentRenewalModalOpen, setIsStudentRenewalModalOpen] = useState<boolean>(false);

  // Load lesson plan when a student is selected
  useEffect(() => {
    if (!selectedStudentId || !user) return;
    const selectedStudent = students.find((s) => s.id === selectedStudentId);
    if (!selectedStudent) return;

    const loadLessonPlan = async () => {
      const lessons = await fetchStudentLessons(selectedStudent.id, user.id);
      setCurrentStudentLessons(lessons);
    };

    loadLessonPlan();
  }, [selectedStudentId, user]);

  // Load comprehensive financial summary, alerts, package history, payment history & timeline
  const loadStudentFinancialData = async () => {
    if (!selectedStudentId || !user) return;
    try {
      const [summary, alerts, pkgs, pays, time] = await Promise.all([
        getStudentFinancialSummary(user.id, selectedStudentId),
        checkPackageExpirationAlerts(user.id, selectedStudentId),
        getStudentPackageHistory(user.id, selectedStudentId),
        getStudentPaymentHistory(user.id, selectedStudentId),
        getStudentFinancialTimeline(user.id, selectedStudentId),
      ]);
      setFinancialSummary(summary);
      setStudentRenewalAlert(alerts.length > 0 ? alerts[0] : null);
      setStudentAgreements(pkgs);
      setStudentPaymentHistory(pays);
      setStudentTimeline(time);
    } catch (err) {
      console.error("[StudentsPage] Error loading student financial data:", err);
    }
  };

  useEffect(() => {
    loadStudentFinancialData();
  }, [selectedStudentId, user, hubTab]);

  // Load selected student data into edit form states
  useEffect(() => {
    const selectedStudent = students.find((s) => s.id === selectedStudentId);
    if (selectedStudent) {
      setEditName(selectedStudent.name);
      setEditWhatsApp(selectedStudent.whatsapp);
      setEditEmail(selectedStudent.email || "");
      setEditLevel(selectedStudent.level);
      setEditFocus(selectedStudent.focus);
      setEditType(selectedStudent.type);
      setEditStatus(selectedStudent.status);
      setEditPackageId(selectedStudent.packageId || "");
      setEditNotes(selectedStudent.notes || "");
      setEditColorKey(selectedStudent.color_key || "default");
      setEditLinkedGroupId(selectedStudent.linkedGroupId || "");

      // Populate Multiple Schedules for Edit Form
      if (selectedStudent.schedules && selectedStudent.schedules.length > 0) {
        setEditClassFrequency(selectedStudent.schedules.length);
        setEditSchedulesList(selectedStudent.schedules.map(s => ({
          id: s.id,
          weekday: s.weekday,
          startTime: s.startTime,
          duration: s.duration,
          deliveryMode: s.deliveryMode,
          locationLink: s.locationLink || "",
        })));
      } else if (selectedStudent.scheduleDetails) {
        setEditClassFrequency(1);
        setEditSchedulesList([{
          weekday: selectedStudent.scheduleDetails.day,
          startTime: selectedStudent.scheduleDetails.startTime,
          duration: selectedStudent.scheduleDetails.duration,
          deliveryMode: selectedStudent.scheduleDetails.deliveryMode,
          locationLink: selectedStudent.scheduleDetails.locationLink || "",
        }]);
      } else {
        setEditClassFrequency(1);
        setEditSchedulesList([
          { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online", locationLink: "" }
        ]);
      }

      if (selectedStudent.scheduleDetails) {
        setEditClassDay(selectedStudent.scheduleDetails.day);
        setEditStartTime(selectedStudent.scheduleDetails.startTime);
        setEditDuration(selectedStudent.scheduleDetails.duration);
        setEditFrequency(selectedStudent.scheduleDetails.frequency);
        setEditStartDate(selectedStudent.scheduleDetails.startDate);
        setEditEndDate(selectedStudent.scheduleDetails.endDate || "");
        setEditTimezone(selectedStudent.scheduleDetails.timezone);
        setEditDeliveryMode(selectedStudent.scheduleDetails.deliveryMode);
        setEditLocationLink(selectedStudent.scheduleDetails.locationLink || "");
      } else {
        setEditClassFrequency(1);
        setEditSchedulesList([
          { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online", locationLink: "" }
        ]);
        setEditClassDay("Monday");
        setEditStartTime("09:00");
        setEditDuration(60);
        setEditFrequency("Weekly");
        setEditStartDate(new Date().toISOString().split("T")[0]);
        setEditEndDate("");
        setEditTimezone("America/Sao_Paulo");
        setEditDeliveryMode("Online");
        setEditLocationLink("");
      }
    }
  }, [selectedStudentId, students]);

  // Helper to save student and their multiple schedules atomically
  const saveStudentAndSchedules = async (
    studentId: string | null,
    studentData: any,
    schedules: ScheduleInput[],
    isEdit: boolean,
  ) => {
    let savedStudentData: any;
    if (isEdit && studentId) {
      const { data, error } = await supabase
        .from("students")
        .update({
          teacher_id: studentData.teacher_id,
          full_name: studentData.full_name,
          phone: studentData.phone,
          email: studentData.email,
          level: studentData.level,
          language_studied: studentData.language_studied,
          type: studentData.type,
          status: studentData.status,
          schedule: studentData.schedule,
          package_id: studentData.package_id,
          notes: studentData.notes,
          color_key: studentData.color_key || "default",
        })
        .eq("id", studentId)
        .select()
        .single();
      if (error) {
        console.error("[Student Save Failure]", {
          step: "students_update",
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        throw error;
      }
      savedStudentData = data;
    } else {
      const { data, error } = await supabase
        .from("students")
        .insert({
          teacher_id: studentData.teacher_id,
          full_name: studentData.full_name,
          phone: studentData.phone,
          email: studentData.email,
          level: studentData.level,
          language_studied: studentData.language_studied,
          type: studentData.type,
          status: studentData.status,
          schedule: studentData.schedule,
          package_id: studentData.package_id,
          notes: studentData.notes,
          color_key: studentData.color_key || "default",
        })
        .select()
        .single();
      if (error) {
        console.error("[Student Save Failure]", {
          step: "students_insert",
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        throw error;
      }
      savedStudentData = data;
    }

    const savedStudentId = savedStudentData.id;

    let savedSchedules: any[] = [];
    try {
      if (isEdit) {
        // Delete existing schedules first
        const { error: deleteError } = await supabase
          .from("student_schedules")
          .delete()
          .eq("student_id", savedStudentId);
        if (deleteError) throw deleteError;
      }

      // Insert new schedules and SELECT to retrieve generated UUIDs
      if (schedules.length > 0) {
        const schedulesToInsert = schedules.map((sch) => ({
          student_id: savedStudentId,
          weekday: sch.weekday,
          start_time: sch.startTime || (sch as any).start_time || null,
          end_time: (sch as any).endTime || (sch as any).end_time || null,
        }));

        const { data: insertedData, error: insertSchedulesError } = await supabase
          .from("student_schedules")
          .insert(schedulesToInsert)
          .select();

        if (insertSchedulesError) throw insertSchedulesError;
        savedSchedules = insertedData || [];
      }
    } catch (scheduleError: any) {
      console.error("[Student Save Failure]", {
        step: "student_schedules_error",
        code: scheduleError?.code,
        message: scheduleError?.message,
        details: scheduleError?.details,
        hint: scheduleError?.hint,
      });
      // Atomic compensation for new creations: delete student record if schedules failed
      if (!isEdit) {
        await supabase.from("students").delete().eq("id", savedStudentId);
      }
      throw scheduleError;
    }

    // Handle Package Assignment in student_packages with Per-Enrollment Agreement Snapshots
    const selectedPackageId = studentData.package_id && studentData.package_id !== "none_value" ? studentData.package_id : null;

    try {
      if (selectedPackageId) {
        const selectedPkg = packages.find((p) => p.id === selectedPackageId);
        const totalPriceCents = (Number(selectedPkg?.price) || 0) * 100;
        const instCount = Math.max(formInstallmentCount || 1, 1);
        const instAmountCents = Math.round(totalPriceCents / instCount);

        const ok = await saveStudentEnrollmentAgreement({
          teacherId: studentData.teacher_id,
          studentId: savedStudentId,
          packageId: selectedPackageId,
          totalAmountCents: totalPriceCents,
          installmentCount: instCount,
          installmentAmountCents: instAmountCents,
          dueDay: formDueDay || 5,
          firstDueDate: formFirstDueDate || new Date().toISOString().split("T")[0],
          paymentMethod: formPaymentMethod || "Pix",
        });

        if (!ok) {
          const agreementErr = new Error("Failed to save student enrollment agreement snapshot");
          throw agreementErr;
        }
      } else if (isEdit) {
        // Deactivate active package assignment if package set to none
        await supabase
          .from("student_packages")
          .update({
            status: "inactive",
            ended_at: new Date().toISOString().split("T")[0],
          })
          .eq("student_id", savedStudentId)
          .eq("teacher_id", studentData.teacher_id)
          .eq("status", "active");
      }
    } catch (packageError: any) {
      console.error("[Student Save Failure]", {
        step: "package_agreement_error",
        code: packageError?.code,
        message: packageError?.message,
        details: packageError?.details,
        hint: packageError?.hint,
      });
      if (!isEdit) {
        await supabase.from("students").delete().eq("id", savedStudentId);
      }
      throw packageError;
    }

    // Sync recurring 8-week occurrences into Supabase calendar_events table
    console.log("[Students] Executing syncStudentSchedulesToSupabaseEvents after schedule save:", {
      teacherId: studentData.teacher_id,
      savedStudentId,
      savedSchedules,
    });

    try {
      const syncResult = await syncStudentSchedulesToSupabaseEvents(
        savedStudentId,
        studentData.teacher_id,
        studentData.full_name,
        studentData.level as CEFRLevel,
        studentData.language_studied as CourseFocus,
        studentData.type as StudentType,
        savedSchedules.length > 0 ? savedSchedules : schedules,
        8
      );
      console.log("[Students] Calendar sync result:", syncResult);
    } catch (syncErr) {
      console.warn("[Students] Failed to sync recurring events to calendar_events:", syncErr);
    }

    return savedStudentData;
  };

  const handleSaveStudentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !editName.trim() || !user) return;

    if (!editWhatsApp.trim()) {
      toast.error(i18nT("students.toastWhatsAppRequired", lang));
      return;
    }

    const scheduleString = editLinkedGroupId 
      ? "Linked Group" 
      : editSchedulesList.map(s => `${s.weekday.substring(0, 3)} • ${s.startTime}`).join(", ");

    const studentData = {
      teacher_id: user.id,
      full_name: editName,
      phone: editWhatsApp || null,
      email: editEmail.trim() || null,
      level: editLevel || "A1",
      language_studied: editFocus || "English",
      type: editType || "Private",
      status: editStatus || "Active",
      schedule: scheduleString,
      package_id: editPackageId === "none_value" || editPackageId === "" ? null : editPackageId,
      notes: editNotes || null,
      color_key: editColorKey,
    };

    // Store custom fields to pass to the schedules insert query
    const studentDataWithDates = {
      ...studentData,
      timezone: editTimezone,
      frequency: editFrequency,
      start_date: editStartDate,
      end_date: editEndDate || null,
    };

    try {
      const data = await saveStudentAndSchedules(
        selectedStudentId,
        studentDataWithDates,
        editSchedulesList,
        true
      );

      // Local calendar events sync
      try {
        const allEvents = getCalendarEvents();
        let updatedEvents = deleteStudentEvents(selectedStudentId, allEvents);
        if (editSchedulesList.length > 0) {
          editSchedulesList.forEach((sch) => {
            const scheduleDetailsObj: ScheduleDetails = {
              day: sch.weekday,
              startTime: sch.startTime,
              duration: sch.duration,
              frequency: editFrequency,
              startDate: editStartDate || new Date().toISOString().split("T")[0],
              endDate: editEndDate || undefined,
              timezone: editTimezone,
              deliveryMode: sch.deliveryMode,
              locationLink: sch.locationLink || undefined,
            };
            updatedEvents = syncStudentScheduleWithEvents(
              selectedStudentId,
              editName,
              editLevel,
              editFocus as any,
              editType,
              scheduleDetailsObj,
              updatedEvents
            );
          });
        }
        saveCalendarEvents(updatedEvents);
      } catch (calErr) {
        console.error("Local calendar sync error:", calErr);
      }

      toast.success(i18nT("students.toastSaveSuccess", lang));

      // Update state
      setStudents((prev) =>
        prev.map((s) =>
          s.id === selectedStudentId
            ? {
                ...s,
                name: data.full_name,
                whatsapp: data.phone || "",
                email: data.email || "",
                level: (data.level as CEFRLevel) || "A1",
                focus: data.language_studied || "English",
                type: editType,
                status: editStatus,
                schedule: scheduleString,
                notes: data.notes || "",
                color_key: data.color_key || editColorKey,
                lastActive: data.updated_at,
                packageId: data.package_id || undefined,
                schedules: editSchedulesList,
                scheduleDetails: editSchedulesList.length > 0 ? {
                  day: editSchedulesList[0].weekday,
                  startTime: editSchedulesList[0].startTime,
                  duration: editSchedulesList[0].duration,
                  frequency: editFrequency,
                  startDate: editStartDate,
                  endDate: editEndDate || undefined,
                  timezone: editTimezone,
                  deliveryMode: editSchedulesList[0].deliveryMode,
                  locationLink: editSchedulesList[0].locationLink || undefined,
                } : undefined,
              }
            : s,
        ),
      );
    } catch (error: any) {
      console.error("[Students] Error saving inline student settings:", error);
      toast.error(i18nT("students.toastSaveError", lang));
    }
  };

  const handleReactivateStudent = async (studentIdToReactivate: string) => {
    if (!user || !studentIdToReactivate) return;

    try {
      const { error } = await supabase
        .from("students")
        .update({ status: "Active" })
        .eq("id", studentIdToReactivate)
        .eq("teacher_id", user.id);

      if (error) throw error;

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentIdToReactivate
            ? { ...s, status: "Active" as StudentStatus }
            : s
        )
      );

      toast.success(i18nT("students.toastReactivateSuccess", lang));
    } catch (err: any) {
      console.error("[Students] Error reactivating student:", err);
      toast.error(i18nT("students.toastReactivateError", lang));
    }
  };

  // Load students from Supabase on mount
  useEffect(() => {
    if (!user) return;

    const fetchStudents = async () => {
      try {
        // Attempt 1: Fetch with full relations (student_schedules + student_packages + packages)
        let response = await supabase
          .from("students")
          .select("*, student_schedules(*), student_packages(*, packages(*))")
          .eq("teacher_id", user.id)
          .order("full_name", { ascending: true });

        // Attempt 2: Fallback to student_schedules relation if student_packages relation doesn't exist in DB
        if (response.error) {
          console.warn("[Students] Full relation query failed, falling back to student_schedules relation:", response.error.message);
          response = await supabase
            .from("students")
            .select("*, student_schedules(*)")
            .eq("teacher_id", user.id)
            .order("full_name", { ascending: true });
        }

        // Attempt 3: Fallback to plain students table if student_schedules relation also doesn't exist in DB
        if (response.error) {
          console.warn("[Students] Secondary relation query failed, falling back to plain students query:", response.error.message);
          response = await supabase
            .from("students")
            .select("*")
            .eq("teacher_id", user.id)
            .order("full_name", { ascending: true });
        }

        if (response.error) {
          console.error("[Students Page Load Failure]", {
            step: "fetch_students_query",
            code: response.error?.code,
            message: response.error?.message,
            details: response.error?.details,
            hint: response.error?.hint,
          });
          return;
        }

        const data = response.data;

        if (data) {
          const mappedStudents: Student[] = data.map((d: any) => {
            const schedulesList = d.student_schedules || [];
            
            const dayTranslation: Record<string, string> = {
              Monday: lang === "pt" ? "Seg" : "Mon",
              Tuesday: lang === "pt" ? "Ter" : "Tue",
              Wednesday: lang === "pt" ? "Qua" : "Wed",
              Thursday: lang === "pt" ? "Qui" : "Thu",
              Friday: lang === "pt" ? "Sex" : "Fri",
              Saturday: lang === "pt" ? "Sáb" : "Sat",
              Sunday: lang === "pt" ? "Dom" : "Sun"
            };

            const scheduleSummary = schedulesList.length > 0
              ? schedulesList.map((s: any) => `${dayTranslation[s.weekday] || s.weekday?.substring(0, 3) || ""}${s.start_time ? ` • ${s.start_time}` : ""}`).join(", ")
              : (d.schedule || "Custom");

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
          setStudents(mappedStudents);

          if (mappedStudents.length === 0) {
            const dismissed = localStorage.getItem("bloom.students_welcome_dismissed");
            if (!dismissed) {
              setShowZeroStudentsWelcome(true);
            }
          }
        }
      } catch (error: any) {
        console.error("[Students] Error loading students:", error);
      }
    };

    fetchStudents();

    // Fetch packages catalog from Supabase
    const fetchPackages = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("packages")
          .select("*")
          .eq("teacher_id", user.id)
          .order("name", { ascending: true });

        if (error) {
          console.warn("[Students] Could not fetch packages (table might not exist in DB):", error.message);
          return;
        }

        if (data) {
          const mappedPkgs: Package[] = data.map((d: any) => ({
            id: d.id,
            name: d.name,
            price: Number(d.price) || 0,
            frequency: d.frequency || "Monthly",
            duration: Number(d.duration) || 60,
            lessons: Number(d.lessons) || 4,
            method: d.method || "Pix",
          }));
          setPackages(mappedPkgs);
        }
      } catch (e) {
        console.warn("[Students] Error fetching packages:", e);
      }
    };

    fetchPackages();

    // Fetch classes & groups and active member student IDs from Supabase
    fetchTeacherClasses(user.id).then(setClassesList);
    fetchActiveClassMemberStudentIds(user.id).then(setActiveMemberStudentIds);

    // Load ledger to show in Student Hub
    const savedLedger = localStorage.getItem("bloom.ledger.transactions");
    if (savedLedger) {
      try {
        setLedger(JSON.parse(savedLedger));
      } catch (e) {
        console.error(e);
      }
    }
  }, [user, isModalOpen, isClassModalOpen, selectedStudentId]);

  // Open modal for creating student
  const handleOpenModal = () => {
    setEditingStudentIdForModal(null);
    setFormName("");
    setFormWhatsApp("");
    setFormEmail("");
    setFormLevel("B2");
    setFormFocus("English");
    setFormType("Private");
    setFormStatus("Active");
    setFormSchedule("");
    setFormGroupSize(3);
    setFormPackageId("");
    setFormNotes("");
    setFormColorKey("default");

    // Reset Schedule fields
    setFormClassFrequency(1);
    setFormSchedulesList([
      { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online", locationLink: "" }
    ]);
    setFormClassDay("Monday");
    setFormStartTime("09:00");
    setFormDuration(60);
    setFormFrequency("Weekly");
    setFormStartDate(new Date().toISOString().split("T")[0]);
    setFormEndDate("");
    setFormTimezone("America/Sao_Paulo");
    setFormDeliveryMode("Online");
    setFormLocationLink("");
    setFormLinkedGroupId("");

    setIsModalOpen(true);
  };

  // Open modal for editing student
  const handleOpenEditModal = (student: Student) => {
    setEditingStudentIdForModal(student.id);
    setFormName(student.name);
    setFormWhatsApp(student.whatsapp);
    setFormEmail(student.email || "");
    setFormLevel(student.level || "B1");
    setFormFocus(student.focus || "English");
    setFormType(student.type || "Private");
    setFormStatus(student.status || "Active");
    setFormGroupSize(student.groupSize || 3);
    setFormPackageId(student.packageId || "");
    setFormNotes(student.notes || "");
    setFormColorKey(student.color_key || "default");

    // Populate Multiple Schedules
    if (student.schedules && student.schedules.length > 0) {
      setFormClassFrequency(student.schedules.length);
      setFormSchedulesList(student.schedules.map(s => ({
        id: s.id,
        weekday: s.weekday,
        startTime: s.startTime,
        duration: s.duration,
        deliveryMode: s.deliveryMode,
        locationLink: s.locationLink || "",
      })));
    } else if (student.scheduleDetails) {
      setFormClassFrequency(1);
      setFormSchedulesList([{
        weekday: student.scheduleDetails.day,
        startTime: student.scheduleDetails.startTime,
        duration: student.scheduleDetails.duration,
        deliveryMode: student.scheduleDetails.deliveryMode,
        locationLink: student.scheduleDetails.locationLink || "",
      }]);
    } else {
      setFormClassFrequency(1);
      setFormSchedulesList([
        { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online", locationLink: "" }
      ]);
    }

    if (student.scheduleDetails) {
      setFormClassDay(student.scheduleDetails.day);
      setFormStartTime(student.scheduleDetails.startTime);
      setFormDuration(student.scheduleDetails.duration);
      setFormFrequency(student.scheduleDetails.frequency);
      setFormStartDate(student.scheduleDetails.startDate);
      setFormEndDate(student.scheduleDetails.endDate || "");
      setFormTimezone(student.scheduleDetails.timezone);
      setFormDeliveryMode(student.scheduleDetails.deliveryMode);
      setFormLocationLink(student.scheduleDetails.locationLink || "");
      setFormLinkedGroupId(student.linkedGroupId || "");
    } else {
      setFormClassDay("Monday");
      setFormStartTime("09:00");
      setFormDuration(60);
      setFormFrequency("Weekly");
      setFormStartDate(new Date().toISOString().split("T")[0]);
      setFormEndDate("");
      setFormTimezone("America/Sao_Paulo");
      setFormDeliveryMode("Online");
      setFormLocationLink("");
      setFormLinkedGroupId("");
    }

    setIsModalOpen(true);
  };

  // Check if form contains unsaved changes
  const checkIsFormDirty = () => {
    if (editingStudentIdForModal) {
      const student = students.find((s) => s.id === editingStudentIdForModal);
      if (!student) return false;

      const schedulesChanged = JSON.stringify(formSchedulesList.map(s => ({
        weekday: s.weekday,
        startTime: s.startTime,
        duration: s.duration,
        deliveryMode: s.deliveryMode,
        locationLink: s.locationLink
      }))) !== JSON.stringify((student.schedules || []).map(s => ({
        weekday: s.weekday,
        startTime: s.startTime,
        duration: s.duration,
        deliveryMode: s.deliveryMode,
        locationLink: s.locationLink
      })));

      return (
        formName !== (student.name || "") ||
        formWhatsApp !== (student.whatsapp || "") ||
        formEmail !== (student.email || "") ||
        formLevel !== (student.level || "B1") ||
        formFocus !== (student.focus || "English") ||
        formType !== (student.type || "Private") ||
        formStatus !== (student.status || "Active") ||
        formGroupSize !== (student.groupSize || 3) ||
        formPackageId !== (student.packageId || "") ||
        formNotes !== (student.notes || "") ||
        schedulesChanged ||
        formLinkedGroupId !== (student.linkedGroupId || "")
      );
    } else {
      return (
        formName !== "" ||
        formWhatsApp !== "" ||
        formEmail !== "" ||
        formLevel !== "B2" ||
        formFocus !== "English" ||
        formType !== "Private" ||
        formStatus !== "Active" ||
        formNotes !== "" ||
        formSchedulesList.length > 1 ||
        formSchedulesList[0]?.weekday !== "Monday" ||
        formSchedulesList[0]?.startTime !== "09:00" ||
        formSchedulesList[0]?.duration !== 60 ||
        formSchedulesList[0]?.deliveryMode !== "Online" ||
        formSchedulesList[0]?.locationLink !== ""
      );
    }
  };

  // Handle dialog open change with dirty checks
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      const isDirty = checkIsFormDirty();
      if (isDirty) {
        const confirmClose = window.confirm(
          lang === "pt"
            ? "Você tem alterações não salvas. Deseja realmente sair e descartar as alterações?"
            : "You have unsaved changes. Are you sure you want to close and discard your changes?"
        );
        if (!confirmClose) return;
      }
    }
    if (!open) {
      setEditingStudentIdForModal(null);
    }
    setIsModalOpen(open);
  };

  const handleCancelAttempt = () => {
    handleOpenChange(false);
  };

  // Submit new student or update existing student and sync to Supabase
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !user) return;

    if (!formWhatsApp.trim()) {
      toast.error(i18nT("students.toastWhatsAppRequired", lang));
      return;
    }

    setIsSaving(true);

    const scheduleString = formLinkedGroupId 
      ? "Linked Group" 
      : formSchedulesList.map(s => `${s.weekday.substring(0, 3)} • ${s.startTime}`).join(", ");

    const studentData = {
      teacher_id: user.id,
      full_name: formName,
      phone: formWhatsApp || null,
      email: formEmail.trim() || null,
      level: formLevel || "A1",
      language_studied: formFocus || "English",
      type: formType || "Private",
      status: formStatus || "Active",
      schedule: scheduleString,
      group_size: formType === "Group" ? formGroupSize : null,
      package_id: formPackageId === "none_value" || formPackageId === "" ? null : formPackageId,
      notes: formNotes || null,
      color_key: formColorKey,
    };

    // Store custom fields to pass to the schedules insert query
    const studentDataWithDates = {
      ...studentData,
      timezone: formTimezone,
      frequency: formFrequency,
      start_date: formStartDate,
      end_date: formEndDate || null,
    };

    try {
      const data = await saveStudentAndSchedules(
        editingStudentIdForModal,
        studentDataWithDates,
        formSchedulesList,
        !!editingStudentIdForModal
      );

      const targetStudentId = data.id;

      // Local calendar events sync
      try {
        const allEvents = getCalendarEvents();
        let updatedEvents = deleteStudentEvents(targetStudentId, allEvents);
        if (formSchedulesList.length > 0) {
          formSchedulesList.forEach((sch) => {
            const scheduleDetailsObj: ScheduleDetails = {
              day: sch.weekday,
              startTime: sch.startTime,
              duration: sch.duration,
              frequency: formFrequency,
              startDate: formStartDate || new Date().toISOString().split("T")[0],
              endDate: formEndDate || undefined,
              timezone: formTimezone,
              deliveryMode: sch.deliveryMode,
              locationLink: sch.locationLink || undefined,
            };
            updatedEvents = syncStudentScheduleWithEvents(
              targetStudentId,
              formName,
              formLevel,
              formFocus as any,
              formType,
              scheduleDetailsObj,
              updatedEvents
            );
          });
        }
        saveCalendarEvents(updatedEvents);
      } catch (calErr) {
        console.error("Local calendar sync error:", calErr);
      }

      const mappedStudent: Student = {
        id: data.id,
        name: data.full_name,
        whatsapp: data.phone || "",
        email: data.email || "",
        level: (data.level as CEFRLevel) || "A1",
        focus: data.language_studied || "English",
        type: formType,
        status: formStatus,
        schedule: scheduleString,
        createdAt: data.created_at,
        lastActive: data.updated_at,
        notes: data.notes || "",
        color_key: data.color_key || formColorKey,
        schedules: formSchedulesList,
        scheduleDetails: formSchedulesList.length > 0 ? {
          day: formSchedulesList[0].weekday,
          startTime: formSchedulesList[0].startTime,
          duration: formSchedulesList[0].duration,
          frequency: formFrequency,
          startDate: formStartDate,
          endDate: formEndDate || undefined,
          timezone: formTimezone,
          deliveryMode: formSchedulesList[0].deliveryMode,
          locationLink: formSchedulesList[0].locationLink || undefined,
        } : undefined,
        linkedGroupId: formLinkedGroupId || undefined,
        groupSize: formType === "Group" ? formGroupSize : undefined,
        packageId: formPackageId || undefined,
      };

      if (editingStudentIdForModal) {
        toast.success(i18nT("students.toastSaveSuccess", lang));
        setStudents((prev) =>
          prev.map((s) => (s.id === editingStudentIdForModal ? mappedStudent : s)),
        );

        // Update inline settings fields too if selected student is edited
        if (selectedStudentId === editingStudentIdForModal) {
          setEditName(data.full_name);
          setEditWhatsApp(data.phone || "");
          setEditEmail(data.email || "");
          setEditLevel((data.level as CEFRLevel) || "A1");
          setEditFocus(data.language_studied || "English");
          setEditNotes(data.notes || "");
          setEditClassFrequency(formSchedulesList.length);
          setEditSchedulesList(formSchedulesList);
        }
      } else {
        toast.success(i18nT("students.toastSaveSuccess", lang));
        setStudents((prev) => [...prev, mappedStudent]);
      }

      setIsModalOpen(false);
    } catch (error: any) {
      console.error("[Students] Error saving student via modal:", error);
      toast.error(i18nT("students.toastSaveError", lang));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Student & Events Sync
  const handleDeleteStudent = async (id: string) => {
    if (!id) return;

    const confirmMessage =
      lang === "pt"
        ? "Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita."
        : "Are you sure you want to delete this student? This action cannot be undone.";

    if (!window.confirm(confirmMessage)) return;

    try {
      const { error } = await supabase.from("students").delete().eq("id", id);

      if (error) throw error;

      toast.success(i18nT("students.toastDeleteSuccess", lang));

      setStudents((prev) => prev.filter((s) => s.id !== id));
      setSelectedStudentId(null);
    } catch (error: any) {
      console.error("[Students] Error deleting student:", error);
      toast.error(i18nT("students.toastDeleteError", lang));
    }
  };

  // Filtering Logic: Partition Active vs Inactive
  const activeStudents = students.filter((s) => s.status?.toLowerCase() !== "inactive");
  const inactiveStudents = students.filter((s) => s.status?.toLowerCase() === "inactive");
  const individualActiveStudents = activeStudents.filter((s) => !activeMemberStudentIds.has(s.id));

  let targetStudentPool: Student[] = activeStudents;
  if (activeViewTab === "individual_students") {
    targetStudentPool = individualActiveStudents;
  } else if (activeViewTab === "inactive") {
    targetStudentPool = inactiveStudents;
  }

  const filteredStudents = targetStudentPool
    .filter((s) => {
      const matchSearch =
        (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.focus || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchLevel = selectedLevel === "ALL" || s.level === selectedLevel;
      const matchFocus = selectedFocus === "ALL" || s.focus === selectedFocus;
      const matchStatus = selectedStatus === "ALL" || s.status === selectedStatus;
      return matchSearch && matchLevel && matchFocus && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "alpha") {
        return (a.name || "").localeCompare(b.name || "");
      }
      if (sortBy === "created") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      return new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime();
    });

  const filteredClasses = classesList.filter((cls) => {
    const matchSearch =
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.level.toLowerCase().includes(searchQuery.toLowerCase());
    const matchLevel = selectedLevel === "ALL" || cls.level === selectedLevel;
    const matchStatus = selectedStatus === "ALL" || cls.status === selectedStatus;
    return matchSearch && matchLevel && matchStatus;
  });

  const t = translations[lang];
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedClass = classesList.find((c) => c.id === selectedClassId);

  // Student specific Finance variables
  const studentPkg = selectedStudent
    ? packages.find((p) => p.id === selectedStudent.packageId)
    : null;
  const studentTxs = selectedStudent
    ? ledger.filter((tx) => tx.studentId === selectedStudent.id)
    : [];
  const outstandingBalance = studentTxs
    .filter((tx) => tx.status === "Pending" || tx.status === "Overdue")
    .reduce((sum, curr) => sum + curr.amount, 0);

  return (
    <div className="space-y-6">
      {/* VIEW SELECTOR: Student Hub vs Class Details vs Directory Grid */}
      {selectedStudentId && selectedStudent ? (
        /* 1. INDIVIDUAL STUDENT HUB PANEL VIEW */
        <div className="space-y-6">
          {/* HUB HEADER */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedStudentId(null);
                  if (previousClassId) {
                    setSelectedClassId(previousClassId);
                    setPreviousClassId(null);
                  }
                }}
                className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={t.backToGrid}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    {selectedStudent.name}
                  </h2>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-semibold py-0.5 px-2 tracking-wide ${getStatusStyles(
                      selectedStudent.status,
                    )}`}
                  >
                    {selectedStudent.status?.toLowerCase() === "inactive" ? "Inativo" : (
                      <>
                        {selectedStudent.status === "Active" && t.active}
                        {selectedStudent.status === "Paused" && t.paused}
                        {selectedStudent.status === "Trial" && t.trial}
                        {selectedStudent.status === "Lead" && t.lead}
                      </>
                    )}
                  </Badge>
                  {selectedStudent.type === "Group" && (
                    <Badge className="bg-lilac text-lilac-foreground text-[10px] uppercase font-bold px-2 py-0">
                      {t.groupBadge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedStudent.focus} • {t.fieldLevel} {selectedStudent.level}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedStudent.status?.toLowerCase() === "inactive" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs h-9 font-bold bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 cursor-pointer gap-1.5"
                  onClick={() => handleReactivateStudent(selectedStudent.id)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.reactivateStudent}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs h-9 text-amber-700 dark:text-amber-400 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 cursor-pointer gap-1.5"
                  onClick={() => {
                    setStudentToInactivate(selectedStudent);
                    setIsInactivateModalOpen(true);
                  }}
                >
                  <UserX className="h-3.5 w-3.5" />
                  {t.markInactive}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs h-9 cursor-pointer"
                onClick={() => handleOpenEditModal(selectedStudent)}
              >
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                {t.tabSettings}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl text-xs h-9 cursor-pointer"
                onClick={() => handleDeleteStudent(selectedStudent.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {t.deleteStudent}
              </Button>
            </div>
          </div>

          {/* HUB TABS */}
          <div className="flex gap-2 border-b border-border pb-1 overflow-x-auto">
            {["Overview", "Lessons", "Finance", "Settings"].map((tab) => (
              <button
                key={tab}
                onClick={() => setHubTab(tab)}
                className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  hubTab === tab
                    ? "bg-[#163020] text-[#F4EBE1] shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                {tab === "Overview" && t.tabOverview}
                {tab === "Lessons" && t.tabLessons}
                {tab === "Finance" && t.tabFinance}
                {tab === "Settings" && t.tabSettings}
              </button>
            ))}
          </div>

          {/* HUB TAB CONTENTS */}
          {hubTab === "Overview" && (
            <div className="grid gap-6 md:grid-cols-3">
              {/* Student Details Card */}
              <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  {t.detailsTitle}
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-muted-foreground font-medium block">{t.fieldWhatsApp}:</span>
                    <a
                      href={`https://wa.me/${selectedStudent.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline font-bold flex items-center gap-1 mt-0.5"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {selectedStudent.whatsapp}
                    </a>
                  </div>
                  {selectedStudent.email && (
                    <div>
                      <span className="text-muted-foreground font-medium block">{t.fieldEmail}:</span>
                      <a
                        href={`mailto:${selectedStudent.email}`}
                        className="text-foreground hover:underline font-medium flex items-center gap-1 mt-0.5"
                      >
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {selectedStudent.email}
                      </a>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground font-medium block">{t.fieldSchedule}:</span>
                    <span className="font-bold text-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      {selectedStudent.schedule}
                    </span>
                  </div>
                  {studentPkg && (
                    <div>
                      <span className="text-muted-foreground font-medium block">{t.fieldPackage}:</span>
                      <Badge variant="secondary" className="mt-1 font-bold">
                        {studentPkg.name}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Private Notes */}
              <div className="md:col-span-2 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
                <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {t.privateNotesTitle}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "pt"
                    ? "Estas notas são estritamente individuais e não são compartilhadas em turmas."
                    : "These notes are strictly private to this student and not shared with class sessions."}
                </p>
                <textarea
                  value={selectedStudent.notes || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStudents((prev) =>
                      prev.map((s) => (s.id === selectedStudent.id ? { ...s, notes: val } : s)),
                    );
                  }}
                  onBlur={async () => {
                    if (selectedStudent) {
                      await supabase
                        .from("students")
                        .update({ notes: selectedStudent.notes || null })
                        .eq("id", selectedStudent.id);
                    }
                  }}
                  rows={4}
                  placeholder={lang === "pt" ? "Escreva notas privadas sobre este aluno..." : "Write private notes about this student..."}
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                />
              </div>
            </div>
          )}

          {hubTab === "Lessons" && (
            <StudentLessonPlanTable
              studentId={selectedStudent.id}
              studentName={selectedStudent.name}
              teacherId={user?.id || ""}
              lessons={currentStudentLessons}
              onLessonsChange={(updated) => setCurrentStudentLessons(updated)}
            />
          )}

          {hubTab === "Finance" && (
            <div className="space-y-6">
              {/* Expiration Renewal Alert Banner */}
              {studentRenewalAlert && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-amber-900 dark:text-amber-200">
                        {studentRenewalAlert.alertMessage}
                      </h4>
                      <p className="text-amber-800/80 dark:text-amber-300/80">
                        Término do contrato previsto para {studentRenewalAlert.endDate.split("-").reverse().join("/")}.
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => setIsStudentRenewalModalOpen(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 self-start sm:self-auto cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Renovar pacote
                  </Button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {lang === "pt" ? "Plano Contratado" : "Active Package"}
                  </span>
                  <div className="text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
                    <span>{financialSummary?.packageName || (studentPkg ? studentPkg.name : t.financeNoPkg)}</span>
                    {financialSummary?.isInstallment ? (
                      <Badge variant="outline" className="text-[9px] py-0.5 px-1.5 font-extrabold text-stone-600 bg-stone-100 border-stone-300">
                        {financialSummary.progressLabel}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] py-0.5 px-1.5 font-bold text-emerald-700 bg-emerald-50 border-emerald-200">
                        Mensalidade
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {financialSummary?.isInstallment
                      ? `${financialSummary.installmentCount}x de ${formatCentsToBRL(financialSummary.installmentAmountCents)}`
                      : studentPkg ? `R$ ${(studentPkg.price / 100).toFixed(2)} / mês` : "Sem plano"}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {lang === "pt" ? "Progresso / Parcela Atual" : "Payment Progress"}
                  </span>
                  <div className="text-base font-bold text-foreground">
                    {financialSummary?.currentInstallmentLabel || "Mensalidade"}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {financialSummary?.progressLabel || "Mensalidade"}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {lang === "pt" ? "Próximo Vencimento" : "Next Due Date"}
                  </span>
                  <div className="text-base font-bold text-foreground">
                    {financialSummary?.nextDueDate || (lang === "pt" ? "Em dia" : "Up to date")}
                  </div>
                  {financialSummary?.lastPaymentDate && (
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {lang === "pt" ? "Último pago:" : "Last paid:"} {financialSummary.lastPaymentDate}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {lang === "pt" ? "Saldo Restante" : "Remaining Balance"}
                  </span>
                  <div className="text-xl font-extrabold text-foreground">
                    {financialSummary?.remainingBalanceFormatted || "R$ 0,00"}
                  </div>
                  {financialSummary?.isInstallment && (
                    <p className="text-[10px] text-stone-500 font-semibold">
                      {lang === "pt" ? "Valor total do contrato" : "Total agreement value"}
                    </p>
                  )}
                </div>
              </div>

              {/* PACOTE ATUAL & PACOTES ANTERIORES */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] space-y-4">
                <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  {lang === "pt" ? "Histórico de Contratos & Pacotes" : "Package Agreements History"}
                </h4>

                <div className="space-y-4">
                  {studentAgreements.map((sp) => (
                    <div
                      key={sp.id}
                      className={`p-4 rounded-xl border space-y-2 text-xs ${
                        sp.isCurrent
                          ? "border-emerald-600/40 bg-emerald-50/40 dark:bg-emerald-950/20"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider block">
                            {sp.isCurrent ? "PACOTE ATUAL" : "PACOTE ANTERIOR"}
                          </span>
                          <strong className="text-sm font-bold text-foreground">{sp.packageName}</strong>
                          <span className="text-muted-foreground block text-[11px]">
                            Vigência: {sp.startedAt ? sp.startedAt.split("-").reverse().join("/") : "—"} – {sp.endedAt ? sp.endedAt.split("-").reverse().join("/") : "Ativo"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant={sp.isCurrent ? "outline" : "secondary"}
                            className={sp.isCurrent ? "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold" : "font-bold"}
                          >
                            {sp.statusLabel}
                          </Badge>
                          <Badge variant="outline" className="font-bold">
                            {sp.changeTypeLabel}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block">Valor Total</span>
                          <strong>{sp.totalAmountFormatted}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Parcelas</span>
                          <strong>{sp.installmentCount}x de {sp.installmentAmountFormatted}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Progresso</span>
                          <strong className="text-emerald-700 dark:text-emerald-400">{sp.progressLabel}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Meio</span>
                          <strong>{sp.paymentMethod}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* HISTÓRICO DE PAGAMENTOS PER STUDENT */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] space-y-4">
                <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  {lang === "pt" ? "Histórico de Pagamentos" : "Payment History"}
                </h4>

                {studentPaymentHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-medium py-4 text-center">
                    {lang === "pt" ? "Nenhum pagamento histórico registrado ainda." : "No payment history recorded yet."}
                  </p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {studentPaymentHistory.map((pay) => (
                      <div key={pay.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <strong className="text-foreground text-sm">
                              {pay.paymentDate.split("-").reverse().join("/")}
                            </strong>
                            <Badge variant="outline" className="text-[10px] font-bold">
                              {pay.packageName}
                            </Badge>
                            {pay.installmentLabel && (
                              <Badge variant="secondary" className="text-[10px] font-bold">
                                {pay.installmentLabel}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-[11px]">
                            Ref: <strong>{pay.invoiceReference}</strong> • Meio: <strong>{pay.paymentMethod}</strong> • Período: {pay.billingPeriod}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-extrabold text-sm text-foreground">{pay.amountFormatted}</span>
                          <Badge className="bg-emerald-600 text-white font-bold text-[10px]">{pay.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* LINHA DO TEMPO FINANCEIRA */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] space-y-4">
                <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  {lang === "pt" ? "Linha do Tempo Financeira" : "Financial Timeline"}
                </h4>

                {studentTimeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    Nenhum evento na linha do tempo.
                  </p>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                    {studentTimeline.map((evt) => (
                      <div key={evt.id} className="relative group text-xs">
                        <div className="absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-emerald-600 bg-background group-hover:bg-emerald-600 transition-colors" />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-muted-foreground">
                              {evt.date.split("-").reverse().join("/")}
                            </span>
                            <span className="font-bold text-foreground">{evt.title}</span>
                            {evt.badgeText && (
                              <Badge variant={evt.badgeVariant || "outline"} className="text-[9px] font-bold">
                                {evt.badgeText}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-[11px]">{evt.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {hubTab === "Settings" && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] max-w-2xl space-y-5">
              <h3 className="font-display text-base font-bold text-foreground">{t.tabSettings}</h3>
              <form onSubmit={handleSaveStudentSettings} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">{t.fieldName}</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">{t.fieldWhatsApp}</Label>
                    <Input value={editWhatsApp} onChange={(e) => setEditWhatsApp(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">{t.fieldEmail}</Label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </div>
                </div>

                <ColorSelector
                  value={editColorKey}
                  onChange={(val) => setEditColorKey(val)}
                  label={lang === "pt" ? "Cor de Identificação do Aluno (Padrão Bloom)" : "Student Brand Color"}
                />

                <Button type="submit" className="w-full font-bold cursor-pointer">
                  {t.btnSave}
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : selectedClassId && selectedClass ? (
        /* 2. DEDICATED CLASS DETAILS VIEW */
        <ClassDetailsView
          cls={selectedClass}
          onBack={() => setSelectedClassId(null)}
          onEditClass={() => {
            setEditingClass(selectedClass);
            setClassModalType(selectedClass.type);
            setIsClassModalOpen(true);
          }}
          onSelectStudent={(targetStudentId) => {
            setPreviousClassId(selectedClassId);
            setSelectedStudentId(targetStudentId);
          }}
          onOpenAttendance={(cls) => {
            setAttendanceClass(cls);
            setIsAttendanceModalOpen(true);
          }}
          isPt={lang === "pt"}
        />
      ) : (
        /* 3. DIRECTORY GRID VIEW */
        <>
          <PageHeader
            title={t.title}
            description={t.description}
            actions={
              <button
                onClick={() => setIsAddSelectionOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary/95 transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" /> {t.addStudent}
              </button>
            }
          />

          {/* VIEW TAB SELECTOR */}
          <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveViewTab("all_students")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeViewTab === "all_students"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-secondary/40 border border-border/60"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>{lang === "pt" ? "Todos os alunos" : "All students"} ({activeStudents.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveViewTab("individual_students")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeViewTab === "individual_students"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-secondary/40 border border-border/60"
              }`}
            >
              <User className="h-4 w-4" />
              <span>
                {lang === "pt" ? "Alunos individuais" : "Individual students"} ({individualActiveStudents.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveViewTab("classes")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeViewTab === "classes"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-secondary/40 border border-border/60"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>{lang === "pt" ? "Turmas & Duplas" : "Classes & Pairs"} ({classesList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveViewTab("inactive")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeViewTab === "inactive"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-secondary/40 border border-border/60"
              }`}
            >
              <UserX className="h-4 w-4" />
              <span>Inativos ({inactiveStudents.length})</span>
            </button>
          </div>

          {/* SEARCH & FILTERS BAR */}
          <div className="flex flex-col gap-3 rounded-2xl border border-[#163020] bg-[#163020] p-4 text-[#F4EBE1] shadow-[var(--shadow-sm)] md:flex-row md:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="pl-10 h-10 rounded-xl bg-white text-stone-900 border-stone-200 placeholder:text-stone-400"
              />
            </div>

            {/* Level Filter */}
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="h-10 rounded-xl md:w-36 bg-white text-stone-900 border-stone-200">
                <SelectValue placeholder={t.filterLevel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t.filterLevel}</SelectItem>
                <SelectItem value="A1">A1</SelectItem>
                <SelectItem value="A2">A2</SelectItem>
                <SelectItem value="B1">B1</SelectItem>
                <SelectItem value="B2">B2</SelectItem>
                <SelectItem value="C1">C1</SelectItem>
                <SelectItem value="C2">C2</SelectItem>
              </SelectContent>
            </Select>

            {/* Focus Filter */}
            <Select
              value={selectedFocus}
              onValueChange={(val) => {
                if (val === "CONFIGURE_LANGUAGES") {
                  navigate({ to: "/settings" });
                } else {
                  setSelectedFocus(val);
                }
              }}
            >
              <SelectTrigger className="h-10 rounded-xl md:w-44 bg-white text-stone-900 border-stone-200">
                <SelectValue placeholder={t.filterFocus} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t.filterFocus}</SelectItem>
                {hasConfiguredLanguages ? (
                  teacherLanguages.map((langItem) => (
                    <SelectItem key={langItem} value={langItem}>
                      {formatLanguageLabel(langItem, lang)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="CONFIGURE_LANGUAGES" className="text-amber-700 font-semibold">
                    {lang === "pt" ? "⚠️ Configurar idiomas" : "⚠️ Configure languages"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-10 rounded-xl md:w-40 bg-white text-stone-900 border-stone-200">
                <SelectValue placeholder={t.filterStatus} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t.filterStatus}</SelectItem>
                <SelectItem value="Active">{t.active}</SelectItem>
                <SelectItem value="Paused">{t.paused}</SelectItem>
                <SelectItem value="Trial">{t.trial}</SelectItem>
                <SelectItem value="Lead">{t.lead}</SelectItem>
              </SelectContent>
            </Select>

            {/* Sorting */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-[#F4EBE1] whitespace-nowrap">
                {t.sortLabel}:
              </span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-10 rounded-xl w-44 bg-white text-stone-900 border-stone-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t.sortByActive}</SelectItem>
                  <SelectItem value="alpha">{t.sortByAlpha}</SelectItem>
                  <SelectItem value="created">{t.sortByCreated}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GRID OF CLASSES & GROUPS OR INDIVIDUAL STUDENTS */}
          {activeViewTab === "classes" ? (
            <div className="space-y-4">
              {filteredClasses.length === 0 ? (
                <div className="p-12 text-center bg-card rounded-2xl border border-border/80 space-y-4">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto" />
                  <h3 className="text-lg font-bold font-outfit">
                    {lang === "pt" ? "Nenhuma turma ou dupla encontrada" : "No classes or pairs found"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {lang === "pt"
                      ? "Crie turmas em grupo ou aulas em dupla mantendo os perfis individuais dos seus alunos."
                      : "Create group classes or pair lessons while preserving individual student profiles."}
                  </p>
                  <button
                    onClick={() => {
                      setEditingClass(null);
                      setClassModalType("group");
                      setIsClassModalOpen(true);
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#163020] text-[#F4EBE1] px-5 text-sm font-bold hover:bg-[#1a3825] cursor-pointer shadow-md"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{lang === "pt" ? "Criar Primeira Turma" : "Create First Class"}</span>
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredClasses.map((cls) => (
                    <ClassCard
                      key={cls.id}
                      cls={cls}
                      isPt={lang === "pt"}
                      onSelectClass={() => setSelectedClassId(cls.id)}
                      onEdit={() => {
                        setEditingClass(cls);
                        setClassModalType(cls.type);
                        setIsClassModalOpen(true);
                      }}
                      onOpenAttendance={() => {
                        setAttendanceClass(cls);
                        setIsAttendanceModalOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground bg-card rounded-2xl border border-border/80">
              {t.emptyList}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredStudents.map((student) => {
                const colorMeta = getBrandColorMeta(student.color_key);
                return (
                  <div
                    key={student.id}
                    onClick={() => {
                      setSelectedStudentId(student.id);
                      setHubTab("Overview");
                    }}
                    className={`group flex flex-col justify-between rounded-2xl border p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all cursor-pointer hover:-translate-y-0.5 ${
                      student.status?.toLowerCase() === "inactive"
                        ? "bg-muted/30 border-border/70 text-muted-foreground opacity-90"
                        : colorMeta.cardTintClass
                    } ${
                      student.color_key && student.color_key !== "default" && student.status?.toLowerCase() !== "inactive"
                        ? `border-l-4 ${colorMeta.borderClass}`
                        : "border-border"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                          {student.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-semibold py-0.5 px-2 tracking-wide shrink-0 ${
                            student.status?.toLowerCase() === "inactive"
                              ? "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 font-bold"
                              : getStatusStyles(student.status)
                          }`}
                        >
                          {student.status?.toLowerCase() === "inactive" ? "Inativo" : (
                            <>
                              {student.status === "Active" && t.active}
                              {student.status === "Paused" && t.paused}
                              {student.status === "Trial" && t.trial}
                              {student.status === "Lead" && t.lead}
                            </>
                          )}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        <span className="font-bold text-foreground/80">{student.level}</span> •{" "}
                        {student.focus}
                      </p>

                      {student.status?.toLowerCase() === "inactive" && (student.inactivationDate || student.inactivationReason) && (
                        <p className="mt-2 text-[11px] font-medium text-amber-800/80 dark:text-amber-300/80 bg-amber-500/10 p-1.5 rounded-lg">
                          {student.inactivationDate ? `Inativado em ${student.inactivationDate.split("-").reverse().join("/")}` : "Inativo"}
                          {student.inactivationReason ? ` • ${student.inactivationReason}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Calendar className="h-3.5 w-3.5" />
                        {t.studentCardClasses} {student.schedule}
                      </span>

                      {/* Group Badge */}
                      {student.type === "Group" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-lilac-soft px-2 py-0.5 text-[10px] font-bold text-lilac">
                          {student.groupSize} {t.studentsCount}
                        </span>
                      )}
                    </div>
                  </div>
              );
            })}
            </div>
          )}
        </>
      )}

      {/* CREATE/EDIT STUDENT MODAL DIALOG */}
      <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg rounded-2xl p-0 flex flex-col max-h-[90vh] bg-[#FAF8F5] overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border bg-[#FAF8F5] shrink-0">
            <DialogTitle className="font-outfit text-xl font-bold text-[#33411B]">
              {editingStudentIdForModal
                ? lang === "pt"
                  ? "Editar Perfil do Aluno"
                  : "Edit Student Profile"
                : t.modalTitle}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1 select-none">
              {lang === "pt"
                ? "Preencha as informações do aluno organizadas nos blocos abaixo."
                : "Fill out the student's details organized in the sections below."}
            </p>
          </DialogHeader>

          <form onSubmit={handleCreateStudent} className="flex flex-col flex-1 overflow-hidden">
            {/* Scrollable Body Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-[#FAF8F5]">
              {/* BLOCK 1: Informações do Aluno */}
              <div className="bg-white border border-border/80 p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-outfit text-sm font-bold text-[#33411B] border-b border-border/40 pb-2 select-none">
                  <User className="h-4 w-4 text-[#33411B]" />
                  {lang === "pt" ? "Informações do Aluno" : "Student Information"}
                </div>
                <div className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <Label htmlFor="std-name" className="text-xs font-semibold text-foreground flex items-center gap-1 select-none">
                      {t.fieldName} <span className="text-[#ED7034] font-bold">*</span>
                    </Label>
                    <Input
                      id="std-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder={t.placeholderName}
                      required
                      className="h-11 rounded-xl border-border bg-white focus-visible:ring-primary/20 focus-visible:border-primary"
                    />
                  </div>
                  {/* WhatsApp & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="std-whatsapp" className="text-xs font-semibold text-foreground flex items-center gap-1 select-none">
                        {t.fieldWhatsApp} <span className="text-[#ED7034] font-bold">*</span>
                      </Label>
                      <Input
                        id="std-whatsapp"
                        value={formWhatsApp}
                        onChange={(e) => setFormWhatsApp(e.target.value)}
                        placeholder={t.placeholderWhatsApp}
                        required
                        className="h-11 rounded-xl border-border bg-white focus-visible:ring-primary/20 focus-visible:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="std-email" className="text-xs font-semibold text-foreground select-none">
                        {t.fieldEmail}
                      </Label>
                      <Input
                        id="std-email"
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="e.g. john@email.com"
                        className="h-11 rounded-xl border-border bg-white focus-visible:ring-primary/20 focus-visible:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOCK 2: Curso e Nível */}
              <div className="bg-white border border-border/80 p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-outfit text-sm font-bold text-[#33411B] border-b border-border/40 pb-2 select-none">
                  <BookOpen className="h-4 w-4 text-[#33411B]" />
                  {lang === "pt" ? "Curso e Nível" : "Course & Level"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="std-level" className="text-xs font-semibold text-foreground select-none">
                      {t.fieldLevel}
                    </Label>
                    <Select value={formLevel} onValueChange={(val) => setFormLevel(val as CEFRLevel)}>
                      <SelectTrigger id="std-level" className="h-11 rounded-xl border-border bg-white">
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
                    <Label htmlFor="std-focus" className="text-xs font-semibold text-foreground select-none">
                      {lang === "pt" ? "Idioma Estudado" : "Language Studied"}
                    </Label>
                    <Select value={formFocus} onValueChange={(val) => setFormFocus(val)}>
                      <SelectTrigger id="std-focus" className="h-11 rounded-xl border-border bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hasConfiguredLanguages ? (
                          teacherLanguages.map((langItem) => (
                            <SelectItem key={langItem} value={langItem}>
                              {formatLanguageLabel(langItem, lang)}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value={formFocus || "English"}>
                            {formatLanguageLabel(formFocus || "English", lang)}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {!hasConfiguredLanguages && (
                      <p className="text-[11px] text-amber-700 font-medium pt-1">
                        {lang === "pt"
                          ? "Você ainda não informou quais idiomas ensina. "
                          : "You haven't specified your teaching languages yet. "}
                        <button
                          type="button"
                          onClick={() => navigate({ to: "/settings" })}
                          className="underline font-bold cursor-pointer hover:text-amber-900"
                        >
                          {lang === "pt" ? "Configurar idiomas" : "Configure languages"}
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="std-type" className="text-xs font-semibold text-foreground select-none">
                      {t.fieldType}
                    </Label>
                    <Select value={formType} onValueChange={(val) => setFormType(val as StudentType)}>
                      <SelectTrigger id="std-type" className="h-11 rounded-xl border-border bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Private">Private</SelectItem>
                        <SelectItem value="Group">Group</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formType === "Group" && !formLinkedGroupId && (
                    <div className="space-y-1">
                      <Label htmlFor="std-groupsize" className="text-xs font-semibold text-foreground select-none">
                        {t.fieldGroupSize}
                      </Label>
                      <Input
                        id="std-groupsize"
                        type="number"
                        min={2}
                        max={50}
                        value={formGroupSize}
                        onChange={(e) => setFormGroupSize(parseInt(e.target.value) || 3)}
                        className="h-11 rounded-xl border-border bg-white"
                      />
                    </div>
                  )}
                </div>

                <ColorSelector
                  value={formColorKey}
                  onChange={(val) => setFormColorKey(val)}
                  label={lang === "pt" ? "Cor de Identificação do Aluno (Padrão Bloom)" : "Student Brand Color"}
                />
              </div>

              {/* BLOCK 3: Plano Financeiro */}
              <div className="bg-white border border-border/80 p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-outfit text-sm font-bold text-[#33411B] border-b border-border/40 pb-2 select-none">
                  <DollarSign className="h-4 w-4 text-[#33411B]" />
                  {lang === "pt" ? "Plano Financeiro" : "Financial Plan"}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="std-package" className="text-xs font-semibold text-foreground select-none">
                    {t.fieldPackage}
                  </Label>
                  {packages.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border bg-secondary/10 text-center space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        {lang === "pt"
                          ? "Você ainda não cadastrou nenhum pacote."
                          : "You haven't created any packages yet."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold rounded-lg gap-1.5"
                        onClick={() => navigate({ to: "/finance" })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {lang === "pt" ? "Criar pacote" : "Create package"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Select
                        value={formPackageId}
                        onValueChange={(val) => {
                          setFormPackageId(val);
                          const selectedPkg = packages.find((p) => p.id === val);
                          if (selectedPkg) {
                            const defaultInst = selectedPkg.duration && selectedPkg.duration > 0 ? selectedPkg.duration : 6;
                            setFormInstallmentCount(defaultInst);
                          }
                        }}
                      >
                        <SelectTrigger id="std-package" className="h-11 rounded-xl border-border bg-white">
                          <SelectValue placeholder={lang === "pt" ? "Selecione um plano" : "Select a package"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none_value">{lang === "pt" ? "Nenhum plano" : "None"}</SelectItem>
                          {packages.map((pkg) => (
                            <SelectItem key={pkg.id} value={pkg.id}>
                              {pkg.name} — R$ {pkg.price} ({pkg.lessons} {lang === "pt" ? "aulas" : "lessons"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Enrollment Agreement Details for Selected Package */}
                      {(() => {
                        const selectedPkg = packages.find((p) => p.id === formPackageId);
                        if (!selectedPkg || formPackageId === "none_value") return null;

                        const isMonthly = selectedPkg.frequency === "Monthly" || selectedPkg.frequency === "monthly";
                        const totalPriceCents = (Number(selectedPkg.price) || 0) * 100;
                        const installmentCount = Math.max(1, Math.min(12, Math.round(formInstallmentCount || 1)));
                        const scheduleInfo = calculateInstallmentSchedule(totalPriceCents, installmentCount);
                        const lastDueDate = calculateLastDueDate(formFirstDueDate, installmentCount, formDueDay);

                        return (
                          <div className="space-y-4 pt-2 border-t border-border/50 animate-in fade-in duration-150">
                            {!isMonthly ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-foreground select-none">
                                    {lang === "pt" ? "Em quantas parcelas este aluno pagará?" : "In how many installments will this student pay?"}
                                  </Label>
                                  <Select
                                    value={installmentCount.toString()}
                                    onValueChange={(val) => setFormInstallmentCount(parseInt(val, 10) || 1)}
                                  >
                                    <SelectTrigger className="h-10 rounded-xl border-border bg-white text-sm font-semibold">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                                        <SelectItem key={num} value={num.toString()} className="font-medium">
                                          {num}x
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-foreground select-none">
                                    {lang === "pt" ? "Data da 1ª Parcela" : "First Due Date"}
                                  </Label>
                                  <Input
                                    type="date"
                                    value={formFirstDueDate}
                                    onChange={(e) => setFormFirstDueDate(e.target.value)}
                                    className="h-10 rounded-xl border-border bg-white text-sm"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-foreground select-none">
                                    {lang === "pt" ? "Forma de Pagamento" : "Payment Method"}
                                  </Label>
                                  <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
                                    <SelectTrigger className="h-10 rounded-xl border-border bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Pix">Pix</SelectItem>
                                      <SelectItem value="Bank Transfer">Boleto / Transferência</SelectItem>
                                      <SelectItem value="Credit Card">Cartão de Crédito</SelectItem>
                                      <SelectItem value="Cash">Dinheiro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-foreground select-none">
                                    {lang === "pt" ? "Data do 1º Vencimento" : "First Due Date"}
                                  </Label>
                                  <Input
                                    type="date"
                                    value={formFirstDueDate}
                                    onChange={(e) => setFormFirstDueDate(e.target.value)}
                                    className="h-10 rounded-xl border-border bg-white text-sm"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-foreground select-none">
                                    {lang === "pt" ? "Forma de Pagamento" : "Payment Method"}
                                  </Label>
                                  <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
                                    <SelectTrigger className="h-10 rounded-xl border-border bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Pix">Pix</SelectItem>
                                      <SelectItem value="Bank Transfer">Boleto / Transferência</SelectItem>
                                      <SelectItem value="Credit Card">Cartão de Crédito</SelectItem>
                                      <SelectItem value="Cash">Dinheiro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}

                            {/* Live Agreement Summary Card */}
                            <div className="p-4 rounded-xl border border-emerald-300/80 bg-emerald-50/70 space-y-2 text-xs font-figtree">
                              <div className="flex items-center gap-1.5 font-extrabold text-[#163020]">
                                <Receipt className="h-4 w-4 text-[#163020]" />
                                <span>{lang === "pt" ? "Resumo do Acordo Financeiro" : "Financial Agreement Summary"}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-stone-700">
                                <div>
                                  <span className="text-stone-500 font-medium">Pacote:</span>{" "}
                                  <strong className="text-stone-900 font-bold">{selectedPkg.name}</strong>
                                </div>
                                <div>
                                  <span className="text-stone-500 font-medium">{isMonthly ? "Valor Mensal:" : "Valor Total:"}</span>{" "}
                                  <strong className="text-stone-900 font-bold">{formatCentsToBRL(totalPriceCents)}</strong>
                                </div>
                                {!isMonthly ? (
                                  <>
                                    <div>
                                      <span className="text-stone-500 font-medium">Condição de Pagamento:</span>{" "}
                                      <strong className="text-stone-900 font-bold">
                                        {scheduleInfo.isUneven
                                          ? `${installmentCount - 1}x de ${formatCentsToBRL(scheduleInfo.baseAmountCents)} + 1x de ${formatCentsToBRL(scheduleInfo.lastAmountCents)}`
                                          : `${installmentCount}x de ${formatCentsToBRL(scheduleInfo.baseAmountCents)}`}
                                      </strong>
                                    </div>
                                    <div>
                                      <span className="text-stone-500 font-medium">1ª Parcela:</span>{" "}
                                      <strong className="text-stone-900 font-bold">{formFirstDueDate}</strong>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <span className="text-stone-500 font-medium">Última Parcela:</span>{" "}
                                      <strong className="text-stone-900 font-bold">{lastDueDate}</strong>
                                    </div>
                                  </>
                                ) : (
                                  <div>
                                    <span className="text-stone-500 font-medium">1º Vencimento:</span>{" "}
                                    <strong className="text-stone-900 font-bold">{formFirstDueDate}</strong>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* BLOCK 4: Agenda das Aulas */}
              <div className="bg-white border border-border/80 p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-outfit text-sm font-bold text-[#33411B] border-b border-border/40 pb-2 select-none">
                  <Calendar className="h-4 w-4 text-[#33411B]" />
                  {lang === "pt" ? "Agenda das Aulas" : "Class Schedule"}
                </div>

                {formType === "Group" && (
                  <div className="space-y-3 rounded-xl border border-border bg-secondary/10 p-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-foreground select-none">
                        {lang === "pt" ? "Opção de Agenda do Grupo" : "Group Schedule Option"}
                      </Label>
                      <Select
                        value={formLinkedGroupId ? "link" : "new"}
                        onValueChange={(val) => {
                          if (val === "link") {
                            const firstGroup = students.find((s) => s.type === "Group" && s.id !== editingStudentIdForModal);
                            setFormLinkedGroupId(firstGroup ? firstGroup.id : "");
                          } else {
                            setFormLinkedGroupId("");
                          }
                        }}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-border bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            {lang === "pt"
                              ? "Criar novo horário próprio para este grupo"
                              : "Create new custom schedule for this group"}
                          </SelectItem>
                          {students.some((s) => s.type === "Group" && s.id !== editingStudentIdForModal) && (
                            <SelectItem value="link">
                              {lang === "pt"
                                ? "Vincular a um grupo existente"
                                : "Link to an existing group"}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {formLinkedGroupId !== "" && (
                      <div className="space-y-1">
                        <Label
                          htmlFor="std-group-link"
                          className="text-xs font-semibold text-foreground select-none"
                        >
                          {lang === "pt" ? "Selecionar Grupo Existente" : "Select Existing Group"}
                        </Label>
                        <Select value={formLinkedGroupId} onValueChange={setFormLinkedGroupId}>
                          <SelectTrigger id="std-group-link" className="h-11 rounded-xl border-border bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {students
                              .filter((s) => s.type === "Group" && s.id !== editingStudentIdForModal)
                              .map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.name} ({g.schedule})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {(!formLinkedGroupId || formType === "Private") && (
                  <div className="space-y-4">

                    {/* Frequency selector */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-foreground select-none">
                        {lang === "pt" ? "Quantidade de aulas por semana" : "Classes per week"}
                      </Label>
                      <div className="flex gap-2 flex-wrap">
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleFormFrequencyChange(n)}
                            className={`w-9 h-9 rounded-full text-sm font-semibold border transition-colors
                              ${formClassFrequency === n
                                ? "bg-[#33411B] text-white border-[#33411B]"
                                : "bg-white text-foreground border-border hover:border-[#33411B]"
                              }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Global fields: frequency, start date, end date, timezone */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="std-frequency" className="text-xs font-semibold text-foreground select-none">
                          {lang === "pt" ? "Frequência" : "Recurrence"}
                        </Label>
                        <Select value={formFrequency} onValueChange={(val) => setFormFrequency(val as any)}>
                          <SelectTrigger id="std-frequency" className="h-11 rounded-xl border-border bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Weekly">{lang === "pt" ? "Semanal" : "Weekly"}</SelectItem>
                            <SelectItem value="Bi-weekly">{lang === "pt" ? "Quinzenal" : "Bi-weekly"}</SelectItem>
                            <SelectItem value="Monthly">{lang === "pt" ? "Mensal" : "Monthly"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="std-tz" className="text-xs font-semibold text-foreground flex items-center gap-1 select-none">
                          {lang === "pt" ? "Fuso Horário" : "Time Zone"}
                        </Label>
                        <Input
                          id="std-tz"
                          value={formTimezone}
                          onChange={(e) => setFormTimezone(e.target.value)}
                          placeholder="America/Sao_Paulo"
                          className="h-11 rounded-xl border-border bg-white text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="std-startdate" className="text-xs font-semibold text-foreground flex items-center gap-1 select-none">
                          {lang === "pt" ? "Data de Início" : "Start Date"} <span className="text-[#ED7034] font-bold">*</span>
                        </Label>
                        <Input
                          id="std-startdate"
                          type="date"
                          value={formStartDate}
                          onChange={(e) => setFormStartDate(e.target.value)}
                          required
                          className="h-11 rounded-xl border-border bg-white text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="std-enddate" className="text-xs font-semibold text-foreground select-none">
                          {lang === "pt" ? "Data de Término" : "End Date (Opcional)"}
                        </Label>
                        <Input
                          id="std-enddate"
                          type="date"
                          value={formEndDate}
                          onChange={(e) => setFormEndDate(e.target.value)}
                          className="h-11 rounded-xl border-border bg-white text-sm"
                        />
                      </div>
                    </div>

                    {/* Per-class dynamic inputs */}
                    {formSchedulesList.map((sch, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border/60 bg-secondary/5 p-4 space-y-3"
                      >
                        <p className="text-xs font-bold text-[#33411B] select-none">
                          {lang === "pt" ? `Aula ${idx + 1}` : `Class ${idx + 1}`}
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-foreground select-none">
                              {lang === "pt" ? "Dia da semana" : "Weekday"}
                            </Label>
                            <Select
                              value={sch.weekday}
                              onValueChange={(val) => {
                                const updated = [...formSchedulesList];
                                updated[idx] = { ...updated[idx], weekday: val };
                                setFormSchedulesList(updated);
                              }}
                            >
                              <SelectTrigger className="h-10 rounded-xl border-border bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Monday">{lang === "pt" ? "Segunda-feira" : "Monday"}</SelectItem>
                                <SelectItem value="Tuesday">{lang === "pt" ? "Terça-feira" : "Tuesday"}</SelectItem>
                                <SelectItem value="Wednesday">{lang === "pt" ? "Quarta-feira" : "Wednesday"}</SelectItem>
                                <SelectItem value="Thursday">{lang === "pt" ? "Quinta-feira" : "Thursday"}</SelectItem>
                                <SelectItem value="Friday">{lang === "pt" ? "Sexta-feira" : "Friday"}</SelectItem>
                                <SelectItem value="Saturday">{lang === "pt" ? "Sábado" : "Saturday"}</SelectItem>
                                <SelectItem value="Sunday">{lang === "pt" ? "Domingo" : "Sunday"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-foreground flex items-center gap-1 select-none">
                              {lang === "pt" ? "Horário" : "Start Time"} <span className="text-[#ED7034] font-bold">*</span>
                            </Label>
                            <Input
                              type="time"
                              value={sch.startTime}
                              onChange={(e) => {
                                const updated = [...formSchedulesList];
                                updated[idx] = { ...updated[idx], startTime: e.target.value };
                                setFormSchedulesList(updated);
                              }}
                              required
                              className="h-10 rounded-xl border-border bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-foreground select-none">
                              {lang === "pt" ? "Duração" : "Duration"}
                            </Label>
                            <Select
                              value={String(sch.duration)}
                              onValueChange={(val) => {
                                const updated = [...formSchedulesList];
                                updated[idx] = { ...updated[idx], duration: parseInt(val, 10) };
                                setFormSchedulesList(updated);
                              }}
                            >
                              <SelectTrigger className="h-10 rounded-xl border-border bg-white">
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
                            <Label className="text-xs font-semibold text-foreground select-none">
                              {lang === "pt" ? "Formato" : "Format"}
                            </Label>
                            <Select
                              value={sch.deliveryMode}
                              onValueChange={(val) => {
                                const updated = [...formSchedulesList];
                                updated[idx] = { ...updated[idx], deliveryMode: val as "Online" | "In person" };
                                setFormSchedulesList(updated);
                              }}
                            >
                              <SelectTrigger className="h-10 rounded-xl border-border bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Online">Online</SelectItem>
                                <SelectItem value="In person">{lang === "pt" ? "Presencial" : "In person"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-foreground select-none">
                            {sch.deliveryMode === "Online"
                              ? (lang === "pt" ? "Link (Zoom/Meet)" : "Meeting Link")
                              : (lang === "pt" ? "Endereço" : "Location")}
                          </Label>
                          <Input
                            value={sch.locationLink}
                            onChange={(e) => {
                              const updated = [...formSchedulesList];
                              updated[idx] = { ...updated[idx], locationLink: e.target.value };
                              setFormSchedulesList(updated);
                            }}
                            placeholder={sch.deliveryMode === "Online" ? "https://zoom.us/j/..." : "Ex: Av. Paulista, 1000"}
                            className="h-10 rounded-xl border-border bg-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BLOCK 5: Observações */}
              <div className="bg-white border border-border/80 p-5 rounded-2xl shadow-sm space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 font-outfit text-sm font-bold text-[#33411B] border-b border-border/40 pb-2 select-none">
                  <FileText className="h-4 w-4 text-[#33411B]" />
                  {lang === "pt" ? "Observações" : "Notes"}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="std-notes" className="text-xs font-semibold text-foreground select-none">
                    {lang === "pt" ? "Notas Extras" : "Additional Notes"}
                  </Label>
                  <textarea
                    id="std-notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder={
                      lang === "pt"
                        ? "ex: Prefere foco em conversação."
                        : "e.g. Focus on conversation preferred."
                    }
                    className="w-full min-h-[100px] rounded-xl border border-border bg-white p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* Fixed Footer Container */}
            <div className="p-6 pt-4 border-t border-border bg-[#FAF8F5] flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCancelAttempt}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#33411B] bg-white px-5 text-sm font-bold text-[#33411B] hover:bg-[#33411B]/5 transition-all cursor-pointer shadow-sm"
              >
                {t.btnCancel}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#33411B] px-5 text-sm font-bold text-white hover:bg-[#33411B]/90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {isSaving ? (
                  <span>{lang === "pt" ? "Salvando..." : "Saving..."}</span>
                ) : editingStudentIdForModal ? (
                  t.btnSave
                ) : (
                  t.btnCreate
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ZERO STUDENTS WELCOME DIALOG */}
      <Dialog
        open={showZeroStudentsWelcome}
        onOpenChange={(open) => {
          setShowZeroStudentsWelcome(open);
          if (!open) {
            localStorage.setItem("bloom.students_welcome_dismissed", "true");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-3xl p-6 bg-[#FAF7F2] border border-stone-200 shadow-2xl text-center space-y-6 select-none font-figtree">
          <div className="h-16 w-16 rounded-2xl bg-[#163020] text-[#F4EBE1] mx-auto flex items-center justify-center shadow-md animate-bounce duration-1000">
            <Sparkles className="h-8 w-8 text-[#F4EBE1]" />
          </div>

          <div className="space-y-2">
            <DialogTitle className="font-outfit text-2xl font-extrabold text-[#163020] tracking-tight">
              {lang === "pt" ? "Boas-vindas ao seu Espaço de Alunos! 🌱" : "Welcome to your Students Hub! 🌱"}
            </DialogTitle>
            <p className="text-sm text-stone-600 leading-relaxed font-medium">
              {lang === "pt"
                ? "Sua plataforma já está configurada com suas preferências, pacotes e metas. Agora é hora de adicionar seus alunos!"
                : "Your platform is pre-configured with your preferences, packages, and goals. Now it's time to add your students!"}
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => {
                setShowZeroStudentsWelcome(false);
                localStorage.setItem("bloom.students_welcome_dismissed", "true");
                setEditingStudentIdForModal(null);
                setIsModalOpen(true);
              }}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-extrabold text-sm shadow-md transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{lang === "pt" ? "Cadastrar Primeiro Aluno" : "Register First Student"}</span>
            </button>

            <button
              onClick={() => {
                setShowZeroStudentsWelcome(false);
                localStorage.setItem("bloom.students_welcome_dismissed", "true");
                toast.info(
                  lang === "pt"
                    ? "A funcionalidade de importação em lote via planilha estará disponível em breve. Cadastre os alunos manualmente a seguir."
                    : "Bulk spreadsheet import will be available soon. Register students manually below."
                );
                setEditingStudentIdForModal(null);
                setIsModalOpen(true);
              }}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 font-bold text-sm shadow-sm transition-all cursor-pointer"
            >
              <Users className="h-4 w-4 text-emerald-800" />
              <span>{lang === "pt" ? "Importar Alunos (Em breve)" : "Import Students (Coming soon)"}</span>
            </button>

            <button
              onClick={() => {
                setShowZeroStudentsWelcome(false);
                localStorage.setItem("bloom.students_welcome_dismissed", "true");
              }}
              className="text-xs font-semibold text-stone-400 hover:text-stone-600 transition-colors cursor-pointer pt-1"
            >
              {lang === "pt" ? "Explorar painel primeiro" : "Explore dashboard first"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ADD TYPE SELECTION MODAL */}
      <AddTypeSelectionModal
        open={isAddSelectionOpen}
        onClose={() => setIsAddSelectionOpen(false)}
        onSelectIndividual={() => handleOpenModal()}
        onSelectPair={() => {
          setEditingClass(null);
          setClassModalType("pair");
          setIsClassModalOpen(true);
        }}
        onSelectGroup={() => {
          setEditingClass(null);
          setClassModalType("group");
          setIsClassModalOpen(true);
        }}
      />

      {/* CLASS FORM MODAL */}
      <ClassFormModal
        open={isClassModalOpen}
        onClose={() => {
          setIsClassModalOpen(false);
          setEditingClass(null);
        }}
        initialType={classModalType}
        existingClass={editingClass}
        availableStudents={students.map((s) => ({ id: s.id, name: s.name }))}
        onSuccess={() => {
          if (user) {
            fetchTeacherClasses(user.id).then(setClassesList);
          }
        }}
      />

      {/* CLASS SESSION ATTENDANCE MODAL */}
      {attendanceClass && (
        <ClassSessionAttendanceModal
          open={isAttendanceModalOpen}
          onClose={() => {
            setIsAttendanceModalOpen(false);
            setAttendanceClass(null);
          }}
          classEntity={attendanceClass}
        />
      )}

      {/* PACKAGE RENEWAL MODAL FOR STUDENT PROFILE */}
      {user && selectedStudentId && (
        <PackageRenewalModal
          isOpen={isStudentRenewalModalOpen}
          onClose={() => setIsStudentRenewalModalOpen(false)}
          teacherId={user.id}
          studentId={selectedStudentId}
          studentName={selectedStudent?.name || "Aluno"}
          currentSummary={financialSummary}
          onRenewalCompleted={async () => {
            loadStudentFinancialData();
          }}
        />
      )}
      {/* INACTIVATE STUDENT MODAL */}
      {user && studentToInactivate && (
        <InactivateStudentModal
          isOpen={isInactivateModalOpen}
          onClose={() => {
            setIsInactivateModalOpen(false);
            setStudentToInactivate(null);
          }}
          studentId={studentToInactivate.id}
          teacherId={user.id}
          studentName={studentToInactivate.name}
          packageName={packages.find((p) => p.id === studentToInactivate.packageId)?.name}
          activeClassCount={classesList.filter((c) => (c.members || []).some((m: any) => m.student_id === studentToInactivate.id)).length}
          onSuccess={({ inactivationDate, inactivationReason }) => {
            setStudents((prev) =>
              prev.map((s) =>
                s.id === studentToInactivate.id
                  ? {
                      ...s,
                      status: "Inactive" as StudentStatus,
                      inactivationDate,
                      inactivationReason,
                    }
                  : s
              )
            );
          }}
        />
      )}
    </div>
  );
}
