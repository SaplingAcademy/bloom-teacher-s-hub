import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import {
  syncTeacherReceivables,
  markInvoiceAsPaid,
  updateInvoiceStatus,
  formatCentsToBRL,
  formatReaisToBRL,
  parseCurrencyToNumber,
  checkPackageExpirationAlerts,
  PackageRenewalAlert,
  RealInvoice,
  fetchTeacherExpensesList,
  createTeacherExpenseRemote,
  deleteTeacherExpenseRemote,
} from "@/lib/finance-engine";
import { toast } from "sonner";
import {
  Wallet,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
  Sparkles,
  Tag,
  Receipt,
  ArrowUpRight,
  FolderOpen,
  RefreshCw,
  AlertTriangle,
  History,
  Repeat,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { StatCard } from "@/components/bloom/StatCard";
import { PackageRenewalModal } from "@/components/bloom/PackageRenewalModal";
import { PackageFormModal, PackageFormData } from "@/components/bloom/PackageFormModal";
import { StudentFinancialDrawer } from "@/components/bloom/StudentFinancialDrawer";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useFinanceInvoicesQuery, useTeacherExpensesQuery } from "@/hooks/use-finance-query";
import { usePackagesQuery } from "@/hooks/use-packages-query";
import { getFriendlyErrorMessage, getPartialSuccessMessage } from "@/lib/error-handler";
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
import { Button } from "@/components/ui/button";

interface SafeNumberInputProps {
  id?: string;
  value: number;
  onChange: (val: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: string | number;
  required?: boolean;
}

function SafeNumberInput({
  id,
  value,
  onChange,
  className,
  min,
  max,
  step,
  required,
}: SafeNumberInputProps) {
  const [tempVal, setTempVal] = useState<string>(String(value));

  useEffect(() => {
    setTempVal(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(",", ".");

    if (raw === "") {
      setTempVal("");
      onChange(0);
      return;
    }

    if (/^0\d/.test(raw)) {
      raw = raw.replace(/^0+/, "");
      if (raw === "") raw = "0";
    }

    setTempVal(raw);

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    let parsed = parseFloat(String(tempVal).replace(",", ".")) || 0;
    if (min !== undefined && parsed < min) parsed = min;
    if (max !== undefined && parsed > max) parsed = max;
    setTempVal(String(parsed));
    onChange(parsed);
  };

  return (
    <Input
      id={id}
      type="number"
      value={tempVal}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      min={min}
      max={max}
      step={step}
      required={required}
    />
  );
}

export const Route = createFileRoute("/_app/finance")({
  head: () => ({
    meta: [
      { title: "Finance · Bloom" },
      { name: "description", content: "Track your income, packages and expenses automatically." },
    ],
  }),
  component: FinancePage,
});

// Interfaces
interface Package {
  id: string;
  name: string;
  price: number;
  frequency: "total" | "Monthly" | "Weekly" | "One-time" | string;
  duration: number; // in months
  lessons: number; // lessons per billing cycle
  method: string; // e.g. "Pix", "Bank Transfer", "Card"
}

interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  method: string;
  notes?: string;
  recurrenceType?: "one_time" | "fixed" | "period";
  recurrenceMonths?: number;
  endDate?: string;
  parentExpenseId?: string;
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

const translations = {
  en: {
    langToggle: "PT",
    title: "Finance & Accounts",
    description: "Manage incoming payments, packages, and operational expenses in one workspace.",
    tabLedger: "Income & Invoices",
    tabPackages: "Packages",
    tabExpenses: "Expenses",
    kpiReceived: "Revenue Received",
    kpiExpected: "Expected Revenue",
    kpiOutstanding: "Outstanding",
    kpiExpenses: "Expenses",
    kpiNetProfit: "Net Profit",
    createPkgBtn: "Create Package",
    packageName: "Package Name",
    price: "Monthly Fee Price ($)",
    frequency: "Billing Frequency",
    duration: "Contract Duration (Months)",
    lessons: "Lessons Included",
    paymentMethod: "Payment Method",
    pkgPlaceholderName: "e.g., General VIP Premium",
    lessonsCount: "lessons",
    durationMonths: "months",
    billingCycle: "cycle",
    pkgListTitle: "Active Packages Catalog",
    pkgListSubtitle: "Packages created here will be available to assign to students.",
    addExpenseBtn: "Log Expense",
    expenseDesc: "Description",
    expenseCat: "Category",
    expenseAmount: "Amount ($)",
    expenseDate: "Date",
    expenseNotes: "Notes (Optional)",
    placeholderDesc: "e.g., Zoom Monthly Subscription",
    expenseListTitle: "Logged Expenses",
    expenseListSubtitle: "Track your operational software, marketing and classroom costs.",
    recurrenceType: "Recurrence Type",
    recurrenceOneTime: "One-time expense",
    recurrenceFixed: "Fixed expense (Ongoing monthly)",
    recurrencePeriod: "Recurring for a period",
    recurrenceMonths: "Duration (Months)",
    recurrenceBadgeOneTime: "One-time",
    recurrenceBadgeFixed: "Fixed",
    recurrenceBadgePeriod: "Recurring — {months} months",
    ledgerTitle: "Expected Payments Ledger",
    ledgerSubtitle: "Automatically generated monthly invoices for all assigned packages.",
    btnPaid: "Mark Paid",
    btnPending: "Mark Pending",
    btnOverdue: "Mark Overdue",
    statusPaid: "Paid",
    statusPending: "Pending",
    statusOverdue: "Overdue",
    studentLabel: "Student",
    btnSave: "Save",
    btnCancel: "Cancel",
    confirmDelete: "Are you sure you want to delete this?",
    studentCardClasses: "Due Date:",
    month: "month",
  },
  pt: {
    langToggle: "EN",
    title: "Financeiro & Contas",
    description:
      "Gerencie recebíveis, planos contratados e despesas operacionais em um único lugar.",
    tabLedger: "Faturamento & Receitas",
    tabPackages: "Planos / Pacotes",
    tabExpenses: "Despesas",
    kpiReceived: "Faturamento Recebido",
    kpiExpected: "Faturamento Previsto",
    kpiOutstanding: "Saldo Pendente",
    kpiExpenses: "Despesas Totais",
    kpiNetProfit: "Lucro Líquido",
    createPkgBtn: "Criar Pacote",
    packageName: "Nome do Pacote",
    price: "Valor do Pacote ($)",
    frequency: "Frequência de Cobrança",
    duration: "Duração do Contrato (Meses)",
    lessons: "Aulas Inclusas",
    paymentMethod: "Meio de Pagamento",
    pkgPlaceholderName: "ex: Geral VIP Premium",
    lessonsCount: "aulas",
    durationMonths: "meses",
    billingCycle: "ciclo",
    pkgListTitle: "Catálogo de Pacotes Ativos",
    pkgListSubtitle: "Pacotes criados aqui estarão disponíveis no cadastro dos alunos.",
    addExpenseBtn: "Registrar Despesa",
    expenseDesc: "Descrição",
    expenseCat: "Categoria",
    expenseAmount: "Valor ($)",
    expenseDate: "Data",
    expenseNotes: "Anotações (Opcional)",
    placeholderDesc: "ex: Assinatura Mensal do Zoom",
    expenseListTitle: "Despesas Lançadas",
    expenseListSubtitle: "Acompanhe seus custos de software, marketing e materiais.",
    recurrenceType: "Tipo de Recorrência",
    recurrenceOneTime: "Conta única",
    recurrenceFixed: "Conta fixa (Mensal sem fim)",
    recurrencePeriod: "Recorrente por período",
    recurrenceMonths: "Duração (Meses)",
    recurrenceBadgeOneTime: "Única",
    recurrenceBadgeFixed: "Fixa",
    recurrenceBadgePeriod: "Recorrente — {months} meses",
    ledgerTitle: "Livro Caixa de Recebíveis",
    ledgerSubtitle: "Faturas geradas mensalmente de forma automática com base no plano do aluno.",
    btnPaid: "Marcar Pago",
    btnPending: "Marcar Pendente",
    btnOverdue: "Marcar Atrasado",
    statusPaid: "Pago",
    statusPending: "Pendente",
    statusOverdue: "Atrasado",
    studentLabel: "Aluno",
    btnSave: "Salvar",
    btnCancel: "Cancelar",
    confirmDelete: "Tem certeza que deseja excluir?",
    studentCardClasses: "Vencimento:",
    month: "mês",
  },
};

// Helper styles for status
const getStatusStyles = (status: string) => {
  switch (status) {
    case "Paid":
      return "bg-success/15 text-success border-success/20";
    case "Pending":
      return "bg-warning/15 text-warning-foreground border-warning/20";
    case "Overdue":
      return "bg-destructive/15 text-destructive border-destructive/20";
  }
};

const formatCategoryDisplay = (catStr?: string, lang: "en" | "pt" = "pt"): string => {
  if (!catStr) return lang === "pt" ? "Outros" : "Other";
  const c = catStr.trim();
  if (lang === "pt") {
    switch (c) {
      case "Software": return "Software";
      case "Marketing": return "Marketing";
      case "Rent": return "Aluguel";
      case "Equipment": return "Equipamentos";
      case "Internet": return "Internet";
      case "Books": return "Livros / Materiais";
      case "Taxes": return "Impostos";
      case "Other": return "Outros";
      default: return c;
    }
  }
  return c;
};

const formatMethodDisplay = (methodStr?: string, lang: "en" | "pt" = "pt"): string => {
  if (!methodStr) return lang === "pt" ? "Cartão" : "Card";
  const m = methodStr.trim();
  if (lang === "pt") {
    switch (m) {
      case "Card":
      case "Credit Card":
        return "Cartão de crédito";
      case "Pix":
        return "Pix";
      case "Bank Transfer":
        return "Transferência bancária";
      case "Cash":
        return "Dinheiro";
      default:
        return m;
    }
  }
  switch (m) {
    case "Card":
      return "Credit Card";
    default:
      return m;
  }
};

function FinancePage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<"Ledger" | "Packages" | "Expenses">("Ledger");

  // TanStack Query Cache
  const { packages: queryPackages, refetch: refetchPackages } = usePackagesQuery(user?.id);
  const { expenses, setExpensesCache, refetch: refetchExpenses } = useTeacherExpensesQuery(user?.id);
  const { invoices, isLoading: isLoadingInvoices, setInvoicesCache, refetch: refetchInvoices } = useFinanceInvoicesQuery(user?.id);
  const packages: Package[] = queryPackages as Package[];

  // Dialog States
  const [isPkgOpen, setIsPkgOpen] = useState(false);
  const [isExpOpen, setIsExpOpen] = useState(false);

  // Package Form State
  const [pkgName, setPkgName] = useState("");
  const [pkgPrice, setPkgPrice] = useState<string>("300");
  const [pkgFreq, setPkgFreq] = useState<"total" | "Monthly" | "One-time">("total");
  const [pkgDur, setPkgDur] = useState<number>(6);
  const [pkgLessons, setPkgLessons] = useState<number>(4);
  const [pkgMethod, setPkgMethod] = useState("Pix");
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Expense Form State
  const [expDesc, setExpDesc] = useState("");
  const [expCat, setExpCat] = useState("Software");
  const [expAmount, setExpAmount] = useState<number>(20);
  const [expDate, setExpDate] = useState("");
  const [expMethod, setExpMethod] = useState("Card");
  const [expNotes, setExpNotes] = useState("");
  const [expRecurrenceType, setExpRecurrenceType] = useState<"one_time" | "fixed" | "period">("one_time");
  const [expRecurrenceMonths, setExpRecurrenceMonths] = useState<number>(6);

  // Renewal & Payment History Drawer States
  const [expirationAlerts, setExpirationAlerts] = useState<PackageRenewalAlert[]>([]);
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [renewalStudentId, setRenewalStudentId] = useState("");
  const [renewalStudentName, setRenewalStudentName] = useState("");

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerStudentId, setDrawerStudentId] = useState("");
  const [drawerStudentName, setDrawerStudentName] = useState("");

  const loadExpirationAlerts = async () => {
    if (!user) return;
    const alerts = await checkPackageExpirationAlerts(user.id);
    setExpirationAlerts(alerts);
  };

  useEffect(() => {
    loadExpirationAlerts();
  }, [user]);

  // Helper Save Package
  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgName.trim() || !user) return;

    const numericPrice = parseCurrencyToNumber(pkgPrice);

    try {
      const { data, error } = await supabase
        .from("packages")
        .insert({
          teacher_id: user.id,
          name: pkgName.trim(),
          price: numericPrice,
          frequency: pkgFreq,
          duration: Number(pkgDur) || 60,
          lessons: Number(pkgLessons) || 4,
          method: pkgMethod,
        })
        .select()
        .single();

      if (error) {
        toast.error(getFriendlyErrorMessage(error, lang === "pt" ? "Não foi possível criar o pacote agora." : "Could not create package."));
        return;
      }

      if (data) {
        const createdPkg: Package = {
          id: data.id,
          name: data.name,
          price: Number(data.price) || 0,
          frequency: data.frequency || "Monthly",
          duration: Number(data.duration) || 60,
          lessons: Number(data.lessons) || 4,
          method: data.method || "Pix",
        };
        refetchPackages();
        setIsPkgOpen(false);
        setPkgName("");
        setPkgPrice("300");
        toast.success(lang === "pt" ? "Pacote criado com sucesso!" : "Package created successfully!");
      }
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, lang === "pt" ? "Não foi possível criar o pacote agora." : "Could not create package."));
    }
  };

  const handleSaveEditPackage = async (formData: PackageFormData) => {
    if (!user || !formData.id) return;
    try {
      const { data, error } = await supabase
        .from("packages")
        .update({
          name: formData.name,
          price: formData.price,
          frequency: formData.frequency,
          duration: formData.duration,
          lessons: formData.lessons,
          method: formData.method,
          updated_at: new Date().toISOString(),
        })
        .eq("id", formData.id)
        .eq("teacher_id", user.id)
        .select()
        .single();

      if (error) {
        toast.error(getFriendlyErrorMessage(error, lang === "pt" ? "Não foi possível atualizar o pacote agora." : "Could not update package."));
        return;
      }

      if (data) {
        refetchPackages();
        toast.success(lang === "pt" ? "Pacote atualizado com sucesso!" : "Package updated successfully!");
      }
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, lang === "pt" ? "Não foi possível atualizar o pacote agora." : "Could not update package."));
    }
  };

  // Helper Save Expense with Supabase remote persistence
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc.trim() || !user) return;

    const startDateStr = expDate || new Date().toISOString().split("T")[0];
    let computedEndDate: string | undefined = undefined;

    if (expRecurrenceType === "period" && expRecurrenceMonths) {
      const parts = startDateStr.split("-").map(Number);
      const year = parts[0] || new Date().getFullYear();
      const month = (parts[1] || 1) - 1;
      const day = parts[2] || 1;

      const endDateObj = new Date(year, month + expRecurrenceMonths, day);
      const ey = endDateObj.getFullYear();
      const em = String(endDateObj.getMonth() + 1).padStart(2, "0");
      const ed = String(endDateObj.getDate()).padStart(2, "0");
      computedEndDate = `${ey}-${em}-${ed}`;
    }

    try {
      const created = await createTeacherExpenseRemote(user.id, {
        description: expDesc.trim(),
        category: expCat,
        amount: Number(expAmount) || 0,
        date: startDateStr,
        method: expMethod,
        notes: expNotes.trim() || undefined,
        recurrenceType: expRecurrenceType,
        recurrenceMonths: expRecurrenceType === "period" ? expRecurrenceMonths : undefined,
        endDate: computedEndDate,
      });

      setExpensesCache((prev) => [created, ...prev]);
      setIsExpOpen(false);
      setExpDesc("");
      setExpNotes("");
      toast.success(lang === "pt" ? "Despesa salva com sucesso!" : "Expense saved successfully!");
    } catch (err: any) {
      console.error("[Finance] Error saving expense:", err);
      toast.error(getFriendlyErrorMessage(err, lang === "pt" ? "Não foi possível salvar a despesa agora." : "Could not save expense."));
    }
  };

  // Helper Change invoice payment status
  const handleStatusChange = async (invoiceId: string, newStatus: "paid" | "pending" | "overdue") => {
    if (!user) return;
    try {
      if (newStatus === "paid") {
        await markInvoiceAsPaid(invoiceId, user.id, "Pix");
      } else {
        await updateInvoiceStatus(invoiceId, user.id, newStatus === "overdue" ? "pending" : "pending");
      }
      toast.success(lang === "pt" ? "Status atualizado com sucesso!" : "Status updated successfully!");
      refetchInvoices();
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, lang === "pt" ? "Não foi possível atualizar o status agora." : "Could not update status."));
    }
  };

  // Delete packages or expenses helper
  const handleDeletePackage = async (id: string) => {
    if (!user) return;
    try {
      // Check if package is assigned to any active student
      const { data: activeAssignments } = await supabase
        .from("student_packages")
        .select("id")
        .eq("package_id", id)
        .eq("status", "active");

      if (activeAssignments && activeAssignments.length > 0) {
        toast.error(
          lang === "pt"
            ? "Este pacote está atribuído a um aluno ativo e não pode ser excluído."
            : "This package is currently assigned to an active student and cannot be deleted."
        );
        return;
      }

      const { error } = await supabase
        .from("packages")
        .delete()
        .eq("id", id)
        .eq("teacher_id", user.id);

      if (error) {
        toast.error(getFriendlyErrorMessage(error, lang === "pt" ? "Não foi possível excluir o pacote agora." : "Could not delete package."));
        return;
      }

      refetchPackages();
      toast.success(lang === "pt" ? "Pacote excluído com sucesso!" : "Package deleted successfully!");
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, lang === "pt" ? "Não foi possível excluir o pacote agora." : "Could not delete package."));
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteTeacherExpenseRemote(user.id, id);
      setExpensesCache((prev) => prev.filter((e) => e.id !== id));
      toast.success(lang === "pt" ? "Despesa excluída com sucesso!" : "Expense deleted successfully!");
    } catch (err: any) {
      console.error("[Finance] Error deleting expense:", err);
      toast.error(getFriendlyErrorMessage(err, lang === "pt" ? "Não foi possível excluir a despesa agora." : "Could not delete expense."));
    }
  };

  // Computed KPIs directly from real invoices and expenses
  const totalReceivedCents = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  const totalExpectedCents = invoices.reduce((sum, inv) => sum + inv.amountCents, 0);
  const totalExpensesCents = Math.round(expenses.reduce((sum, current) => sum + current.amount, 0) * 100);
  const totalExpenses = totalExpensesCents / 100;
  const netProfitCents = totalReceivedCents - totalExpensesCents;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <PageHeader title={t.title} description={t.description} />

      {/* TABS CONTROLLER */}
      <div className="flex gap-2 border-b border-border pb-1 overflow-x-auto">
        {[
          { id: "Ledger", label: t.tabLedger, icon: Receipt },
          { id: "Packages", label: t.tabPackages, icon: Tag },
          { id: "Expenses", label: t.tabExpenses, icon: FolderOpen },
        ].map((tab) => {
          const ActiveIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <ActiveIcon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: LEDGER */}
      {activeTab === "Ledger" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* PACKAGE EXPIRATION MONITORING ALERT BANNER */}
          {expirationAlerts.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                      Alerta de Renovação Próxima ({expirationAlerts.length})
                    </h4>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      Pacotes ativos que expiram nos próximos 30 dias exigem renovação do professor.
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-amber-500/20 border-t border-amber-500/20 pt-2 space-y-2">
                {expirationAlerts.map((alert) => (
                  <div
                    key={alert.studentId}
                    className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {alert.alertMessage}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => {
                        setRenewalStudentId(alert.studentId);
                        setRenewalStudentName(alert.studentName);
                        setIsRenewalModalOpen(true);
                      }}
                      className="h-7 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1 self-start sm:self-auto cursor-pointer shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Renovar pacote
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LIVRO CAIXA DE RECEBÍVEIS (Ledger Section - primary action) */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between pb-4 border-b border-border/60">
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">{t.ledgerTitle}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t.ledgerSubtitle}</p>
              </div>
            </div>

            <ul className="mt-4 divide-y divide-border/60">
              {isLoadingInvoices ? (
                <div className="py-8 text-center text-xs text-muted-foreground font-medium animate-pulse">
                  {lang === "pt" ? "Carregando recebíveis dos alunos..." : "Loading student receivables..."}
                </div>
              ) : invoices.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground font-medium">
                  {lang === "pt"
                    ? "Nenhum recebível cadastrado ainda. Alunos com planos cadastrados aparecerão automaticamente aqui."
                    : "No receivables logged yet. Students with active billing agreements will appear here automatically."}
                </div>
              ) : (
                invoices.map((inv) => {
                  const studentAlert = inv.studentId
                    ? expirationAlerts.find((a) => a.studentId === inv.studentId)
                    : null;

                  return (
                    <li
                      key={inv.id}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">
                            {inv.targetName}
                          </span>
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-bold border-stone-200">
                            {inv.snapshotPackageName || "Plano"}
                          </Badge>
                          {inv.isInstallment ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-extrabold text-stone-600 bg-stone-100/90 border-stone-300">
                              {inv.progressLabel}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-bold text-emerald-700 bg-emerald-50 border-emerald-200">
                              Mensalidade
                            </Badge>
                          )}
                          {studentAlert && (
                            <Badge variant="secondary" className="text-[9px] py-0 px-1.5 font-bold text-amber-700 bg-amber-100 border-amber-300">
                              {studentAlert.daysRemaining <= 0 ? "Pacote Encerrado" : `Renovação em ${studentAlert.daysRemaining}d`}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium flex items-center gap-1.5 flex-wrap">
                          <span>{t.studentCardClasses} <strong className="text-stone-800 font-bold">{inv.dueDate}</strong></span>
                          <span>•</span>
                          <span>{t.kpiExpected}: <strong className="text-foreground font-bold">{inv.amountFormatted}</strong></span>
                          {inv.isInstallment && inv.currentInstallmentLabel && (
                            <>
                              <span>•</span>
                              <span className="text-stone-500 font-semibold">{inv.currentInstallmentLabel}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                        {inv.studentId && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setDrawerStudentId(inv.studentId!);
                                setDrawerStudentName(inv.targetName);
                                setIsDrawerOpen(true);
                              }}
                              className="inline-flex h-7 items-center gap-1 px-2.5 rounded-lg text-xs font-bold border border-border bg-card hover:bg-secondary text-foreground cursor-pointer"
                              title="Ver histórico de pagamentos"
                            >
                              <History className="h-3.5 w-3.5 text-stone-600" />
                              <span className="hidden sm:inline">Histórico</span>
                            </button>

                            {studentAlert && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRenewalStudentId(inv.studentId!);
                                  setRenewalStudentName(inv.targetName);
                                  setIsRenewalModalOpen(true);
                                }}
                                className="inline-flex h-7 items-center gap-1 px-2.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-sm"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                <span>Renovar</span>
                              </button>
                            )}
                          </>
                        )}

                        <Select
                          value={inv.status}
                          onValueChange={(val: "paid" | "pending" | "overdue") =>
                            handleStatusChange(inv.id, val)
                          }
                        >
                          <SelectTrigger
                            className={`h-7 w-28 rounded-lg text-xs font-bold border py-0 px-2.5 flex items-center justify-between gap-1 shadow-sm transition-all cursor-pointer ${getStatusStyles(
                              inv.status
                            )}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg shadow-md border border-border bg-popover text-popover-foreground">
                            <SelectItem
                              value="paid"
                              className="text-xs font-semibold text-foreground hover:bg-secondary cursor-pointer"
                            >
                              {t.statusPaid}
                            </SelectItem>
                            <SelectItem
                              value="pending"
                              className="text-xs font-semibold text-foreground hover:bg-secondary cursor-pointer"
                            >
                              {t.statusPending}
                            </SelectItem>
                            <SelectItem
                              value="overdue"
                              className="text-xs font-semibold text-foreground hover:bg-secondary cursor-pointer"
                            >
                              {t.statusOverdue}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {/* KPI STAT CARDS */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={t.kpiReceived}
              value={formatCentsToBRL(totalReceivedCents)}
              icon={CheckCircle2}
              tone="primary"
            />
            <StatCard
              label={t.kpiExpected}
              value={formatCentsToBRL(totalExpectedCents)}
              icon={TrendingUp}
              tone="lilac"
            />
            <StatCard
              label={t.kpiNetProfit}
              value={formatCentsToBRL(netProfitCents)}
              icon={Wallet}
              tone={netProfitCents >= 0 ? "primary" : "warning"}
            />
          </div>
        </div>
      )}

      {/* TAB CONTENT: PACKAGES */}
      {activeTab === "Packages" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.8fr] animate-in fade-in duration-200">
          {/* Create Package card */}
          <div className="rounded-2xl border border-[#163020] bg-[#163020] p-6 shadow-[var(--shadow-sm)] self-start text-white">
            <h3 className="font-display text-lg font-bold text-white mb-4">{t.createPkgBtn}</h3>
            <form onSubmit={handleCreatePackage} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="pkg-name" className="text-xs font-semibold text-emerald-100/90">
                  {t.packageName}
                </Label>
                <Input
                  id="pkg-name"
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  placeholder={t.pkgPlaceholderName}
                  required
                  className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 placeholder:text-gray-400 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="pkg-freq" className="text-xs font-semibold text-emerald-100/90">
                    {lang === "pt" ? "Modelo de Cobrança" : "Billing Model"}
                  </Label>
                  <Select value={pkgFreq} onValueChange={(val) => setPkgFreq(val as any)}>
                    <SelectTrigger
                      id="pkg-freq"
                      className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus:ring-white focus:ring-offset-emerald-900"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="total">
                        {lang === "pt" ? "Valor total do curso" : "Total course value"}
                      </SelectItem>
                      <SelectItem value="Monthly">
                        {lang === "pt" ? "Mensalidade" : "Monthly fee"}
                      </SelectItem>
                      <SelectItem value="One-time">
                        {lang === "pt" ? "Aula avulsa" : "One-time / Per lesson"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="pkg-price" className="text-xs font-semibold text-emerald-100/90">
                    {pkgFreq === "total"
                      ? lang === "pt"
                        ? "Valor total do curso (R$)"
                        : "Total course value ($)"
                      : pkgFreq === "Monthly"
                      ? lang === "pt"
                        ? "Valor mensal (R$)"
                        : "Monthly price ($)"
                      : lang === "pt"
                      ? "Valor (R$)"
                      : "Price ($)"}
                  </Label>
                  <CurrencyInput
                    id="pkg-price"
                    value={pkgPrice}
                    onChange={setPkgPrice}
                    placeholder="0,00"
                    required
                    className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus-visible:ring-white focus-visible:ring-offset-emerald-900 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label
                    htmlFor="pkg-duration"
                    className="text-xs font-semibold text-emerald-100/90"
                  >
                    {t.duration}
                  </Label>
                  <SafeNumberInput
                    id="pkg-duration"
                    value={pkgDur}
                    onChange={setPkgDur}
                    required
                    className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                  />
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="pkg-lessons"
                    className="text-xs font-semibold text-emerald-100/90"
                  >
                    {t.lessons}
                  </Label>
                  <SafeNumberInput
                    id="pkg-lessons"
                    value={pkgLessons}
                    onChange={setPkgLessons}
                    required
                    className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pkg-method" className="text-xs font-semibold text-emerald-100/90">
                  {t.paymentMethod}
                </Label>
                <Select value={pkgMethod} onValueChange={setPkgMethod}>
                  <SelectTrigger
                    id="pkg-method"
                    className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus:ring-white focus:ring-offset-emerald-900"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pix">Pix</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <button
                type="submit"
                className="w-full inline-flex h-10 items-center justify-center rounded-xl bg-[#F4EBE1] text-[#163020] hover:bg-[#EAE0D5] font-bold text-sm transition-all cursor-pointer shadow-sm"
              >
                {t.createPkgBtn}
              </button>
            </form>
          </div>

          {/* Package list catalog */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <h3 className="font-display text-lg font-bold text-foreground">{t.pkgListTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t.pkgListSubtitle}</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <h4 className="font-display font-bold text-foreground text-sm">{pkg.name}</h4>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingPkg(pkg);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors cursor-pointer"
                          title={lang === "pt" ? "Editar Pacote" : "Edit Package"}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeletePackage(pkg.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors cursor-pointer"
                          title={t.confirmDelete}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xl font-extrabold text-primary mt-2">
                      {formatReaisToBRL(pkg.price)}
                      <span className="text-xs text-muted-foreground font-medium">
                        {" "}
                        / {(pkg.frequency as string) === "total" || (pkg.frequency as string) === "Valor total do curso" ? (lang === "pt" ? "valor total" : "total value") : pkg.frequency === "Monthly" ? t.month : t.billingCycle}
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 border-t border-border/40 pt-2 text-[10px] text-muted-foreground font-semibold flex items-center justify-between">
                    <span>
                      {pkg.lessons} {t.lessonsCount}
                    </span>
                    <span>
                      {pkg.duration} {t.durationMonths}
                    </span>
                    <Badge variant="outline" className="text-[8px] py-0 px-1 font-bold">
                      {pkg.method}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: EXPENSES */}
      {activeTab === "Expenses" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.8fr]">
            {/* Create Expense Form */}
            <div className="rounded-2xl border border-[#163020] bg-[#163020] p-6 shadow-[var(--shadow-sm)] self-start text-white">
              <h3 className="font-display text-lg font-bold text-white mb-4">{t.addExpenseBtn}</h3>
              <form onSubmit={handleCreateExpense} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="exp-desc" className="text-xs font-semibold text-emerald-100/90">
                    {t.expenseDesc}
                  </Label>
                  <Input
                    id="exp-desc"
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    placeholder={t.placeholderDesc}
                    required
                    className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 placeholder:text-gray-400 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label
                      htmlFor="exp-amount"
                      className="text-xs font-semibold text-emerald-100/90"
                    >
                      {t.expenseAmount}
                    </Label>
                    <SafeNumberInput
                      id="exp-amount"
                      step="0.01"
                      value={expAmount}
                      onChange={setExpAmount}
                      required
                      className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="exp-cat" className="text-xs font-semibold text-emerald-100/90">
                      {t.expenseCat}
                    </Label>
                    <Select value={expCat} onValueChange={setExpCat}>
                      <SelectTrigger
                        id="exp-cat"
                        className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus:ring-white focus:ring-offset-emerald-900"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Software">{lang === "pt" ? "Software" : "Software"}</SelectItem>
                        <SelectItem value="Marketing">{lang === "pt" ? "Marketing" : "Marketing"}</SelectItem>
                        <SelectItem value="Rent">{lang === "pt" ? "Aluguel" : "Rent"}</SelectItem>
                        <SelectItem value="Equipment">{lang === "pt" ? "Equipamentos" : "Equipment"}</SelectItem>
                        <SelectItem value="Internet">{lang === "pt" ? "Internet" : "Internet"}</SelectItem>
                        <SelectItem value="Books">{lang === "pt" ? "Livros / Materiais" : "Books"}</SelectItem>
                        <SelectItem value="Taxes">{lang === "pt" ? "Impostos" : "Taxes"}</SelectItem>
                        <SelectItem value="Other">{lang === "pt" ? "Outros" : "Other"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="exp-date" className="text-xs font-semibold text-emerald-100/90">
                      {t.expenseDate}
                    </Label>
                    <Input
                      id="exp-date"
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor="exp-method"
                      className="text-xs font-semibold text-emerald-100/90"
                    >
                      {t.paymentMethod}
                    </Label>
                    <Select value={expMethod} onValueChange={setExpMethod}>
                      <SelectTrigger
                        id="exp-method"
                        className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus:ring-white focus:ring-offset-emerald-900"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Card">{lang === "pt" ? "Cartão de Crédito" : "Credit Card"}</SelectItem>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Bank Transfer">{lang === "pt" ? "Transferência Bancária" : "Bank Transfer"}</SelectItem>
                        <SelectItem value="Cash">{lang === "pt" ? "Dinheiro" : "Cash"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="exp-recurrence" className="text-xs font-semibold text-emerald-100/90">
                      {t.recurrenceType}
                    </Label>
                    <Select
                      value={expRecurrenceType}
                      onValueChange={(val: "one_time" | "fixed" | "period") =>
                        setExpRecurrenceType(val)
                      }
                    >
                      <SelectTrigger
                        id="exp-recurrence"
                        className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus:ring-white focus:ring-offset-emerald-900"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_time">{t.recurrenceOneTime}</SelectItem>
                        <SelectItem value="fixed">{t.recurrenceFixed}</SelectItem>
                        <SelectItem value="period">{t.recurrencePeriod}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {expRecurrenceType === "period" ? (
                    <div className="space-y-1">
                      <Label htmlFor="exp-months" className="text-xs font-semibold text-emerald-100/90">
                        {t.recurrenceMonths}
                      </Label>
                      <SafeNumberInput
                        id="exp-months"
                        value={expRecurrenceMonths}
                        onChange={setExpRecurrenceMonths}
                        min={1}
                        max={60}
                        required
                        className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label htmlFor="exp-notes" className="text-xs font-semibold text-emerald-100/90">
                        {t.expenseNotes}
                      </Label>
                      <Input
                        id="exp-notes"
                        value={expNotes}
                        onChange={(e) => setExpNotes(e.target.value)}
                        placeholder={lang === "pt" ? "Anotações..." : "Notes..."}
                        className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 placeholder:text-gray-400 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                      />
                    </div>
                  )}
                </div>

                {expRecurrenceType === "period" && (
                  <div className="space-y-1">
                    <Label htmlFor="exp-notes" className="text-xs font-semibold text-emerald-100/90">
                      {t.expenseNotes}
                    </Label>
                    <Input
                      id="exp-notes"
                      value={expNotes}
                      onChange={(e) => setExpNotes(e.target.value)}
                      placeholder={lang === "pt" ? "Anotações..." : "Notes..."}
                      className="h-10 rounded-xl bg-white text-gray-900 border-emerald-800 placeholder:text-gray-400 focus-visible:ring-white focus-visible:ring-offset-emerald-900"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full inline-flex h-10 items-center justify-center rounded-xl bg-[#F4EBE1] text-[#163020] hover:bg-[#EAE0D5] font-bold text-sm transition-all cursor-pointer shadow-sm"
                >
                  {t.addExpenseBtn}
                </button>
              </form>
            </div>

            {/* Logged expenses list */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/60 gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {t.expenseListTitle}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.expenseListSubtitle}</p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-muted-foreground block">
                    {lang === "pt" ? "Total de Despesas" : "Total Expenses"}
                  </span>
                  <span className="font-display text-2xl font-extrabold text-foreground">
                    {formatCentsToBRL(totalExpensesCents)}
                  </span>
                </div>
              </div>

              <ul className="mt-5 divide-y divide-border/60">
                {expenses.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground font-medium">
                    {lang === "pt"
                      ? "Nenhuma despesa lançada ainda. Registre seus custos operacionais ao lado."
                      : "No expenses logged yet. Log your operational expenses on the left."}
                  </div>
                ) : (
                  expenses.map((exp) => {
                    const recType = exp.recurrenceType || "one_time";
                    const isFixed = recType === "fixed";
                    const isPeriod = recType === "period";

                    return (
                      <li key={exp.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {exp.description}
                            </span>
                            <Badge variant="outline" className="text-[8px] py-0 px-1 font-bold">
                              {formatCategoryDisplay(exp.category, lang)}
                            </Badge>
                            {isFixed && (
                              <Badge variant="secondary" className="text-[8px] py-0 px-1.5 font-bold text-amber-700 bg-amber-100 border-amber-300">
                                {t.recurrenceBadgeFixed}
                              </Badge>
                            )}
                            {isPeriod && (
                              <Badge variant="secondary" className="text-[8px] py-0 px-1.5 font-bold text-blue-700 bg-blue-100 border-blue-300">
                                {t.recurrenceBadgePeriod.replace("{months}", String(exp.recurrenceMonths || 6))}
                              </Badge>
                            )}
                            {!isFixed && !isPeriod && (
                              <Badge variant="outline" className="text-[8px] py-0 px-1 font-bold text-stone-600 bg-stone-50 border-stone-200">
                                {t.recurrenceBadgeOneTime}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {exp.date} • {formatMethodDisplay(exp.method, lang)} {exp.notes ? `• ${exp.notes}` : ""}
                            {isPeriod && exp.endDate ? ` • ${lang === "pt" ? "até" : "until"} ${exp.endDate}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-display font-bold text-sm text-destructive">
                            -R$ {exp.amount}
                          </span>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors cursor-pointer"
                            title={t.confirmDelete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* PACKAGE RENEWAL MODAL */}
      {user && (
        <PackageRenewalModal
          isOpen={isRenewalModalOpen}
          onClose={() => setIsRenewalModalOpen(false)}
          teacherId={user.id}
          studentId={renewalStudentId}
          studentName={renewalStudentName}
          onRenewalCompleted={async () => {
            if (user) {
              refetchInvoices();
              loadExpirationAlerts();
            }
          }}
        />
      )}

      {/* STUDENT FINANCIAL DRAWER */}
      {user && (
        <StudentFinancialDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          teacherId={user.id}
          studentId={drawerStudentId}
          studentName={drawerStudentName}
          onOpenRenewalModal={() => {
            setRenewalStudentId(drawerStudentId);
            setRenewalStudentName(drawerStudentName);
            setIsRenewalModalOpen(true);
          }}
        />
      )}

      {/* EDIT PACKAGE MODAL */}
      <PackageFormModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPkg(null);
        }}
        onSave={handleSaveEditPackage}
        initialData={editingPkg}
      />
    </div>
  );
}
