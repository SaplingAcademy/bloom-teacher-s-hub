import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/lib/automation-engine";
import type { RealInvoice } from "@/lib/finance-engine";
import type { DailyPriorityItem } from "@/lib/daily-priorities";
import { advanceLeadStageAfterInteraction, shouldAdvanceStageOnInteraction, type LeadInteraction } from "@/lib/lead-interactions";
import { loadPriorityInvoice, loadPriorityLead, saveLeadProfile } from "@/lib/priority-resolution";
import { LeadDetailSheet } from "@/components/bloom/LeadDetailSheet";
import { LeadInteractionDialog } from "@/components/bloom/LeadInteractionDialog";
import { PackageRenewalModal } from "@/components/bloom/PackageRenewalModal";
import { PaymentConfirmationDialog } from "@/components/bloom/PaymentConfirmationDialog";

/**
 * Stage 2 of Today's resolution center: Leads, Contracts and Payments priorities open
 * the module's existing component in place. Every save goes through that component's
 * own flow; afterwards the caller re-reads priorities, so an alert disappears only when
 * its source condition is really resolved.
 */
export type PriorityModuleAction =
  | { kind: "lead"; leadId: string }
  | { kind: "contract"; studentId: string; studentName: string }
  | { kind: "payment"; invoiceId: string; studentId?: string };

export function moduleActionFor(item: DailyPriorityItem): PriorityModuleAction | null {
  if (item.category === "lead" && item.ref.leadId) return { kind: "lead", leadId: item.ref.leadId };
  // A renewal that was not activated is reviewed in the student's Finance tab (navigation), not renewed again.
  if (item.reason === "contract_renewal_not_activated") return null;
  if (item.category === "contract" && item.ref.studentId) return { kind: "contract", studentId: item.ref.studentId, studentName: item.title };
  if (item.category === "payment" && item.ref.invoiceId) {
    return { kind: "payment", invoiceId: item.ref.invoiceId, ...(item.ref.studentId ? { studentId: item.ref.studentId } : {}) };
  }
  return null;
}

interface Props {
  teacherId: string;
  action: PriorityModuleAction;
  onClose: () => void;
  /** Called after any successful save so priorities (and dependent caches) are re-read. */
  onSaved: (kind: PriorityModuleAction["kind"]) => void;
}

/**
 * Discreet secondary link inside the payment/contract modals: closes the modal and opens the
 * student's Finance tab (existing /students deep link), where the charge and the package live.
 */
function ViewOriginLink({ studentId, label, onClose }: { studentId: string; label: string; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        onClose();
        navigate({ to: "/students", search: { studentId, tab: "Finance" } });
      }}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded text-xs font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

export function PriorityModuleActions({ teacherId, action, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  if (action.kind === "lead") return <LeadAction teacherId={teacherId} leadId={action.leadId} onClose={onClose} onSaved={() => onSaved("lead")} />;
  if (action.kind === "contract") {
    return (
      <PackageRenewalModal
        isOpen
        onClose={onClose}
        teacherId={teacherId}
        studentId={action.studentId}
        studentName={action.studentName}
        onRenewalCompleted={() => onSaved("contract")}
        secondaryAction={<ViewOriginLink studentId={action.studentId} label={t("today.resolve.viewContract")} onClose={onClose} />}
      />
    );
  }
  return (
    <PaymentAction
      teacherId={teacherId}
      invoiceId={action.invoiceId}
      onClose={onClose}
      onSaved={() => onSaved("payment")}
      secondaryAction={action.studentId ? <ViewOriginLink studentId={action.studentId} label={t("today.resolve.viewPayment")} onClose={onClose} /> : undefined}
    />
  );
}

function LeadAction({ teacherId, leadId, onClose, onSaved }: { teacherId: string; leadId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [packages, setPackages] = useState<{ id: string; name?: string }[]>([]);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPriorityLead(teacherId, leadId),
      supabase.from("packages").select("id, name").eq("teacher_id", teacherId),
    ])
      .then(([loaded, pkgs]) => {
        if (!active) return;
        setLead(loaded);
        setPackages((pkgs.data || []) as { id: string; name?: string }[]);
      })
      .catch((err) => {
        console.error("[PriorityModuleActions] lead load failed:", err);
        if (active) { toast.error(t("today.resolve.loadError")); onClose(); }
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, leadId]);

  const reload = async () => {
    try { setLead(await loadPriorityLead(teacherId, leadId)); } catch { /* keep the visible data */ }
  };

  // Same follow-up as the Leads page: effective interactions advance "Novo contato" → "Em conversa".
  const handleInteractionSaved = async (interaction: LeadInteraction) => {
    setHistoryRefreshKey((k) => k + 1);
    if (lead && shouldAdvanceStageOnInteraction(lead.stage, interaction.type)) {
      try {
        await advanceLeadStageAfterInteraction(teacherId, lead.id);
        toast.success(t("leadInteractions.saved"));
      } catch (err) {
        console.error("[PriorityModuleActions] stage advance failed:", err);
        toast.warning(t("leadInteractions.stageError"));
      }
    } else {
      toast.success(t("leadInteractions.saved"));
    }
    await reload();
    onSaved();
  };

  // Trial scheduling, proposals and conversion stay on the Leads page (not refactored).
  const openOnLeadsPage = () => navigate({ to: "/leads", search: { leadId } });

  if (!lead) return null;
  return (
    <>
      <LeadDetailSheet
        lead={lead}
        packages={packages}
        teacherId={teacherId}
        historyRefreshKey={historyRefreshKey}
        onClose={onClose}
        onSaveProfile={async (current, patch) => {
          const saved = await saveLeadProfile(teacherId, current.id, patch);
          if (!saved) return false;
          setLead(saved);
          toast.success(t("leadPanel.saved"));
          onSaved();
          return true;
        }}
        onTasksChanged={onSaved}
        onRegisterInteraction={() => setInteractionOpen(true)}
        onScheduleTrial={openOnLeadsPage}
        onRecordProposal={openOnLeadsPage}
        onConvert={openOnLeadsPage}
      />
      <LeadInteractionDialog
        open={interactionOpen}
        teacherId={teacherId}
        leadId={lead.id}
        leadName={lead.full_name}
        onClose={() => setInteractionOpen(false)}
        onSaved={handleInteractionSaved}
      />
    </>
  );
}

function PaymentAction({ teacherId, invoiceId, onClose, onSaved, secondaryAction }: { teacherId: string; invoiceId: string; onClose: () => void; onSaved: () => void; secondaryAction?: React.ReactNode }) {
  const { t, lang } = useLanguage();
  const [invoice, setInvoice] = useState<RealInvoice | null>(null);

  useEffect(() => {
    let active = true;
    loadPriorityInvoice(teacherId, invoiceId)
      .then((loaded) => active && setInvoice(loaded))
      .catch((err) => {
        console.error("[PriorityModuleActions] invoice load failed:", err);
        if (active) { toast.error(t("today.resolve.loadError")); onClose(); }
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, invoiceId]);

  const L = (k: string) => t(`today.resolve.${k}`);
  return (
    <PaymentConfirmationDialog
      invoice={invoice}
      mode="pay"
      teacherId={teacherId}
      lang={lang}
      labels={{
        titlePay: L("payTitle"),
        titleEdit: L("payEditTitle"),
        description: L("payDescription"),
        paymentDate: L("payDate"),
        paymentMethod: L("payMethod"),
        confirmPay: L("payConfirm"),
        confirmEdit: L("paySave"),
        cancel: L("cancel"),
        saving: L("saving"),
        dueLabel: L("payDue"),
        successPay: L("paySuccess"),
        successEdit: L("payEditSuccess"),
        errorFallback: L("payError"),
      }}
      onClose={onClose}
      onConfirmed={onSaved}
      secondaryAction={secondaryAction}
    />
  );
}
