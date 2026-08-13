import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Users,
  User,
  Plus,
  Check,
  Clock,
  Calendar,
  Sparkles,
  X,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Edit2,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  ClassEntity,
  ClassMember,
  ClassSchedule,
  AttendanceStatusType,
} from "@/types/classes";
import {
  ClassWithDetails,
  saveClassAndRelations,
} from "@/lib/class-sync";
import {
  AttendanceStatus,
  LessonPlan,
  fetchAttendanceForEvents,
  getOrCreateClassEventForDate,
  saveAttendanceRecords,
  saveLessonPlans,
} from "@/lib/lesson-plans";
import { ClassLessonPlanTable } from "@/components/bloom/ClassLessonPlanTable";
import { ColorSelector } from "@/components/bloom/ColorSelector";
import { getBrandColorMeta } from "@/lib/brand-colors";

/* =========================================================================
   1. ADD TYPE SELECTION MODAL (Individual vs Pair vs Group)
   ========================================================================= */
interface AddTypeSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onSelectIndividual: () => void;
  onSelectPair: () => void;
  onSelectGroup: () => void;
}

export function AddTypeSelectionModal({
  open,
  onClose,
  onSelectIndividual,
  onSelectPair,
  onSelectGroup,
}: AddTypeSelectionModalProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-3xl p-6 bg-[#FAF7F2] border border-stone-200 shadow-2xl text-center space-y-6 select-none font-figtree">
        <div className="space-y-2">
          <DialogTitle className="font-outfit text-2xl font-extrabold text-[#163020] tracking-tight">
            {t("classes.whatToAddTitle")}
          </DialogTitle>
          <p className="text-sm text-stone-600 font-medium">
            {t("classes.whatToAddSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* Individual Student */}
          <button
            onClick={() => {
              onClose();
              onSelectIndividual();
            }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-stone-200 bg-white hover:border-[#163020] hover:bg-stone-50 transition-all text-left group cursor-pointer shadow-sm"
          >
            <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <User className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <span className="font-bold text-stone-900 text-base font-outfit block">
                {t("classes.individualStudentTitle")}
              </span>
              <p className="text-xs text-stone-500 font-medium">
                {t("classes.individualStudentDesc")}
              </p>
            </div>
          </button>

          {/* Pair */}
          <button
            onClick={() => {
              onClose();
              onSelectPair();
            }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-stone-200 bg-white hover:border-[#163020] hover:bg-stone-50 transition-all text-left group cursor-pointer shadow-sm"
          >
            <div className="h-12 w-12 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Users className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <span className="font-bold text-stone-900 text-base font-outfit block">
                {t("classes.pairClassTitle")}
              </span>
              <p className="text-xs text-stone-500 font-medium">
                {t("classes.pairClassDesc")}
              </p>
            </div>
          </button>

          {/* Group */}
          <button
            onClick={() => {
              onClose();
              onSelectGroup();
            }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-stone-200 bg-white hover:border-[#163020] hover:bg-stone-50 transition-all text-left group cursor-pointer shadow-sm"
          >
            <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <span className="font-bold text-stone-900 text-base font-outfit block">
                {t("classes.groupClassTitle")}
              </span>
              <p className="text-xs text-stone-500 font-medium">
                {t("classes.groupClassDesc")}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   2. CLASS FORM MODAL (Create/Edit Pair or Group Class)
   ========================================================================= */
interface ClassFormModalProps {
  open: boolean;
  onClose: () => void;
  initialType?: "pair" | "group";
  existingClass?: ClassWithDetails | null;
  availableStudents: Array<{ id: string; name: string }>;
  onSuccess: () => void;
}

export function ClassFormModal({
  open,
  onClose,
  initialType = "group",
  existingClass,
  availableStudents,
  onSuccess,
}: ClassFormModalProps) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isPt = lang === "pt";

  const [name, setName] = useState("");
  const [type, setType] = useState<"pair" | "group">(initialType);
  const [language, setLanguage] = useState("English");
  const [level, setLevel] = useState("B1");
  const [status, setStatus] = useState<"active" | "paused" | "archived">("active");
  const [colorKey, setColorKey] = useState<string>("default");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [schedulesList, setSchedulesList] = useState<
    Array<{ weekday: string; startTime: string; duration: number; deliveryMode: "Online" | "In person"; locationLink?: string }>
  >([{ weekday: "Monday", startTime: "19:00", duration: 60, deliveryMode: "Online", locationLink: "" }]);

  // Inline student creation state
  const [showInlineStudent, setShowInlineStudent] = useState(false);
  const [inlineName, setInlineName] = useState("");
  const [inlineWhatsApp, setInlineWhatsApp] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existingClass) {
      setName(existingClass.name);
      setType(existingClass.type);
      setLanguage(existingClass.language || "English");
      setLevel(existingClass.level || "B1");
      setStatus(existingClass.status);
      setColorKey(existingClass.color_key || "default");
      setSelectedStudentIds((existingClass.members || []).map((m) => m.student_id));
      if (existingClass.schedules && existingClass.schedules.length > 0) {
        setSchedulesList(
          existingClass.schedules.map((s) => ({
            weekday: s.weekday,
            startTime: s.start_time ? s.start_time.substring(0, 5) : "19:00",
            duration: s.duration || 60,
            deliveryMode: s.delivery_mode || "Online",
            locationLink: s.location_link || "",
          }))
        );
      }
    } else {
      setName("");
      setType(initialType);
      setLanguage("English");
      setLevel("B1");
      setStatus("active");
      setColorKey("default");
      setSelectedStudentIds([]);
      setSchedulesList([{ weekday: "Monday", startTime: "19:00", duration: 60, deliveryMode: "Online", locationLink: "" }]);
    }
  }, [existingClass, initialType, open]);

  const toggleStudent = (stdId: string) => {
    if (selectedStudentIds.includes(stdId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== stdId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, stdId]);
    }
  };

  const handleInlineStudentCreate = async () => {
    if (!inlineName.trim() || !user) return;
    try {
      const { data: newStudent, error } = await supabase
        .from("students")
        .insert({
          teacher_id: user.id,
          full_name: inlineName.trim(),
          phone: inlineWhatsApp.trim(),
          language_studied: language,
          level: level,
          type: "Private",
          status: "Active",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(isPt ? `Aluno ${newStudent.full_name} criado com sucesso!` : `Student ${newStudent.full_name} created!`);
      setSelectedStudentIds((prev) => [...prev, newStudent.id]);
      availableStudents.push({ id: newStudent.id, name: newStudent.full_name });
      setInlineName("");
      setInlineWhatsApp("");
      setShowInlineStudent(false);
    } catch (err: any) {
      toast.error(err.message || "Error creating student");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setIsSaving(true);
    try {
      await saveClassAndRelations(
        user.id,
        {
          name: name.trim(),
          type,
          language,
          level: level as any,
          status,
          color_key: colorKey,
        },
        selectedStudentIds,
        schedulesList,
        existingClass?.id
      );

      toast.success(isPt ? "Turma salva com sucesso!" : "Class saved successfully!");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Save class error:", err);
      toast.error(err.message || "Failed to save class");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-3xl p-0 bg-[#FAF7F2] border border-stone-200 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none font-figtree">
        <DialogHeader className="p-6 pb-4 border-b border-stone-200 bg-white shrink-0">
          <DialogTitle className="font-outfit text-xl font-bold text-[#163020]">
            {existingClass
              ? isPt ? "Editar Turma / Dupla" : "Edit Class / Pair"
              : type === "pair"
              ? isPt ? "Nova Aula em Dupla" : "New Pair Class"
              : isPt ? "Nova Turma / Grupo" : "New Class / Group"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Name & Type */}
            <div className="space-y-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-stone-700">
                  {isPt ? "Nome da Turma" : "Class Name"} <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isPt ? "ex: Conversation B1 - Terça" : "e.g. Conversation B1 - Tuesday"}
                  required
                  className="h-11 rounded-xl border-stone-300 bg-stone-50 font-semibold text-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-stone-700">{isPt ? "Modalidade" : "Type"}</Label>
                  <Select value={type} onValueChange={(val: any) => setType(val)}>
                    <SelectTrigger className="h-11 rounded-xl border-stone-300 bg-stone-50 font-semibold text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pair">{isPt ? "Dupla (2 alunos)" : "Pair (2 students)"}</SelectItem>
                      <SelectItem value="group">{isPt ? "Grupo (3+ alunos)" : "Group (3+ students)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-stone-700">{isPt ? "Nível" : "Level"}</Label>
                  <Select value={level} onValueChange={(val) => setLevel(val)}>
                    <SelectTrigger className="h-11 rounded-xl border-stone-300 bg-stone-50 font-semibold text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>{lvl}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <ColorSelector
                value={colorKey}
                onChange={(val) => setColorKey(val)}
                label={isPt ? "Cor de Identificação da Turma (Padrão Bloom)" : "Class Brand Color"}
              />
            </div>

            {/* Select Members */}
            <div className="space-y-3 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-stone-700 uppercase tracking-wider font-outfit">
                  {isPt ? `Alunos da Turma (${selectedStudentIds.length})` : `Class Members (${selectedStudentIds.length})`}
                </Label>
                <button
                  type="button"
                  onClick={() => setShowInlineStudent(!showInlineStudent)}
                  className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isPt ? "Criar novo aluno" : "New student"}</span>
                </button>
              </div>

              {/* Inline Student Form */}
              {showInlineStudent && (
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-2">
                  <span className="text-xs font-bold text-emerald-900 block">
                    {isPt ? "Cadastrar aluno e adicionar à turma:" : "Register & add student to class:"}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder={isPt ? "Nome completo" : "Full name"}
                      value={inlineName}
                      onChange={(e) => setInlineName(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                    <Input
                      placeholder={isPt ? "WhatsApp" : "WhatsApp"}
                      value={inlineWhatsApp}
                      onChange={(e) => setInlineWhatsApp(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleInlineStudentCreate}
                    className="w-full h-8 bg-[#163020] text-white text-xs font-bold rounded-lg hover:bg-emerald-950 cursor-pointer"
                  >
                    {isPt ? "Salvar e Selecionar" : "Save & Select"}
                  </button>
                </div>
              )}

              {/* Available Students Checkbox List */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {availableStudents.map((std) => {
                  const selected = selectedStudentIds.includes(std.id);
                  return (
                    <button
                      key={std.id}
                      type="button"
                      onClick={() => toggleStudent(std.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        selected
                          ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                          : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      <span>{std.name}</span>
                      <div
                        className={`h-4 w-4 rounded flex items-center justify-center ${
                          selected ? "bg-emerald-500 text-white" : "border border-stone-300"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedules */}
            <div className="space-y-3 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
              <Label className="text-xs font-bold text-stone-700 uppercase tracking-wider font-outfit">
                {isPt ? "Horários das Aulas" : "Class Schedule Slots"}
              </Label>

              {schedulesList.map((sch, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <Select
                    value={sch.weekday}
                    onValueChange={(val) => {
                      const copy = [...schedulesList];
                      copy[idx].weekday = val;
                      setSchedulesList(copy);
                    }}
                  >
                    <SelectTrigger className="h-9 w-28 text-xs font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="time"
                    value={sch.startTime}
                    onChange={(e) => {
                      const copy = [...schedulesList];
                      copy[idx].startTime = e.target.value;
                      setSchedulesList(copy);
                    }}
                    className="h-9 w-24 text-xs font-bold bg-white"
                  />

                  <span className="text-xs text-stone-400 font-bold">60 min</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-stone-300 bg-white text-stone-700 font-bold text-xs hover:bg-stone-100 cursor-pointer"
            >
              {isPt ? "Cancelar" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-11 px-6 rounded-xl bg-[#163020] text-[#F4EBE1] font-bold text-xs hover:bg-[#1a3825] cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (isPt ? "Salvando..." : "Saving...") : (isPt ? "Salvar Turma" : "Save Class")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   3. CLASS SESSION & ATTENDANCE MODAL
   ========================================================================= */
interface ClassSessionAttendanceModalProps {
  open: boolean;
  onClose: () => void;
  classEntity: ClassWithDetails;
  sessionDate?: string;
}

export function ClassSessionAttendanceModal({
  open,
  onClose,
  classEntity,
  sessionDate = new Date().toISOString().split("T")[0],
}: ClassSessionAttendanceModalProps) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isPt = lang === "pt";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [attendanceList, setAttendanceList] = useState<
    Array<{ student_id: string; student_name: string; status: AttendanceStatus; notes?: string }>
  >([]);

  useEffect(() => {
    if (!open || !user || !classEntity) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const resolved = await getOrCreateClassEventForDate(
          user.id,
          { id: classEntity.id, name: classEntity.name, level: classEntity.level },
          sessionDate,
          (classEntity.schedules?.[0]?.start_time || "19:00").slice(0, 5),
          classEntity.schedules?.[0]?.duration || 60
        );

        setPlan(resolved);
        setTopic(resolved?.content || "");
        setNotes(resolved?.notes || "");

        const existing = resolved
          ? (await fetchAttendanceForEvents([resolved.event_id]))[resolved.event_id] || []
          : [];

        const activeMembers = (classEntity.members || []).filter(
          (m) => m.status === "active" && !m.left_at
        );

        setAttendanceList(
          activeMembers.map((m) => {
            const found = existing.find((a) => a.student_id === m.student_id);
            return {
              student_id: m.student_id,
              student_name: m.student_name || "Student",
              status: (found?.status || "present") as AttendanceStatus,
              notes: found?.notes || "",
            };
          })
        );
      } catch (err) {
        console.error("Error loading session attendance:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open, user, classEntity, sessionDate]);

  const updateStatus = (stdId: string, status: AttendanceStatus) => {
    setAttendanceList((prev) =>
      prev.map((a) => (a.student_id === stdId ? { ...a, status } : a))
    );
  };

  const handleSave = async () => {
    if (!user || !plan) return;
    setSaving(true);
    try {
      await saveLessonPlans(user.id, [
        { ...plan, content: topic, notes, completed: true, event_status: "Completed" },
      ]);

      await saveAttendanceRecords(
        user.id,
        plan.event_id,
        attendanceList.map((a) => ({ student_id: a.student_id, status: a.status, notes: a.notes }))
      );

      toast.success(isPt ? "Chamada e aula salvas com sucesso! 🌱" : "Attendance & lesson saved successfully! 🌱");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-3xl p-0 bg-[#FAF7F2] border border-stone-200 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none font-figtree">
        <DialogHeader className="p-6 pb-4 border-b border-stone-200 bg-white shrink-0">
          <DialogTitle className="font-outfit text-xl font-bold text-[#163020]">
            {isPt ? `Chamada de Aula — ${classEntity.name}` : `Class Session Attendance — ${classEntity.name}`}
          </DialogTitle>
          <span className="text-xs text-stone-500 font-semibold">{sessionDate}</span>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-800" />
            </div>
          ) : (
            <>
              {/* Topic Input */}
              <div className="space-y-1 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                <Label className="text-xs font-bold text-stone-700">
                  {isPt ? "Conteúdo / Tópico da Aula" : "Lesson Topic / Content"}
                </Label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={isPt ? "ex: Present Perfect vs Past Simple" : "e.g. Present Perfect vs Past Simple"}
                  className="h-10 text-xs font-semibold bg-stone-50"
                />
              </div>

              {/* Attendance List */}
              <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                <Label className="text-xs font-bold text-stone-700 uppercase tracking-wider font-outfit">
                  {isPt ? "Registro de Presença Individual" : "Per-Student Attendance"}
                </Label>

                <div className="space-y-2">
                  {attendanceList.map((item) => (
                    <div
                      key={item.student_id}
                      className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                    >
                      <span className="font-bold text-xs text-stone-900">{item.student_name}</span>

                      {/* Status options */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateStatus(item.student_id, "present")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item.status === "present"
                              ? "bg-emerald-700 text-white shadow-sm"
                              : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
                          }`}
                        >
                          {isPt ? "Presente" : "Present"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(item.student_id, "absent")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item.status === "absent"
                              ? "bg-rose-700 text-white shadow-sm"
                              : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
                          }`}
                        >
                          {isPt ? "Falta" : "Absent"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(item.student_id, "late")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item.status === "late"
                              ? "bg-amber-600 text-white shadow-sm"
                              : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
                          }`}
                        >
                          {isPt ? "Atrasado" : "Late"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(item.student_id, "excused")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item.status === "excused"
                              ? "bg-sky-700 text-white shadow-sm"
                              : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
                          }`}
                        >
                          {isPt ? "Justificada" : "Excused"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-xl border border-stone-300 bg-white text-stone-700 font-bold text-xs hover:bg-stone-100 cursor-pointer"
          >
            {isPt ? "Fechar" : "Close"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-11 px-6 rounded-xl bg-[#163020] text-[#F4EBE1] font-bold text-xs hover:bg-[#1a3825] cursor-pointer disabled:opacity-50"
          >
            {saving ? (isPt ? "Salvando..." : "Saving...") : (isPt ? "Salvar Presença" : "Save Attendance")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   4. CLASS CARD UI
   ========================================================================= */
export function ClassCard({
  cls,
  onEdit,
  onOpenAttendance,
  onSelectClass,
  isPt,
}: {
  cls: ClassWithDetails;
  onEdit: () => void;
  onOpenAttendance: () => void;
  onSelectClass?: () => void;
  isPt: boolean;
}) {
  const { t, formatWeekday } = useLanguage();
  const colorMeta = getBrandColorMeta(cls.color_key);

  return (
    <div
      onClick={onSelectClass}
      className={`p-5 rounded-3xl border shadow-sm hover:shadow-md transition-all space-y-4 font-figtree cursor-pointer group ${colorMeta.cardTintClass} ${
        cls.color_key && cls.color_key !== "default"
          ? `border-l-4 ${colorMeta.borderClass}`
          : "border-stone-200/80 bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-stone-900 text-lg font-outfit group-hover:text-emerald-900 transition-colors">
              {cls.name}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold font-outfit uppercase ${
                cls.color_key && cls.color_key !== "default"
                  ? colorMeta.badgeClass
                  : cls.type === "pair"
                  ? "bg-teal-100 text-teal-800"
                  : "bg-emerald-100 text-emerald-900"
              }`}
            >
              {cls.type === "pair" ? t("classes.pairBadge") : t("classes.groupBadge")}
            </span>
          </div>
          <span className="text-xs text-stone-500 font-semibold block">
            {cls.language} • {t("students.fieldLevel")} {cls.level}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
          title={t("classes.editClass")}
        >
          <Edit2 className="h-4 w-4" />
        </button>
      </div>

      {/* Members list */}
      <div className="space-y-1 pt-2 border-t border-stone-100">
        <span className="text-xs font-bold text-stone-400 uppercase font-outfit">
          {t("classes.classMembersLabel").replace("{count}", String(cls.members.length))}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {cls.members.map((m) => (
            <span
              key={m.id}
              className="px-2.5 py-1 rounded-xl bg-stone-100 text-stone-800 font-semibold text-xs border border-stone-200/70"
            >
              {m.student_name}
            </span>
          ))}
        </div>
      </div>

      {/* Schedule */}
      {cls.schedules && cls.schedules.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-stone-600 font-semibold pt-1">
          <Clock className="h-3.5 w-3.5 text-emerald-800" />
          <span>
            {cls.schedules.map((s) => `${formatWeekday(s.weekday)} ${s.start_time?.substring(0, 5)}`).join(", ")}
          </span>
        </div>
      )}

      {/* Action CTA */}
      <div className="pt-2 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenAttendance();
          }}
          className="flex-1 h-10 rounded-2xl bg-[#163020] text-[#F4EBE1] font-bold text-xs hover:bg-[#1a3825] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{t("classes.takeAttendanceBtn")}</span>
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   5. REGISTER CLASS LESSON MODAL
   ========================================================================= */
export function RegisterClassLessonModal({
  open,
  onClose,
  classId,
  className,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  onSuccess: () => void;
}) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isPt = lang === "pt";

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("19:00");
  const [duration, setDuration] = useState(60);
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [homework, setHomework] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"completed" | "scheduled" | "cancelled">("completed");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !classId) return;

    setIsSaving(true);
    try {
      await createClassSession(user.id, classId, {
        date,
        start_time: startTime,
        duration,
        topic,
        content,
        homework,
        notes,
        status,
      });

      toast.success(isPt ? "Aula registrada com sucesso!" : "Class lesson registered successfully!");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to register class lesson:", err);
      toast.error(err.message || (isPt ? "Erro ao registrar aula." : "Error registering lesson."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-3xl p-6 bg-[#FAF7F2] border border-stone-200 shadow-2xl select-none font-figtree space-y-4">
        <DialogHeader>
          <DialogTitle className="font-outfit text-xl font-extrabold text-[#163020]">
            {isPt ? `Registrar Aula — ${className}` : `Register Lesson — ${className}`}
          </DialogTitle>
          <p className="text-xs text-stone-500 font-medium">
            {isPt
              ? "Esta aula será compartilhada com todos os alunos da turma no histórico do grupo."
              : "This lesson will be shared with all class members in the group history."}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-stone-700">{isPt ? "Data da Aula" : "Lesson Date"}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="h-10 rounded-xl bg-white border-stone-300"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-stone-700">{isPt ? "Horário de Início" : "Start Time"}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="h-10 rounded-xl bg-white border-stone-300"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-stone-700">{isPt ? "Tópico Principal" : "Lesson Topic"}</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={isPt ? "Ex: Present Perfect Continuous vs Past Simple" : "Ex: Present Perfect Continuous"}
              required
              className="h-10 rounded-xl bg-white border-stone-300"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-stone-700">{isPt ? "Conteúdo Ministrado" : "Lesson Content"}</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder={isPt ? "Explicação de regras, frases práticas, exercícios em dupla..." : "Lesson overview..."}
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#163020]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-stone-700">{isPt ? "Tarefa de Casa (Homework)" : "Homework"}</Label>
            <Input
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
              placeholder={isPt ? "Ex: Página 42, exercícios 1 ao 5" : "Ex: Page 42, exercises 1 to 5"}
              className="h-10 rounded-xl bg-white border-stone-300 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-stone-700">{isPt ? "Observações da Turma" : "Class Notes"}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isPt ? "Ex: Dupla participativa, foco extra em pronúncia na próxima aula" : "General class observations..."}
              className="h-10 rounded-xl bg-white border-stone-300 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-200/60 transition-colors"
            >
              {isPt ? "Cancelar" : "Cancel"}
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-[#163020] text-[#F4EBE1] font-bold text-xs hover:bg-[#1a3825] transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSaving ? (isPt ? "Salvando..." : "Saving...") : isPt ? "Salvar Aula da Turma" : "Save Class Lesson"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   6. DEDICATED CLASS DETAILS VIEW PAGE
   ========================================================================= */
export function ClassDetailsView({
  cls,
  onBack,
  onEditClass,
  onSelectStudent,
  onOpenAttendance,
  isPt,
}: {
  cls: ClassWithDetails;
  onBack: () => void;
  onEditClass: () => void;
  onSelectStudent: (studentId: string) => void;
  onOpenAttendance: (cls: ClassWithDetails) => void;
  isPt: boolean;
}) {
  const { t, formatStatus, formatWeekday } = useLanguage();
  const { user } = useAuth();

  return (
    <div className="space-y-6 font-figtree select-none">
      {/* Top Navigation & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:text-stone-900 transition-colors cursor-pointer shadow-sm"
            title={isPt ? "Voltar para lista" : "Back to list"}
          >
            <X className="h-5 w-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-outfit text-2xl font-extrabold text-stone-900">{cls.name}</h2>
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                  cls.type === "pair" ? "bg-teal-100 text-teal-800" : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {cls.type === "pair" ? (isPt ? "Dupla" : "Pair") : isPt ? "Turma" : "Group"}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  cls.status === "active"
                    ? "bg-green-100 text-green-800"
                    : cls.status === "paused"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-stone-200 text-stone-700"
                }`}
              >
                {cls.status === "active"
                  ? isPt
                    ? "Ativa"
                    : "Active"
                  : cls.status === "paused"
                  ? isPt
                    ? "Pausada"
                    : "Paused"
                  : isPt
                  ? "Arquivada"
                  : "Archived"}
              </span>
            </div>
            <p className="text-xs text-stone-500 font-semibold mt-0.5">
              {cls.language} • {isPt ? `Nível ${cls.level}` : `Level ${cls.level}`} • {isPt ? `Início: ${cls.start_date}` : `Started: ${cls.start_date}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onEditClass}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 transition-all cursor-pointer shadow-sm"
          >
            <Edit2 className="h-4 w-4" />
            <span>{isPt ? "Editar Turma" : "Edit Class"}</span>
          </button>

          <button
            onClick={() => onOpenAttendance(cls)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 transition-all cursor-pointer shadow-sm"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <span>{isPt ? "Chamada" : "Attendance"}</span>
          </button>


        </div>
      </div>

      {/* Grid: Schedule & Members Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Schedule Card */}
        <div className="p-5 bg-white rounded-3xl border border-stone-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-stone-900 font-bold font-outfit text-sm">
            <Clock className="h-4 w-4 text-emerald-800" />
            <span>{isPt ? "Horários Recorrentes" : "Recurring Schedules"}</span>
          </div>

          {cls.schedules && cls.schedules.length > 0 ? (
            <div className="space-y-2">
              {cls.schedules.map((sch) => (
                <div key={sch.id} className="p-3 bg-stone-50 rounded-2xl border border-stone-100 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-stone-800">
                    <span>{formatWeekday(sch.weekday)}</span>
                    <span>
                      {sch.start_time?.substring(0, 5)} - {sch.end_time?.substring(0, 5)}
                    </span>
                  </div>
                  <div className="text-stone-500 font-medium flex items-center justify-between">
                    <span>{formatStatus(sch.delivery_mode)}</span>
                    <span>{sch.duration} min</span>
                  </div>
                  {sch.location_link && (
                    <a
                      href={sch.location_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-800 hover:underline font-bold text-[11px] block truncate pt-1"
                    >
                      {sch.location_link}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400">{isPt ? "Nenhum horário cadastrado." : "No schedule set."}</p>
          )}
        </div>

        {/* Members Card (Clickable to open individual student details) */}
        <div className="md:col-span-2 p-5 bg-white rounded-3xl border border-stone-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-stone-900 font-bold font-outfit text-sm">
              <Users className="h-4 w-4 text-emerald-800" />
              <span>
                {isPt ? `Alunos Integrantes da Turma (${cls.members.length})` : `Class Members (${cls.members.length})`}
              </span>
            </div>
            <span className="text-[11px] font-medium text-stone-400">
              {isPt ? "Clique para abrir perfil individual" : "Click to view individual profile"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {cls.members.map((m) => {
              const targetStudentId = m.student_id;
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (targetStudentId) {
                      onSelectStudent(targetStudentId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && targetStudentId) {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectStudent(targetStudentId);
                    }
                  }}
                  className="flex items-center justify-between p-3.5 bg-[#FAF7F2] rounded-2xl border border-stone-200/80 hover:border-[#163020] hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-[#163020] transition-all cursor-pointer group shadow-2xs select-none"
                  aria-label={isPt ? `Abrir perfil de ${m.student_name ?? ""}` : `View profile of ${m.student_name ?? ""}`}
                >
                  <div className="flex items-center gap-3">
                    {m.student_avatar ? (
                      <img
                        src={m.student_avatar}
                        alt={m.student_name ?? "Student"}
                        className="h-10 w-10 rounded-xl object-cover border border-stone-200 shrink-0 group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-[#163020] text-[#F4EBE1] flex items-center justify-center font-extrabold font-outfit text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                        {(m.student_name || "??").substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      <span className="font-extrabold text-stone-900 text-sm font-outfit block group-hover:text-emerald-900 transition-colors">
                        {m.student_name ?? ""}
                      </span>
                      <span className="text-[11px] text-stone-500 font-semibold block">
                        {isPt ? "Ver perfil & notas privadas" : "View profile & private notes"}
                      </span>
                    </div>
                  </div>
                  <User className="h-4 w-4 text-stone-400 group-hover:text-emerald-800 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unified Lesson Plan & Attendance (same system as individual students) */}
      <ClassLessonPlanTable cls={cls} teacherId={user?.id || ""} isPt={isPt} />

    </div>
  );
}
