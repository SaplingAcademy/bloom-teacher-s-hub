import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Copy, DatabaseZap, Library, Lock, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { PlacementItemDialog } from "@/components/placement/PlacementItemDialog";
import { PlacementConfirm } from "@/components/placement/PlacementShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { usePlan } from "@/hooks/use-plan";
import { cn } from "@/lib/utils";
import { CEFR_LEVELS, EDITABLE_ITEM_TYPES, type CefrLevel, type PlacementItemType, type PlacementSection } from "@/lib/placement";
import {
  EMPTY_BANK_FILTERS, PLACEMENT_BANK_NOT_DEPLOYED, bankImportErrorKind, bankRowFrom, bankTopics, bankTypesForSkill, createBankItem,
  deleteBankItem, duplicateBankItem, fetchBankItems, fetchSectionBankSources, filterBankItems, importBankItems, isBankItemSelectable,
  toggleSelection, updateBankItem,
  type BankFilters, type BankImportResult, type BankItem, type BankMeta, type BankScope,
} from "@/lib/placement-bank";

const ALL = "__all";

/**
 * Question Bank picker of one draft section: Bloom official bank + the teacher's own questions,
 * always limited to the section's skill. Selected questions are copied in one atomic call
 * (placement_import_bank_items); the bank itself is never changed by an import.
 */
export function PlacementBankDialog({
  open, section, onClose, onImported,
}: {
  open: boolean;
  section: PlacementSection;
  onClose: () => void;
  onImported: (result: BankImportResult) => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isSuperAdmin } = usePlan();
  const queryClient = useQueryClient();
  const uid = user?.id ?? "";
  const skill = section.skill;

  const [scope, setScope] = useState<BankScope>("official");
  const [filters, setFilters] = useState<BankFilters>(EMPTY_BANK_FILTERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Mobile: inline preview opened only by its chevron, so fast multi-selection never shifts the list.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<null | { item: BankItem | null; official: boolean }>(null);
  const [toDelete, setToDelete] = useState<BankItem | null>(null);

  useEffect(() => {
    if (open) { setScope("official"); setFilters(EMPTY_BANK_FILTERS); setSelected([]); setFocusedId(null); setExpandedId(null); }
  }, [open, section.id]);

  const listKey = (s: BankScope) => ["placement-bank", uid, s, skill] as const;
  const official = useQuery({ queryKey: listKey("official"), enabled: open && Boolean(uid), queryFn: () => fetchBankItems("official", skill, uid), retry: false });
  const mine = useQuery({ queryKey: listKey("mine"), enabled: open && Boolean(uid), queryFn: () => fetchBankItems("mine", skill, uid), retry: false });
  const sources = useQuery({ queryKey: ["placement-bank-sources", uid, section.id], enabled: open && Boolean(uid), queryFn: () => fetchSectionBankSources(section.id), retry: false });

  const notDeployed = [official.error, mine.error, sources.error].some((e) => (e as Error | null)?.message === PLACEMENT_BANK_NOT_DEPLOYED);
  const current = scope === "official" ? official : mine;
  const added = useMemo(() => new Set(sources.data ?? []), [sources.data]);
  const byId = useMemo(() => new Map([...(official.data ?? []), ...(mine.data ?? [])].map((i) => [i.id, i])), [official.data, mine.data]);
  const scopeItems = current.data ?? [];
  const topics = useMemo(() => bankTopics(scopeItems, skill), [scopeItems, skill]);
  const visible = useMemo(() => filterBankItems(scopeItems, skill, filters), [scopeItems, skill, filters]);
  const focused = (focusedId && visible.find((i) => i.id === focusedId)) || visible[0] || null;
  const hasFilters = filters.levels.length > 0 || filters.topic !== null || filters.type !== null || filters.search.trim() !== "";

  // A topic that no longer exists in this tab is dropped from the filter.
  useEffect(() => {
    if (filters.topic && !topics.includes(filters.topic)) setFilters((f) => ({ ...f, topic: null }));
  }, [topics, filters.topic]);

  const refreshLists = () => queryClient.invalidateQueries({ queryKey: ["placement-bank", uid] });
  const onError = (error: unknown) => {
    console.error("[placement-bank] Action failed:", error);
    toast.error(t((error as Error)?.message === PLACEMENT_BANK_NOT_DEPLOYED ? "placement.bank.notDeployedBody" : "placement.actionError"));
  };

  const importMutation = useMutation({
    mutationFn: () => importBankItems(section.id, selected),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["placement-bank-sources", uid, section.id] });
      onImported(result);
    },
    onError: (error) => {
      console.error("[placement-bank] Import failed:", error);
      const kind = bankImportErrorKind(error);
      toast.error(t(kind === "locked" ? "placement.locked" : kind === "notDeployed" ? "placement.bank.notDeployedBody"
        : kind === "unavailable" ? "placement.bank.importUnavailable" : "placement.bank.importError"));
      if (kind === "unavailable") void refreshLists();
    },
  });
  const saveMutation = useMutation({
    mutationFn: async ({ item, official: isOfficial, row }: { item: BankItem | null; official: boolean; row: ReturnType<typeof bankRowFrom> }) =>
      item ? updateBankItem(item.id, row) : createBankItem(row, isOfficial),
    onSuccess: async (_d, vars) => {
      setEditor(null);
      toast.success(t("placement.bank.saved"));
      if (!vars.item) setScope(vars.official ? "official" : "mine");
      await refreshLists();
    },
    onError,
  });
  const duplicateMutation = useMutation({
    mutationFn: (item: BankItem) => duplicateBankItem(item),
    onSuccess: async () => { toast.success(t("placement.bank.duplicated")); setScope("mine"); await refreshLists(); },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (item: BankItem) => deleteBankItem(item.id),
    onSuccess: async (_d, item) => { setToDelete(null); setSelected((s) => s.filter((id) => id !== item.id)); toast.success(t("placement.bank.deleted")); await refreshLists(); },
    onError,
  });

  const selectedCount = selected.length;
  const addLabel = selectedCount === 0 ? t("placement.bank.addNone")
    : selectedCount === 1 ? t("placement.bank.addOne") : t("placement.bank.addMany").replace("{n}", String(selectedCount));
  const canManage = (item: BankItem) => (item.teacher_id === null ? isSuperAdmin : item.teacher_id === uid);
  const toggle = (item: BankItem) => {
    setFocusedId(item.id);
    if (isBankItemSelectable(item, added)) setSelected((s) => toggleSelection(s, item.id));
  };
  const skillLabel = t(`placement.skills.${skill}`);

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next && !importMutation.isPending) onClose(); }}>
        <DialogContent data-testid="placement-bank-dialog"
          className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[88dvh] sm:w-[calc(100vw-3rem)]">
          <DialogHeader className="space-y-1 border-b border-border px-4 pb-3 pt-4 pr-12 text-left sm:px-6 sm:pt-5">
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <Library className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("placement.bank.title").replace("{skill}", skillLabel)}
            </DialogTitle>
            <DialogDescription className="hidden text-sm sm:block">{t("placement.bank.subtitle")}</DialogDescription>
          </DialogHeader>

          {notDeployed ? (
            <div data-testid="placement-bank-not-deployed" className="m-auto max-w-md p-8 text-center">
              <DatabaseZap className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-3 font-display text-base font-bold">{t("placement.bank.notDeployedTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("placement.bank.notDeployedBody")}</p>
            </div>
          ) : (
            <>
              {/* Tabs + create */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-6">
                <div role="tablist" aria-label={t("placement.bank.title").replace("{skill}", skillLabel)} className="inline-flex rounded-xl bg-muted p-1">
                  {(["official", "mine"] as const).map((s) => {
                    const count = (s === "official" ? official.data : mine.data)?.length;
                    return (
                      <button key={s} type="button" role="tab" aria-selected={scope === s} data-testid={`placement-bank-tab-${s}`}
                        onClick={() => { setScope(s); setFocusedId(null); }}
                        className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                          scope === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                        {t(s === "official" ? "placement.bank.tabOfficial" : "placement.bank.tabMine")}
                        {typeof count === "number" && <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>}
                      </button>
                    );
                  })}
                </div>
                {(scope === "mine" || isSuperAdmin) && (
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" data-testid="placement-bank-new"
                    onClick={() => setEditor({ item: null, official: scope === "official" })}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(scope === "official" ? "placement.bank.newOfficial" : "placement.bank.newMine")}
                  </Button>
                )}
              </div>

              {/* Filters */}
              <div className="space-y-2.5 border-b border-border px-4 py-3 sm:px-6">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_auto_170px_170px]">
                  <div className="relative col-span-3 sm:col-span-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                      placeholder={t("placement.bank.searchPlaceholder")} aria-label={t("placement.bank.search")} className="h-9 pl-8" data-testid="placement-bank-search" />
                  </div>
                  {/* The section's skill is fixed: incompatible questions are never listed. */}
                  <div data-testid="placement-bank-skill" aria-disabled="true" title={t("placement.bank.skillLocked")}
                    aria-label={`${t("placement.bank.skill")}: ${skillLabel}`} role="note"
                    className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate font-medium">{skillLabel}</span>
                  </div>
                  <Select value={filters.topic ?? ALL} onValueChange={(v) => setFilters((f) => ({ ...f, topic: v === ALL ? null : v }))}>
                    <SelectTrigger className="h-9" aria-label={t("placement.bank.topic")} data-testid="placement-bank-topic"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("placement.bank.allTopics")}</SelectItem>
                      {topics.map((topic) => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filters.type ?? ALL} onValueChange={(v) => setFilters((f) => ({ ...f, type: v === ALL ? null : (v as PlacementItemType) }))}>
                    <SelectTrigger className="h-9" aria-label={t("placement.item.type")} data-testid="placement-bank-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("placement.bank.allTypes")}</SelectItem>
                      {bankTypesForSkill(skill).map((type) => <SelectItem key={type} value={type}>{t(`placement.item.types.${type}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("placement.item.level")}>
                  {CEFR_LEVELS.map((level) => {
                    const on = filters.levels.includes(level);
                    return (
                      <button key={level} type="button" aria-pressed={on} data-level-filter={level}
                        onClick={() => setFilters((f) => ({ ...f, levels: on ? f.levels.filter((l) => l !== level) : [...f.levels, level as CefrLevel] }))}
                        className={cn("h-7 min-w-10 rounded-full border px-2.5 text-xs font-bold transition-colors",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                        {level}
                      </button>
                    );
                  })}
                  {hasFilters && (
                    <button type="button" className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => setFilters(EMPTY_BANK_FILTERS)}>
                      <X className="h-3 w-3" aria-hidden="true" /> {t("placement.bank.clearFilters")}
                    </button>
                  )}
                </div>
              </div>

              {/* List + preview */}
              <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-h-0 overflow-y-auto px-3 py-3 sm:px-5" data-testid="placement-bank-list">
                  {current.isPending ? (
                    <div role="status" aria-busy="true" className="space-y-2">
                      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] w-full rounded-xl" />)}
                    </div>
                  ) : current.isError ? (
                    <div role="alert" className="space-y-3 p-8 text-center">
                      <p className="text-sm text-muted-foreground">{t("placement.bank.loadError")}</p>
                      <Button variant="outline" size="sm" onClick={() => void current.refetch()}>{t("placement.retry")}</Button>
                    </div>
                  ) : visible.length === 0 ? (
                    <p data-testid="placement-bank-empty" className="p-8 text-center text-sm text-muted-foreground">
                      {hasFilters ? t("placement.bank.emptyFiltered")
                        : (scope === "official" ? t("placement.bank.emptyOfficial") : t("placement.bank.emptyMine")).replace("{skill}", skillLabel)}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {visible.map((item) => {
                        const isSelected = selected.includes(item.id);
                        const isAdded = added.has(item.id);
                        const selectable = isBankItemSelectable(item, added);
                        const isFocused = focused?.id === item.id;
                        return (
                          <li key={item.id} data-bank-item={item.id} data-selected={isSelected || undefined}
                            className={cn("rounded-xl border bg-card transition-colors",
                              isSelected ? "border-primary/60 bg-primary/[0.04]" : "border-border hover:border-primary/30",
                              isFocused && "lg:ring-1 lg:ring-primary/25")}>
                            <div className="flex items-start gap-2 p-2.5 sm:p-3">
                              <button type="button" role="checkbox" aria-checked={isSelected} aria-disabled={!selectable || undefined}
                                onClick={() => toggle(item)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                <span aria-hidden="true" className={cn("mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
                                  isSelected ? "border-primary bg-primary text-primary-foreground" : selectable ? "border-input bg-background" : "border-border bg-muted")}>
                                  {(isSelected || isAdded) && <Check className={cn("h-3 w-3", isAdded && !isSelected && "text-muted-foreground")} strokeWidth={3} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="line-clamp-2 break-words text-sm text-foreground">{String(item.prompt?.text ?? "")}</span>
                                  <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold">{item.level}</Badge>
                                    <span>{t(`placement.item.types.${item.item_type}`)}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{item.topic}</span>
                                    {isAdded && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t("placement.bank.alreadyAdded")}</Badge>}
                                    {item.status !== "published" && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t(`placement.status.${item.status}`)}</Badge>}
                                  </span>
                                </span>
                              </button>
                              <div className="flex shrink-0 items-center">
                                <Button size="icon" variant="ghost" className="h-8 w-8 lg:hidden" aria-expanded={expandedId === item.id}
                                  aria-label={t("placement.bank.preview")} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} data-testid="placement-bank-expand">
                                  {expandedId === item.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                                {item.teacher_id === null && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("placement.bank.duplicateToMine")} title={t("placement.bank.duplicateToMine")}
                                    disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(item)} data-testid="placement-bank-duplicate">
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canManage(item) && EDITABLE_ITEM_TYPES.includes(item.item_type) && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("placement.bank.edit")} title={t("placement.bank.edit")}
                                    onClick={() => setEditor({ item, official: item.teacher_id === null })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canManage(item) && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={t("placement.bank.delete")} title={t("placement.bank.delete")}
                                    onClick={() => setToDelete(item)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {expandedId === item.id && (
                              <div className="border-t border-border/70 px-3 pb-3 pt-2.5 lg:hidden"><BankPreview item={item} /></div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-muted/20 p-5 lg:block" aria-label={t("placement.bank.preview")} data-testid="placement-bank-preview">
                  {focused ? <BankPreview item={focused} /> : <p className="text-sm text-muted-foreground">{t("placement.bank.previewEmpty")}</p>}
                </aside>
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2 text-sm">
                  <span data-testid="placement-bank-count" className="font-medium tabular-nums">
                    {selectedCount === 1 ? t("placement.bank.selectedOne") : t("placement.bank.selectedMany").replace("{n}", String(selectedCount))}
                  </span>
                  {selectedCount > 0 && (
                    <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setSelected([])}>
                      {t("placement.bank.clearSelection")}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="hidden sm:inline-flex" onClick={onClose} disabled={importMutation.isPending}>{t("placement.cancel")}</Button>
                  <Button onClick={() => importMutation.mutate()} disabled={selectedCount === 0 || importMutation.isPending} data-testid="placement-bank-add">
                    {importMutation.isPending ? t("placement.bank.adding") : addLabel}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {editor && (
        <PlacementItemDialog open skill={skill} item={editor.item} itemTimeLimits={false} busy={saveMutation.isPending}
          bank={{
            official: editor.official && isSuperAdmin,
            initial: { topic: editor.item?.topic ?? "", subskill: editor.item?.subskill ?? "", published: editor.item ? editor.item.status === "published" : !editor.official },
          }}
          onClose={() => setEditor(null)}
          onSave={(payload, meta) => {
            const m: BankMeta = meta ?? { topic: "", subskill: "", published: true };
            // Teachers' own questions are always usable; only the official bank has a publish choice.
            const row = bankRowFrom(skill, payload, { ...m, published: editor.official ? m.published : true });
            saveMutation.mutate({ item: editor.item, official: editor.official, row });
          }} />
      )}
      <PlacementConfirm open={toDelete !== null} title={t("placement.bank.confirmDeleteTitle")} body={t("placement.bank.confirmDeleteBody")}
        destructive busy={deleteMutation.isPending} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && deleteMutation.mutate(toDelete)} />
    </>
  );
}

/** Read-only preview of a bank question, including its answer key (teacher-only view). */
function BankPreview({ item }: { item: BankItem }) {
  const { t } = useLanguage();
  const key = item.answer_key ?? {};
  const correct = Array.isArray(key.correct) ? (key.correct as unknown[]).map(Number) : [];
  const manual = item.item_type === "open_text" || item.item_type === "oral_response";
  return (
    <div className="space-y-3 text-sm" data-bank-preview={item.id}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {item.topic}{item.subskill ? ` · ${item.subskill}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold">{item.level}</Badge>
          <span>{t(`placement.item.types.${item.item_type}`)}</span>
          <span aria-hidden="true">·</span>
          <span>{t("placement.bank.pointsShort").replace("{n}", String(Number(item.points)))}</span>
          {item.is_screening && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t("placement.editor.screening")}</Badge>}
          {manual && <span>· {t("placement.editor.manual")}</span>}
        </div>
      </div>
      {typeof item.prompt?.passage === "string" && item.prompt.passage && (
        <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{item.prompt.passage}</p>
      )}
      <p className="whitespace-pre-wrap break-words font-medium leading-relaxed">{String(item.prompt?.text ?? "")}</p>
      {Array.isArray(item.options) && item.options.length > 0 && (
        <ul className="space-y-1.5">
          {item.options.map((option, index) => {
            const right = correct.includes(index);
            return (
              <li key={index} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                right ? "border-primary/40 bg-primary/[0.06] text-foreground" : "border-border text-muted-foreground")}>
                <span className="w-4 shrink-0 text-xs font-semibold">{String.fromCharCode(65 + index)}</span>
                <span className="min-w-0 flex-1 break-words">{String(option)}</span>
                {right && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-label={t("placement.item.markCorrect")} />}
              </li>
            );
          })}
        </ul>
      )}
      {item.item_type === "true_false" && typeof key.correct === "boolean" && (
        <p className="text-xs"><span className="text-muted-foreground">{t("placement.item.trueFalseAnswer")}: </span>
          <span className="font-semibold text-primary">{t(key.correct ? "placement.item.true" : "placement.item.false")}</span></p>
      )}
      {item.item_type === "gap_fill" && Array.isArray(key.accepted) && (
        <p className="text-xs"><span className="text-muted-foreground">{t("placement.item.accepted")}: </span>
          <span className="font-semibold text-primary">{(key.accepted as unknown[]).map(String).join(" · ")}</span></p>
      )}
      {manual && typeof (item.rubric as { guidance?: unknown } | null)?.guidance === "string" && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("placement.item.rubric")}: </span>{String((item.rubric as { guidance: string }).guidance)}
        </p>
      )}
    </div>
  );
}
