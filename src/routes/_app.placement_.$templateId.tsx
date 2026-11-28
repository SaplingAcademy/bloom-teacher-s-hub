import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Library, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { PlacementBankDialog } from "@/components/placement/PlacementBankDialog";
import { PlacementItemDialog } from "@/components/placement/PlacementItemDialog";
import { PlacementTemplateForm } from "@/components/placement/PlacementTemplateForm";
import { PlacementConfirm, PlacementStatusBadge, PlacementUnavailable, placementErrorMessage } from "@/components/placement/PlacementShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useFeatureAccess, usePlan } from "@/hooks/use-plan";
import {
  PLACEMENT_NOT_DEPLOYED, canPublishTemplate, createPlacementItem, deletePlacementItem, deletePlacementTemplate, duplicatePlacementTemplate,
  fetchPlacementTemplate, savePlacementSkills, setPlacementTemplateStatus, skillAcceptsNewItems, templateActions, templateSettingsFor, timingOf,
  updatePlacementItem, updatePlacementTemplate, updateSectionSettings,
  type ItemPayload, type PlacementItem, type PlacementSection, type TemplateDraftInput,
} from "@/lib/placement";
import type { BankImportResult } from "@/lib/placement-bank";

export const Route = createFileRoute("/_app/placement_/$templateId")({
  head: () => ({ meta: [{ title: "Placement · Bloom" }] }),
  component: PlacementEditorPage,
});

function PlacementEditorPage() {
  const { templateId } = Route.useParams();
  const { t } = useLanguage();
  const access = useFeatureAccess("placement");
  return (
    <div className="space-y-5 pb-12">
      <Link to="/placement" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("placement.editor.back")}
      </Link>
      {access.isLoading ? <EditorSkeleton /> : !access.allowed ? (
        <p data-testid="placement-pro-gate" className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t("placement.proTitle")}</p>
      ) : <PlacementEditor templateId={templateId} />}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

function PlacementEditor({ templateId }: { templateId: string }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isSuperAdmin } = usePlan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const key = ["placement-template", user?.id, templateId] as const;
  const detail = useQuery({ queryKey: key, enabled: Boolean(user?.id), queryFn: () => fetchPlacementTemplate(templateId), retry: false });
  const [itemDialog, setItemDialog] = useState<{ section: PlacementSection; item: PlacementItem | null } | null>(null);
  const [bankSection, setBankSection] = useState<PlacementSection | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "deleteItem"; item: PlacementItem } | { kind: "publish" } | { kind: "deleteTemplate" }>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ["placement-templates", user?.id] });
  };
  const onError = (error: unknown) => toast.error(placementErrorMessage(error, t));

  const saveSettings = useMutation({
    mutationFn: async (value: TemplateDraftInput) => {
      const current = detail.data!;
      await updatePlacementTemplate(templateId, {
        title: value.title.trim(), description: value.description.trim() || null,
        settings: templateSettingsFor(value.timing, value.testMinutes, current.template.settings),
      });
      await savePlacementSkills(templateId, current.sections, value.skills);
    },
    onSuccess: async () => { toast.success(t("placement.saved")); await refresh(); },
    onError,
  });
  const saveItem = useMutation({
    mutationFn: async ({ section, item, payload }: { section: PlacementSection; item: PlacementItem | null; payload: ItemPayload }) => {
      if (item) return updatePlacementItem(item.id, payload);
      const positions = detail.data!.items.filter((i) => i.section_id === section.id).map((i) => i.position);
      return createPlacementItem(section, (positions.length ? Math.max(...positions) : 0) + 1, payload);
    },
    onSuccess: async () => { setItemDialog(null); toast.success(t("placement.editor.questionSaved")); await refresh(); },
    onError,
  });
  const removeItem = useMutation({
    mutationFn: (item: PlacementItem) => deletePlacementItem(item.id),
    onSuccess: async () => { setConfirm(null); toast.success(t("placement.editor.questionDeleted")); await refresh(); },
    onError,
  });
  const sectionLimit = useMutation({
    mutationFn: ({ section, minutes }: { section: PlacementSection; minutes: number | null }) => {
      const settings = { ...(section.settings ?? {}) };
      if (minutes) settings.time_limit_seconds = minutes * 60; else delete settings.time_limit_seconds;
      return updateSectionSettings(section.id, settings);
    },
    onSuccess: async () => { toast.success(t("placement.saved")); await refresh(); },
    onError,
  });
  const status = useMutation({
    mutationFn: (next: "published" | "archived") => setPlacementTemplateStatus(templateId, next),
    onSuccess: async (_d, next) => { setConfirm(null); toast.success(t(next === "archived" ? "placement.archived" : "placement.published")); await refresh(); },
    onError,
  });
  const duplicate = useMutation({
    mutationFn: () => duplicatePlacementTemplate(templateId, user!.id, t("placement.copySuffix")),
    onSuccess: async (id) => { toast.success(t("placement.duplicated")); await refresh(); void navigate({ to: "/placement/$templateId", params: { templateId: id } }); },
    onError,
  });
  const removeTemplate = useMutation({
    mutationFn: () => deletePlacementTemplate(templateId),
    onSuccess: async () => { toast.success(t("placement.deleted")); await queryClient.invalidateQueries({ queryKey: ["placement-templates", user?.id] }); void navigate({ to: "/placement" }); },
    onError,
  });

  const onBankImported = async (result: BankImportResult) => {
    setBankSection(null);
    const added = result.inserted === 1 ? t("placement.bank.importedOne") : t("placement.bank.importedMany").replace("{n}", String(result.inserted));
    const skipped = result.skipped_ids.length;
    toast.success(skipped ? `${added} ${(skipped === 1 ? t("placement.bank.skippedOne") : t("placement.bank.skippedMany")).replace("{n}", String(skipped))}` : added);
    await refresh();
  };

  const sections = useMemo(() => [...(detail.data?.sections ?? [])].sort((a, b) => a.position - b.position), [detail.data]);

  if (detail.isPending) return <EditorSkeleton />;
  if (detail.isError) {
    if ((detail.error as Error).message === PLACEMENT_NOT_DEPLOYED) return <PlacementUnavailable />;
    return (
      <div role="alert" className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{t("placement.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>{t("placement.retry")}</Button>
      </div>
    );
  }
  if (!detail.data) return <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t("placement.editor.notFound")}</p>;

  const { template, items } = detail.data;
  const actions = templateActions(template, { ownerId: user?.id ?? null, isSuperAdmin });
  const editable = actions.edit;
  const timing = timingOf(template);
  const own = template.teacher_id === user?.id;
  const busy = status.isPending || duplicate.isPending || removeTemplate.isPending;

  return (
    <div className="space-y-5" data-testid="placement-editor" data-editable={editable || undefined}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words font-display text-2xl font-bold">{template.title}</h1>
            <PlacementStatusBadge status={template.status} />
            <span className="text-xs text-muted-foreground">{t("placement.version").replace("{n}", String(template.version))}</span>
          </div>
          {template.description && <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.publish && <Button size="sm" onClick={() => setConfirm({ kind: "publish" })} disabled={busy}>{t("placement.actions.publish")}</Button>}
          {actions.archive && <Button size="sm" variant="outline" onClick={() => status.mutate("archived")} disabled={busy}>{t("placement.actions.archive")}</Button>}
          {actions.republish && <Button size="sm" variant="outline" onClick={() => status.mutate("published")} disabled={busy}>{t("placement.actions.republish")}</Button>}
          {template.status !== "draft" && (
            <Button size="sm" variant={editable ? "ghost" : "default"} className="gap-1" onClick={() => duplicate.mutate()} disabled={busy} data-testid="placement-duplicate">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {own ? t("placement.actions.newVersion") : t("placement.actions.duplicate")}
            </Button>
          )}
          {actions.remove && (
            <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={() => setConfirm({ kind: "deleteTemplate" })} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("placement.actions.delete")}
            </Button>
          )}
        </div>
      </header>

      {!editable && (
        <p data-testid="placement-readonly" className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {template.teacher_id === null ? t("placement.editor.readOnlySystem") : t("placement.editor.readOnlyFrozen")}
        </p>
      )}

      {editable && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="placement-settings-title">
          <h2 id="placement-settings-title" className="mb-4 font-display text-base font-bold">{t("placement.form.settingsTitle")}</h2>
          <PlacementTemplateForm
            key={template.updated_at}
            initial={{ title: template.title, description: template.description ?? "", skills: sections.map((s) => s.skill), timing: timing.mode, testMinutes: timing.testMinutes }}
            submitLabel={t("placement.form.save")} busy={saveSettings.isPending} warnOnRemove
            onSubmit={(value) => saveSettings.mutate(value)} />
        </section>
      )}

      <div className="space-y-4">
        {sections.map((section) => {
          const sectionItems = items.filter((i) => i.section_id === section.id).sort((a, b) => a.position - b.position);
          const limitSeconds = Number(section.settings?.time_limit_seconds) || null;
          const canAdd = editable && skillAcceptsNewItems(section.skill);
          return (
            <section key={section.id} data-placement-section={section.skill} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{section.position}</span>
                  <h2 className="font-display text-base font-bold">{t(`placement.skills.${section.skill}`)}</h2>
                  <span className="text-xs text-muted-foreground">
                    {sectionItems.length === 0 ? t("placement.editor.questionsNone")
                      : sectionItems.length === 1 ? t("placement.editor.questionsOne") : t("placement.editor.questions").replace("{n}", String(sectionItems.length))}
                  </span>
                  {timing.mode === "skill" && !editable && limitSeconds && (
                    <Badge variant="outline" className="text-[10px]">{t("placement.editor.skillLimit").replace("{m}", String(Math.round(limitSeconds / 60)))}</Badge>
                  )}
                </div>
                {canAdd && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setBankSection(section)} data-testid={`placement-bank-${section.skill}`}>
                      <Library className="h-3.5 w-3.5" aria-hidden="true" /> {t("placement.editor.addFromBank")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setItemDialog({ section, item: null })} data-testid={`placement-add-${section.skill}`}>
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t("placement.editor.createQuestion")}
                    </Button>
                  </div>
                )}
              </div>
              {editable && timing.mode === "skill" && (
                <SectionLimit section={section} busy={sectionLimit.isPending} onSave={(minutes) => sectionLimit.mutate({ section, minutes })} />
              )}
              {editable && section.skill === "listening" && (
                <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t("placement.editor.listeningUnavailable")}</p>
              )}
              {sectionItems.length > 0 && (
                <ol className="mt-3 divide-y divide-border/60">
                  {sectionItems.map((item) => (
                    <li key={item.id} data-placement-item={item.id} className="flex items-start gap-3 py-2.5">
                      <span className="w-5 shrink-0 pt-0.5 text-center text-xs font-semibold tabular-nums text-muted-foreground">{item.position}</span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm">{String(item.prompt?.text ?? "")}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold">{item.level}</Badge>
                          <span>{t(`placement.item.types.${item.item_type}`)}</span>
                          {item.is_screening && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t("placement.editor.screening")}</Badge>}
                          {(item.item_type === "open_text" || item.item_type === "oral_response") && <span>· {t("placement.editor.manual")}</span>}
                          {!item.active && <span>· {t("placement.editor.inactive")}</span>}
                          {Number(item.metadata?.time_limit_seconds) > 0 && <span>· {t("placement.editor.timeLimit").replace("{s}", String(item.metadata.time_limit_seconds))}</span>}
                        </div>
                      </div>
                      {editable && (
                        <div className="flex shrink-0 gap-0.5">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("placement.editor.editQuestion")} onClick={() => setItemDialog({ section, item })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={t("placement.editor.deleteQuestion")}
                            onClick={() => setConfirm({ kind: "deleteItem", item })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      {itemDialog && (
        <PlacementItemDialog open skill={itemDialog.section.skill} item={itemDialog.item} itemTimeLimits={timing.mode === "item"}
          busy={saveItem.isPending} onClose={() => setItemDialog(null)}
          onSave={(payload) => saveItem.mutate({ section: itemDialog.section, item: itemDialog.item, payload })} />
      )}

      {bankSection && (
        <PlacementBankDialog open section={bankSection} onClose={() => setBankSection(null)} onImported={(result) => void onBankImported(result)} />
      )}

      <PlacementConfirm open={confirm?.kind === "deleteItem"} title={t("placement.editor.confirmDeleteQuestionTitle")} body={t("placement.editor.confirmDeleteQuestionBody")}
        destructive busy={removeItem.isPending} onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "deleteItem" && removeItem.mutate(confirm.item)} />
      <PlacementConfirm open={confirm?.kind === "publish"} title={t("placement.confirmPublishTitle")}
        body={canPublishTemplate(sections, items) ? t("placement.confirmPublishBody") : t("placement.publishNeedsItems")}
        busy={status.isPending} onCancel={() => setConfirm(null)}
        onConfirm={() => { if (canPublishTemplate(sections, items)) status.mutate("published"); else setConfirm(null); }} />
      <PlacementConfirm open={confirm?.kind === "deleteTemplate"} title={t("placement.confirmDeleteTitle")} body={t("placement.confirmDeleteBody")}
        destructive busy={removeTemplate.isPending} onCancel={() => setConfirm(null)} onConfirm={() => removeTemplate.mutate()} />
    </div>
  );
}

function SectionLimit({ section, busy, onSave }: { section: PlacementSection; busy: boolean; onSave: (minutes: number | null) => void }) {
  const { t } = useLanguage();
  const saved = Number(section.settings?.time_limit_seconds) ? String(Math.round(Number(section.settings.time_limit_seconds) / 60)) : "";
  const [value, setValue] = useState(saved);
  const minutes = value ? Number(value) : null;
  const valid = minutes === null || (Number.isInteger(minutes) && minutes >= 1 && minutes <= 300);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label htmlFor={`limit-${section.id}`} className="text-xs text-muted-foreground">{t("placement.form.skillMinutes")}</label>
      <Input id={`limit-${section.id}`} type="number" min={1} max={300} className="h-8 w-20" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!valid || undefined} />
      <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy || !valid || value === saved} onClick={() => onSave(minutes)}>{t("placement.form.save")}</Button>
    </div>
  );
}
