import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileSignature, FileText, HelpCircle, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import {
  ContractError, createStudentContract, deleteContractDocument, getContractDocumentSignedUrl,
  listContractDocuments, listStudentContracts, setStudentContractStatus, updateStudentContract, uploadContractDocument,
} from "@/lib/student-contracts";
import {
  emptyContractForm, formFromContract, formToCreateInput, formToPatch, splitContracts, suggestDatesFromPackage,
  validateContractForm, type ContractFormState, type CurrentPackageRef,
} from "@/lib/contract-form";
import { CONTRACT_SIGNER_TYPES, CONTRACT_STATUSES, type ContractStatus, type StudentContractDocumentRow, type StudentContractRow } from "@/types/contracts";

const statusVariant: Record<ContractStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", active: "default", renewed: "secondary", completed: "secondary", cancelled: "destructive",
};

function fmtDate(d: string | null, lang: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US");
}

export function StudentContractsSection({ studentId }: { studentId: string }) {
  const { t, lang } = useLanguage();
  const [contracts, setContracts] = useState<StudentContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pkg, setPkg] = useState<CurrentPackageRef | null>(null);
  const [editing, setEditing] = useState<StudentContractRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try { setContracts(await listStudentContracts(studentId)); }
    catch (e) { console.error(e); setLoadError(true); }
    finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("student_packages").select("id, started_at, ended_at")
        .eq("student_id", studentId).eq("status", "active")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (!alive) return;
      if (error) { console.error(error); setPkg(null); return; }
      setPkg(data ? { id: data.id, startDate: data.started_at ?? null, endDate: data.ended_at ?? null } : null);
    })();
    return () => { alive = false; };
  }, [studentId]);

  const { current, history } = splitContracts(contracts);

  const card = (c: StudentContractRow, highlight = false) => (
    <button
      key={c.id}
      type="button"
      onClick={() => setEditing(c)}
      className={`w-full text-left rounded-2xl border p-4 transition-colors hover:bg-secondary/40 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display font-semibold text-foreground">{c.title || t("contracts.untitled")}</span>
        <Badge variant={statusVariant[c.status]}>{t(`contracts.status_${c.status}`)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {fmtDate(c.start_date, lang)} — {c.end_date ? fmtDate(c.end_date, lang) : t("contracts.indefiniteShort")}
        {c.signer_name ? ` · ${c.signer_name}` : ""}
      </p>
    </button>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-sm)] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-primary" aria-hidden />{t("contracts.title")}
        </h3>
        <Button onClick={() => setEditing("new")} size="sm"><Plus className="h-4 w-4" />{t("contracts.new")}</Button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("contracts.loading")}</p>
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          {t("contracts.loadError")}<Button variant="outline" size="sm" onClick={() => void load()}>{t("contracts.retry")}</Button>
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">{t("contracts.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("contracts.emptyBody")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {current && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("contracts.current")}</p>
              {card(current, true)}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("contracts.history")}</p>
            {history.length ? history.map((c) => card(c)) : <p className="text-sm text-muted-foreground">{t("contracts.noHistory")}</p>}
          </div>
        </div>
      )}

      {editing && (
        <ContractDialog
          key={editing === "new" ? "new" : editing.id}
          studentId={studentId}
          contract={editing === "new" ? null : editing}
          pkg={pkg}
          onClose={() => setEditing(null)}
          onSaved={(c) => { setEditing(c); void load(); }}
        />
      )}
    </section>
  );
}

function ContractDialog({ studentId, contract, pkg, onClose, onSaved }: {
  studentId: string; contract: StudentContractRow | null; pkg: CurrentPackageRef | null;
  onClose: () => void; onSaved: (c: StudentContractRow) => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<ContractFormState>(() => (contract ? formFromContract(contract) : emptyContractForm()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ContractFormState>(k: K, v: ContractFormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const invalid = validateContractForm(form);
    if (invalid) { setError(t(`contracts.${invalid}`)); return; }
    setSaving(true); setError(null);
    try {
      const saved = contract
        ? await updateStudentContract(contract.id, formToPatch(form, pkg, contract.student_package_id))
        : await createStudentContract(formToCreateInput(studentId, form, pkg));
      toast.success(t(contract ? "contracts.saved" : "contracts.created"));
      onSaved(saved);
    } catch (e) { console.error(e); setError(t("contracts.saveError")); }
    finally { setSaving(false); }
  };

  const changeStatus = async (status: ContractStatus) => {
    if (!contract) return;
    setSaving(true); setError(null);
    try { onSaved(await setStudentContractStatus(contract.id, status)); toast.success(t("contracts.statusSaved")); }
    catch (e) { console.error(e); setError(t("contracts.saveError")); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{contract ? t("contracts.edit") : t("contracts.new")}</DialogTitle>
          <DialogDescription>{t(`contracts.status_${contract?.status ?? "draft"}`)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {contract && (
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("contracts.status")}</Label>
              <Select value={contract.status} onValueChange={(v) => void changeStatus(v as ContractStatus)} disabled={saving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`contracts.status_${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ct-title">{t("contracts.fieldTitle")}</Label>
            <Input id="ct-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-border p-3 space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={form.linkPackage}
                disabled={!pkg && !contract?.student_package_id}
                onCheckedChange={(v) => setForm((f) => {
                  const next = { ...f, linkPackage: v === true };
                  return v === true && !contract ? suggestDatesFromPackage(next, pkg) : next;
                })}
              />
              {t("contracts.linkPackage")}
            </label>
            <p className="text-xs text-muted-foreground">{pkg || contract?.student_package_id ? t("contracts.linkPackageHint") : t("contracts.noPackage")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ct-start">{t("contracts.start")}</Label>
            <Input id="ct-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-end">{t("contracts.end")}</Label>
            <Input id="ct-end" type="date" value={form.indefinite ? "" : form.endDate} disabled={form.indefinite} onChange={(e) => set("endDate", e.target.value)} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <Checkbox checked={form.indefinite} onCheckedChange={(v) => setForm((f) => ({ ...f, indefinite: v === true, endDate: v === true ? "" : f.endDate }))} />
            {t("contracts.indefinite")}
          </label>

          <div className="space-y-2">
            <Label>{t("contracts.signerType")}</Label>
            <Select value={form.signerType} onValueChange={(v) => set("signerType", v as ContractFormState["signerType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_SIGNER_TYPES.map((s) => <SelectItem key={s} value={s}>{t(`contracts.signer_${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-sname">{t("contracts.signerName")}</Label>
            <Input id="ct-sname" value={form.signerName} onChange={(e) => set("signerName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-email">{t("contracts.email")}</Label>
            <Input id="ct-email" type="email" value={form.signerEmail} onChange={(e) => set("signerEmail", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-phone">{t("contracts.phone")}</Label>
            <Input id="ct-phone" value={form.signerPhone} onChange={(e) => set("signerPhone", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ct-doc">{t("contracts.document")}</Label>
            <Input id="ct-doc" value={form.signerDocument} onChange={(e) => set("signerDocument", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ct-notes">{t("contracts.notes")}</Label>
            <Textarea id="ct-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-3 text-sm">
            <Switch checked={form.remindersEnabled} onCheckedChange={(v) => set("remindersEnabled", v)} />
            {t("contracts.reminders")}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={t("contracts.remindersHelpTitle")} className="inline-flex shrink-0">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-72 text-left">
                  <p className="font-semibold">{t("contracts.remindersHelpTitle")}</p>
                  <p className="font-normal">{t("contracts.remindersHelp")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t("contracts.close")}</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? t("contracts.saving") : t("contracts.save")}
          </Button>
        </DialogFooter>

        <div className="border-t border-border pt-4">
          {contract ? <ContractDocuments contractId={contract.id} /> : <p className="text-sm text-muted-foreground">{t("contracts.saveFirst")}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContractDocuments({ contractId }: { contractId: string }) {
  const { t, lang } = useLanguage();
  const [docs, setDocs] = useState<StudentContractDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<StudentContractDocumentRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocs(await listContractDocuments(contractId)); setError(null); }
    catch (e) { console.error(e); setError(t("contracts.docsLoadError")); }
    finally { setLoading(false); }
  }, [contractId, t]);
  useEffect(() => { void load(); }, [load]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await uploadContractDocument({ contractId, file, fileName: file.name });
      toast.success(t("contracts.uploaded")); await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof ContractError && e.code === "record_failed_orphan" ? t("contracts.orphanError") : t("contracts.uploadError"));
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const open = async (d: StudentContractDocumentRow, download: boolean) => {
    try {
      const url = await getContractDocumentSignedUrl(d.file_path, download ? { download: d.file_name } : {});
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) { console.error(e); setError(t("contracts.urlError")); }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true); setError(null);
    try { await deleteContractDocument(toDelete.id); toast.success(t("contracts.deleted")); await load(); }
    catch (e) { console.error(e); setError(t("contracts.deleteError")); await load(); }
    finally { setBusy(false); setToDelete(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display font-semibold">{t("contracts.documents")}</h4>
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}{busy ? t("contracts.uploading") : t("contracts.attach")}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("contracts.loading")}</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("contracts.noDocuments")}</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.file_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => void open(d, false)}><Eye className="h-4 w-4" />{t("contracts.view")}</Button>
                <Button variant="ghost" size="sm" onClick={() => void open(d, true)}><Download className="h-4 w-4" />{t("contracts.download")}</Button>
                <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => setToDelete(d)}><Trash2 className="h-4 w-4" />{t("contracts.delete")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => { if (!o && !busy) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contracts.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.file_name} — {t("contracts.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("contracts.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void confirmDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("contracts.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
