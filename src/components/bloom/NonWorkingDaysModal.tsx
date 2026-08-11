import { useState, useEffect, useMemo } from "react";
import {
  fetchTeacherTimeOff,
  createTeacherTimeOff,
  createTeacherTimeOffBatch,
  deleteTeacherTimeOff,
  deleteTeacherTimeOffBatch,
  updateTeacherTimeOff,
  TeacherTimeOff,
  TimeOffType,
  TimeOffInput,
} from "@/lib/time-off-engine";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Edit2,
  Palmtree,
  PartyPopper,
  Briefcase,
  Plane,
  X,
  Check,
} from "lucide-react";

interface NonWorkingDaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  onTimeOffUpdated?: () => void;
}

export function NonWorkingDaysModal({
  isOpen,
  onClose,
  teacherId,
  onTimeOffUpdated,
}: NonWorkingDaysModalProps) {
  const [activeTab, setActiveTab] = useState<"create" | "list">("create");
  const [loading, setLoading] = useState<boolean>(false);
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);

  // Selection Mode: "single" | "range" | "multiple"
  const [mode, setMode] = useState<"single" | "range" | "multiple">("single");

  // Single / Range state
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Multiple dates state (Set of YYYY-MM-DD strings)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  // Interactive Month Calendar Navigation
  const [pickerMonthDate, setPickerMonthDate] = useState<Date>(new Date());

  // Optional Form Fields
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<TimeOffType | "Nenhuma">("Nenhuma");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // "Dias Cadastrados" Tab State: Search & Bulk Delete & Edit
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<TeacherTimeOff | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editCategory, setEditCategory] = useState<TimeOffType | "Nenhuma">("Nenhuma");

  const loadData = async () => {
    if (!teacherId) return;
    setLoading(true);
    const list = await fetchTeacherTimeOff(teacherId);
    setTimeOffList(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && teacherId) {
      loadData();
    }
  }, [isOpen, teacherId]);

  // Set of already registered single dates for calendar highlighting
  const registeredDatesMap = useMemo(() => {
    const map = new Map<string, TeacherTimeOff>();
    timeOffList.forEach((item) => {
      // Add start date and range dates
      const curr = new Date(item.startDate + "T00:00:00");
      const last = new Date(item.endDate + "T00:00:00");
      while (curr <= last) {
        const dStr = curr.toISOString().split("T")[0];
        map.set(dStr, item);
        curr.setDate(curr.getDate() + 1);
      }
    });
    return map;
  }, [timeOffList]);

  // Multi-date toggle handler
  const toggleDateSelection = (dateStr: string) => {
    const next = new Set(selectedDates);
    if (next.has(dateStr)) {
      next.delete(dateStr);
    } else {
      next.add(dateStr);
    }
    setSelectedDates(next);
  };

  // Month navigation handlers
  const handlePrevMonth = () => {
    const prev = new Date(pickerMonthDate);
    prev.setMonth(prev.getMonth() - 1);
    setPickerMonthDate(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(pickerMonthDate);
    next.setMonth(next.getMonth() + 1);
    setPickerMonthDate(next);
  };

  // Synchronize single date mode end date
  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (mode === "single") {
      setEndDate(val);
    } else if (endDate < val) {
      setEndDate(val);
    }
  };

  // Submit Handler
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || isSubmitting) return;

    setIsSubmitting(true);

    let res: { success: boolean; error?: string; count?: number };

    if (mode === "single") {
      res = await createTeacherTimeOff(teacherId, {
        startDate,
        endDate: startDate,
        type: category === "Nenhuma" ? undefined : category,
        title: title.trim() || undefined,
      });
    } else if (mode === "range") {
      res = await createTeacherTimeOff(teacherId, {
        startDate,
        endDate,
        type: category === "Nenhuma" ? undefined : category,
        title: title.trim() || undefined,
      });
    } else {
      // Multiple Mode
      const datesArray = Array.from(selectedDates).sort();
      if (datesArray.length === 0) {
        toast.error("Selecione pelo menos uma data no calendário.");
        setIsSubmitting(false);
        return;
      }

      const batchInputs: TimeOffInput[] = datesArray.map((dStr) => ({
        startDate: dStr,
        endDate: dStr,
        type: category === "Nenhuma" ? undefined : category,
        title: title.trim() || undefined,
      }));

      res = await createTeacherTimeOffBatch(teacherId, batchInputs);
    }

    setIsSubmitting(false);

    if (res.success) {
      const addedMsg =
        mode === "multiple"
          ? `${res.count || selectedDates.size} dias sem aula cadastrados com sucesso!`
          : "Dia sem aula cadastrado com sucesso!";
      toast.success(addedMsg);

      await loadData();
      if (onTimeOffUpdated) onTimeOffUpdated();

      // Reset form
      setTitle("");
      setCategory("Nenhuma");
      setSelectedDates(new Set());
      setActiveTab("list");
    } else {
      toast.error(res.error || "Erro ao salvar períodos sem aula.");
    }
  };

  // Single Item Delete
  const handleDeleteItem = async (id: string) => {
    if (!teacherId) return;
    const res = await deleteTeacherTimeOff(teacherId, id);
    if (res.success) {
      toast.success("Período excluído da agenda.");
      setTimeOffList((prev) => prev.filter((item) => item.id !== id));
      selectedItemIds.delete(id);
      setSelectedItemIds(new Set(selectedItemIds));
      if (onTimeOffUpdated) onTimeOffUpdated();
    } else {
      toast.error(res.error || "Erro ao excluir período.");
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (!teacherId || selectedItemIds.size === 0) return;
    const ids = Array.from(selectedItemIds);
    const res = await deleteTeacherTimeOffBatch(teacherId, ids);

    if (res.success) {
      toast.success(`${ids.length} períodos excluídos com sucesso!`);
      setTimeOffList((prev) => prev.filter((item) => !selectedItemIds.has(item.id)));
      setSelectedItemIds(new Set());
      if (onTimeOffUpdated) onTimeOffUpdated();
    } else {
      toast.error(res.error || "Erro ao excluir itens selecionados.");
    }
  };

  // Update Single Item Title & Category
  const handleSaveEditItem = async () => {
    if (!teacherId || !editingItem) return;
    const res = await updateTeacherTimeOff(teacherId, editingItem.id, {
      title: editTitle.trim() || undefined,
      type: editCategory === "Nenhuma" ? undefined : editCategory,
    });

    if (res.success) {
      toast.success("Informações atualizadas com sucesso!");
      setEditingItem(null);
      await loadData();
      if (onTimeOffUpdated) onTimeOffUpdated();
    } else {
      toast.error(res.error || "Erro ao atualizar item.");
    }
  };

  // Filtered Time-off list for "Dias Cadastrados"
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return timeOffList;
    const q = searchQuery.toLowerCase();
    return timeOffList.filter(
      (item) =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.type && item.type.toLowerCase().includes(q)) ||
        item.startDate.includes(q) ||
        item.endDate.includes(q)
    );
  }, [timeOffList, searchQuery]);

  // Render Calendar Grid for Multiple Selection Mode
  const renderInteractiveCalendar = () => {
    const year = pickerMonthDate.getFullYear();
    const month = pickerMonthDate.getMonth();
    const monthName = pickerMonthDate.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    const firstOfMonth = new Date(year, month, 1);
    const fDayOfWeek = firstOfMonth.getDay();
    const offsetToMon = fDayOfWeek === 0 ? 6 : fDayOfWeek - 1;
    const gridStartDate = new Date(year, month, 1 - offsetToMon);

    const todayStr = new Date().toISOString().split("T")[0];

    return (
      <div className="space-y-3 border rounded-xl p-3 bg-muted/10">
        {/* Calendar Header Navigation */}
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-xs capitalize text-foreground flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-primary" /> {monthName}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handleNextMonth}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Day Labels */}
        <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-muted-foreground uppercase">
          <div>SEG</div>
          <div>TER</div>
          <div>QUA</div>
          <div>QUI</div>
          <div>SEX</div>
          <div>SÁB</div>
          <div>DOM</div>
        </div>

        {/* Month Dates Grid (35 dynamic cells) */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, idx) => {
            const cellDate = new Date(gridStartDate);
            cellDate.setDate(gridStartDate.getDate() + idx);
            const dateStr = cellDate.toISOString().split("T")[0];
            const isCurrentMonth = cellDate.getMonth() === month;
            const isSelected = selectedDates.has(dateStr);
            const isToday = dateStr === todayStr;
            const registeredInfo = registeredDatesMap.get(dateStr);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => isCurrentMonth && toggleDateSelection(dateStr)}
                title={
                  registeredInfo
                    ? `${registeredInfo.type}${registeredInfo.title ? `: ${registeredInfo.title}` : ""}`
                    : dateStr.split("-").reverse().join("/")
                }
                className={`h-8 w-full rounded-lg text-xs font-bold transition-all relative flex flex-col items-center justify-center cursor-pointer ${
                  !isCurrentMonth
                    ? "opacity-20 cursor-default"
                    : isSelected
                    ? "bg-[#163020] text-[#F4EBE1] shadow-sm font-extrabold"
                    : registeredInfo
                    ? "bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200"
                    : isToday
                    ? "border-2 border-emerald-600 text-emerald-800 dark:text-emerald-300"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <span>{cellDate.getDate()}</span>
                {registeredInfo && !isSelected && (
                  <span className="w-1 h-1 rounded-full bg-amber-500 absolute bottom-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selection Status & Clear Action */}
        <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
          <span className="font-bold text-stone-800 dark:text-stone-200">
            {selectedDates.size} {selectedDates.size === 1 ? "dia selecionado" : "dias selecionados"}
          </span>
          {selectedDates.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedDates(new Set())}
              className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Limpar seleção
            </button>
          )}
        </div>
      </div>
    );
  };

  const getTypeIcon = (t?: TimeOffType) => {
    switch (t) {
      case "Férias":
        return <Palmtree className="w-3.5 h-3.5 text-emerald-600" />;
      case "Feriado":
        return <PartyPopper className="w-3.5 h-3.5 text-amber-500" />;
      case "Viagem":
        return <Plane className="w-3.5 h-3.5 text-blue-500" />;
      default:
        return <Briefcase className="w-3.5 h-3.5 text-stone-500" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] rounded-2xl p-0 overflow-hidden border-border bg-card shadow-2xl flex flex-col">
        {/* Compact Header */}
        <div className="bg-[#163020] text-[#F4EBE1] p-5 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-white/10 text-emerald-400">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-[#F4EBE1]">
                  Dias sem aula
                </DialogTitle>
                <DialogDescription className="text-xs text-[#F4EBE1]/80 mt-0.5">
                  Cadastre feriados, férias e outros dias em que você não estará disponível para aulas.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Sub Navigation */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "create"
                  ? "bg-[#F4EBE1] text-[#163020]"
                  : "text-[#F4EBE1]/80 hover:bg-white/10"
              }`}
            >
              + Adicionar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "list"
                  ? "bg-[#F4EBE1] text-[#163020]"
                  : "text-[#F4EBE1]/80 hover:bg-white/10"
              }`}
            >
              Dias cadastrados ({timeOffList.length})
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === "create" && (
            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              {/* Three Selection Modes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Modo de Seleção</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("single");
                      setEndDate(startDate);
                    }}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      mode === "single"
                        ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Data única
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("range")}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      mode === "range"
                        ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Intervalo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("multiple")}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      mode === "multiple"
                        ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Múltiplos dias
                  </button>
                </div>
              </div>

              {/* Mode A & B Date Inputs */}
              {mode !== "multiple" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">
                      {mode === "single" ? "Data" : "Data de Início"}
                    </Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      required
                    />
                  </div>

                  {mode === "range" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Data de Término</Label>
                      <Input
                        type="date"
                        min={startDate}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Mode C: Interactive Multi-Month Calendar */}
              {mode === "multiple" && renderInteractiveCalendar()}

              {/* Optional Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Nome (opcional)</Label>
                  <Input
                    placeholder="Ex.: Férias, feriado, viagem..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Categoria (opcional)</Label>
                  <Select
                    value={category}
                    onValueChange={(val) => setCategory(val as TimeOffType | "Nenhuma")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nenhuma">Nenhuma</SelectItem>
                      <SelectItem value="Feriado">Feriado</SelectItem>
                      <SelectItem value="Férias">Férias</SelectItem>
                      <SelectItem value="Recesso">Recesso</SelectItem>
                      <SelectItem value="Compromisso pessoal">Compromisso pessoal</SelectItem>
                      <SelectItem value="Viagem">Viagem</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dynamic Action Button */}
              <Button
                type="submit"
                disabled={isSubmitting || (mode === "multiple" && selectedDates.size === 0)}
                className="w-full bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90 font-bold text-xs gap-1.5 cursor-pointer shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {mode === "single"
                      ? "Cadastrar dia sem aula"
                      : mode === "range"
                      ? "Cadastrar período"
                      : `Cadastrar ${selectedDates.size} ${selectedDates.size === 1 ? "dia" : "dias"}`}
                  </>
                )}
              </Button>
            </form>
          )}

          {activeTab === "list" && (
            <div className="space-y-3 text-xs">
              {/* Search & Bulk Actions Header */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                  <Input
                    placeholder="Buscar por nome, data ou categoria..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>

                {selectedItemIds.size > 0 && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="h-8 text-xs font-bold gap-1 self-stretch sm:self-auto cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir selecionados ({selectedItemIds.size})
                  </Button>
                )}
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Carregando dias cadastrados...
                </div>
              ) : filteredList.length === 0 ? (
                <div className="py-8 text-center border border-dashed rounded-xl text-xs text-muted-foreground">
                  Nenhum dia sem aula encontrado.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {filteredList.map((item) => {
                    const isChecked = selectedItemIds.has(item.id);
                    const isEditing = editingItem?.id === item.id;

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm hover:border-emerald-500/30 transition-all"
                      >
                        {isEditing ? (
                          /* Inline Edit Mode */
                          <div className="w-full space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Nome (opcional)"
                                className="h-8 text-xs"
                              />
                              <Select
                                value={editCategory}
                                onValueChange={(val) => setEditCategory(val as TimeOffType | "Nenhuma")}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Nenhuma">Nenhuma</SelectItem>
                                  <SelectItem value="Feriado">Feriado</SelectItem>
                                  <SelectItem value="Férias">Férias</SelectItem>
                                  <SelectItem value="Recesso">Recesso</SelectItem>
                                  <SelectItem value="Compromisso pessoal">Compromisso pessoal</SelectItem>
                                  <SelectItem value="Viagem">Viagem</SelectItem>
                                  <SelectItem value="Outro">Outro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setEditingItem(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-[#163020] text-[#F4EBE1]"
                                onClick={handleSaveEditItem}
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Standard View Mode */
                          <>
                            <div className="flex items-start gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = new Set(selectedItemIds);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  setSelectedItemIds(next);
                                }}
                                className="mt-0.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>

                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-bold gap-1 bg-stone-50 dark:bg-stone-800"
                                  >
                                    {getTypeIcon(item.type)} {item.type || "Sem categoria"}
                                  </Badge>
                                  {item.title && (
                                    <strong className="text-foreground font-bold">{item.title}</strong>
                                  )}
                                </div>

                                <p className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5">
                                  <CalendarIcon className="w-3.5 h-3.5 text-stone-400" />
                                  <span>
                                    {item.startDate === item.endDate
                                      ? item.startDate.split("-").reverse().join("/")
                                      : `${item.startDate.split("-").reverse().join("/")} → ${item.endDate.split("-").reverse().join("/")}`}
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(item);
                                  setEditTitle(item.title || "");
                                  setEditCategory(item.type || "Nenhuma");
                                }}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                                title="Editar item"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                title="Excluir período"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 bg-muted/30 border-t border-border flex justify-end shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-semibold cursor-pointer"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
