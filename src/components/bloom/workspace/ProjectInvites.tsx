import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Loader2, Mailbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useMyProjectInvites } from "@/hooks/use-project-members";
import { ShareError, type ProjectInvite } from "@/lib/workspace-project-members";
import { PersonAvatar } from "./ProjectShareDialog";

/**
 * Invites received by the signed-in teacher (list_my_project_invites), shown above the projects
 * list. Hidden when there are none; accepting opens the project.
 */
export function ProjectInvites() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { invites, error, refetch, respond } = useMyProjectInvites();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (error) return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 p-4 text-sm" data-testid="invites-error">
      <p className="flex-1 text-destructive">{t("workspace.invites.loadError")}</p>
      <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("workspace.mural.retry")}</Button>
    </div>
  );
  if (!invites?.length) return null;

  const answer = async (invite: ProjectInvite, accept: boolean) => {
    if (busyId) return;
    setBusyId(invite.member_id);
    try {
      await respond.mutateAsync({ memberId: invite.member_id, accept });
      toast.success(t(accept ? "workspace.invites.accepted" : "workspace.invites.declined"));
      if (accept) void navigate({ to: "/workspace/projects/$projectId", params: { projectId: invite.project_id } });
    } catch (cause) {
      toast.error(t(`workspace.share.errors.${cause instanceof ShareError ? cause.code : "generic"}`));
    } finally { setBusyId(null); }
  };

  return (
    <section aria-label={t("workspace.invites.title")} className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5" data-testid="project-invites">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Mailbox className="h-4 w-4 text-primary" aria-hidden />{t("workspace.invites.title")}
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{invites.length}</span></h2>
      <ul className="mt-3 space-y-2">
        {invites.map((invite) => {
          const inviter = invite.inviter_name?.trim() || t("workspace.project.summary.unnamed");
          const busy = busyId === invite.member_id;
          return (
            <li key={invite.member_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center" data-testid="project-invite">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <PersonAvatar name={inviter} photo={invite.inviter_avatar} />
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{invite.project_title}</p>
                  <p className="text-xs text-muted-foreground">{t("workspace.invites.from").replace("{name}", inviter)}</p>
                </div>
              </div>
              <div className="flex gap-2 sm:shrink-0">
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" disabled={Boolean(busyId)} onClick={() => void answer(invite, false)}>
                  <X aria-hidden />{t("workspace.invites.decline")}
                </Button>
                <Button size="sm" className="flex-1 sm:flex-none" disabled={Boolean(busyId)} onClick={() => void answer(invite, true)}>
                  {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Check aria-hidden />}{t("workspace.invites.accept")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
