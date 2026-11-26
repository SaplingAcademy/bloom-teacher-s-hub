import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, Copy, MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { InfoTooltip } from "@/components/bloom/InfoTooltip";
import { PremiumBenefitsDialog } from "@/components/bloom/PremiumGate";
import { PlacementTemplateForm } from "@/components/placement/PlacementTemplateForm";
import { PlacementConfirm, PlacementStatusBadge, PlacementUnavailable, placementErrorMessage } from "@/components/placement/PlacementShared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useFeatureAccess, usePlan } from "@/hooks/use-plan";
import {
  PLACEMENT_NOT_DEPLOYED, createPlacementTemplate, deletePlacementTemplate, duplicatePlacementTemplate, fetchPlacementSkillCounts,
  fetchPlacementTemplates, setPlacementTemplateStatus, splitTemplates, templateActions, type PlacementTemplate,
} from "@/lib/placement";

export const Route = createFileRoute("/_app/placement")({
  head: () => ({ meta: [{ title: "Placement · Bloom" }, { name: "description", content: "English placement tests by skill." }] }),
  component: PlacementPage,
});

export const placementListKey = (userId: string | undefined) => ["placement-templates", userId] as const;

function PlacementPage() {
  const { t } = useLanguage();
  const access = useFeatureAccess("placement");
  const { user } = useAuth();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Same cache as the lists: the button only appears once the placements really loaded.
  const loaded = useQuery({ queryKey: placementListKey(user?.id), enabled: Boolean(user?.id) && access.allowed, queryFn: fetchPlacementTemplates, retry: false });

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={t("placement.title")}
        titleAddon={<InfoTooltip label={t("placement.title")} text={t("placement.info")} className="text-muted-foreground" />}
        actions={access.allowed && loaded.isSuccess ? (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5" data-testid="placement-new">
            <Plus className="h-4 w-4" /> {t("placement.new")}
          </Button>
        ) : undefined}
      />
      {access.isLoading ? (
        <PlacementListSkeleton />
      ) : !access.allowed ? (
        // The database also refuses every placement read/write without Pro (RLS); this is only the explanation.
        <section data-testid="placement-pro-gate" className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-bold">{t("placement.proTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("placement.proBody")}</p>
          <Button className="mt-5" onClick={() => setPremiumOpen(true)}>{t("placement.proCta")}</Button>
          <PremiumBenefitsDialog open={premiumOpen} onOpenChange={setPremiumOpen} />
        </section>
      ) : (
        <PlacementLists createOpen={createOpen} setCreateOpen={setCreateOpen} />
      )}
    </div>
  );
}

function PlacementListSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    </div>
  );
}

function PlacementLists({ createOpen, setCreateOpen }: { createOpen: boolean; setCreateOpen: (open: boolean) => void }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isSuperAdmin } = usePlan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const key = placementListKey(user?.id);
  const templates = useQuery({ queryKey: key, enabled: Boolean(user?.id), queryFn: fetchPlacementTemplates, retry: false });
  const counts = useQuery({ queryKey: [...key, "skill-counts"], enabled: templates.isSuccess, queryFn: fetchPlacementSkillCounts, retry: false });
  const [confirm, setConfirm] = useState<{ kind: "delete"; template: PlacementTemplate } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (error: unknown) => toast.error(placementErrorMessage(error, t));

  const create = useMutation({
    mutationFn: createPlacementTemplate,
    onSuccess: async (id) => { setCreateOpen(false); await refresh(); void navigate({ to: "/placement/$templateId", params: { templateId: id } }); },
    onError,
  });
  const duplicate = useMutation({
    mutationFn: (template: PlacementTemplate) => duplicatePlacementTemplate(template.id, user!.id, t("placement.copySuffix")),
    onSuccess: async (id) => { toast.success(t("placement.duplicated")); await refresh(); void navigate({ to: "/placement/$templateId", params: { templateId: id } }); },
    onError,
  });
  const status = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "published" | "archived" }) => setPlacementTemplateStatus(id, next),
    onSuccess: async (_d, v) => { toast.success(t(v.next === "archived" ? "placement.archived" : "placement.published")); await refresh(); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePlacementTemplate(id),
    onSuccess: async () => { setConfirm(null); toast.success(t("placement.deleted")); await refresh(); },
    onError,
  });

  if (templates.isPending) return <PlacementListSkeleton />;
  if (templates.isError) {
    if ((templates.error as Error).message === PLACEMENT_NOT_DEPLOYED) return <PlacementUnavailable />;
    return (
      <div role="alert" className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{t("placement.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void templates.refetch()}>{t("placement.retry")}</Button>
      </div>
    );
  }

  const { system, mine } = splitTemplates(templates.data);
  const busy = duplicate.isPending || status.isPending || remove.isPending;
  const card = (template: PlacementTemplate) => (
    <TemplateCard key={template.id} template={template} skills={counts.data?.[template.id]} busy={busy}
      actions={templateActions(template, { ownerId: user?.id ?? null, isSuperAdmin })}
      onDuplicate={() => duplicate.mutate(template)}
      onPublish={() => navigate({ to: "/placement/$templateId", params: { templateId: template.id } })}
      onArchive={() => status.mutate({ id: template.id, next: "archived" })}
      onRepublish={() => status.mutate({ id: template.id, next: "published" })}
      onDelete={() => setConfirm({ kind: "delete", template })}
      ownVersion={template.teacher_id === user?.id} />
  );

  return (
    <>
      <section aria-labelledby="placement-bloom" data-testid="placement-bloom" className="space-y-3">
        <div>
          <h2 id="placement-bloom" className="font-display text-base font-bold">{t("placement.bloomTemplates")}</h2>
          <p className="text-xs text-muted-foreground">{t("placement.bloomTemplatesHint")}</p>
        </div>
        {system.length === 0
          ? <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("placement.emptyBloom")}</p>
          : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{system.map(card)}</div>}
      </section>

      <section aria-labelledby="placement-mine" data-testid="placement-mine" className="space-y-3">
        <h2 id="placement-mine" className="font-display text-base font-bold">{t("placement.myTemplates")}</h2>
        {mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center">
            <ClipboardCheck className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">{t("placement.emptyMine")}</p>
            <p className="text-xs text-muted-foreground">{t("placement.emptyMineHint")}</p>
          </div>
        ) : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</div>}
      </section>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!create.isPending) setCreateOpen(open); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("placement.form.createTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("placement.info")}</DialogDescription>
          </DialogHeader>
          <PlacementTemplateForm
            initial={{ title: "", description: "", skills: [], timing: "none", testMinutes: null }}
            submitLabel={t("placement.form.saveDraft")} busy={create.isPending}
            onSubmit={(value) => create.mutate(value)} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <PlacementConfirm open={confirm?.kind === "delete"} title={t("placement.confirmDeleteTitle")} body={t("placement.confirmDeleteBody")}
        destructive busy={remove.isPending} onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.template.id)} />
    </>
  );
}

function TemplateCard({
  template, skills, actions, busy, ownVersion, onDuplicate, onPublish, onArchive, onRepublish, onDelete,
}: {
  template: PlacementTemplate;
  skills: number | undefined;
  actions: ReturnType<typeof templateActions>;
  busy: boolean;
  ownVersion: boolean;
  onDuplicate: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onRepublish: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const hasMenu = actions.publish || actions.archive || actions.republish || actions.remove;
  return (
    <article data-placement-template={template.id} data-status={template.status}
      className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-bold" title={template.title}>{template.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {skills === undefined ? " " : skills === 1 ? t("placement.skillsCountOne") : t("placement.skillsCount").replace("{n}", String(skills))}
            {" · "}{t("placement.version").replace("{n}", String(template.version))}
          </p>
        </div>
        <PlacementStatusBadge status={template.status} />
      </div>
      {template.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>}
      <div className="mt-auto flex items-center gap-1.5 pt-3">
        <Button asChild size="sm" variant={actions.edit ? "default" : "outline"} className="h-8 text-xs">
          <Link to="/placement/$templateId" params={{ templateId: template.id }}>
            {actions.edit ? t("placement.actions.edit") : t("placement.actions.view")}
          </Link>
        </Button>
        {actions.duplicate && template.status !== "draft" && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={busy} onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {ownVersion ? t("placement.actions.newVersion") : t("placement.actions.duplicate")}
          </Button>
        )}
        {hasMenu && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="ml-auto h-8 w-8" aria-label={t("placement.actions.more")} disabled={busy}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.publish && <DropdownMenuItem onSelect={onPublish}>{t("placement.actions.publish")}</DropdownMenuItem>}
              {actions.archive && <DropdownMenuItem onSelect={onArchive}>{t("placement.actions.archive")}</DropdownMenuItem>}
              {actions.republish && <DropdownMenuItem onSelect={onRepublish}>{t("placement.actions.republish")}</DropdownMenuItem>}
              {actions.remove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>{t("placement.actions.delete")}</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  );
}
