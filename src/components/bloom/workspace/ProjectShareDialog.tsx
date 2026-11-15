import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Crown, Loader2, LogOut, Mail, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useProjectMembers } from "@/hooks/use-project-members";
import { normalizeInviteEmail, ShareError, type InviteOutcome, type ProjectMember } from "@/lib/workspace-project-members";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ProjectDialogs";

import { PersonAvatar } from "./PersonAvatar";
export { PersonAvatar };

type Feedback = { tone: "success" | "info" | "error"; text: string };
type Confirm = { kind: "remove"; member: ProjectMember } | { kind: "leave" };

interface ProjectShareDialogProps {
  open: boolean;
  onClose: () => void;
  project: { id: string; title: string; status: string; user_id: string };
  owner: { name: string; photo: string | null };
  isOwner: boolean;
  /** Called after the participant left (navigate away: access ends immediately). */
  onLeft: () => void;
}

/**
 * Owner: invite by registered e-mail, see participants and pending invites, remove/cancel.
 * Participant: see who is in the project and leave it. All rules come from the RPCs.
 */
export function ProjectShareDialog({ open, onClose, project, owner, isOwner, onLeft }: ProjectShareDialogProps) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { members, isLoading, error, refetch, invite, remove, leave } = useProjectMembers(project.id, open);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const archived = project.status !== "active";
  const busy = invite.isPending || remove.isPending || leave.isPending;
  const errorText = (cause: unknown) => t(`workspace.share.errors.${cause instanceof ShareError ? cause.code : "generic"}`);
  const formatDate = (iso: string) => new Intl.DateTimeFormat(lang === "en" ? "en" : "pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  const outcomeFeedback = (outcome: InviteOutcome): Feedback =>
    outcome.status === "sent" ? { tone: "success", text: t("workspace.share.sent") }
      : outcome.status === "already_member" ? { tone: "info", text: t("workspace.share.alreadyMember") }
      : { tone: "info", text: t("workspace.share.cooldown").replace("{date}", formatDate(outcome.until)) };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || archived) return;
    if (!normalizeInviteEmail(email)) { setFeedback({ tone: "error", text: t("workspace.share.errors.invite_invalid_email") }); return; }
    try {
      const outcome = await invite.mutateAsync(email);
      setFeedback(outcomeFeedback(outcome));
      if (outcome.status === "sent") setEmail("");
    } catch (cause) { setFeedback({ tone: "error", text: errorText(cause) }); }
  };

  const runConfirm = async () => {
    const current = confirm;
    setConfirm(null);
    if (!current) return;
    try {
      if (current.kind === "leave") {
        await leave.mutateAsync();
        toast.success(t("workspace.share.left"));
        onClose();
        onLeft();
      } else {
        await remove.mutateAsync(current.member.member_id);
        toast.success(t(current.member.status === "pending" ? "workspace.share.inviteCancelled" : "workspace.share.removed"));
      }
    } catch (cause) { toast.error(errorText(cause)); }
  };

  const ownerName = owner.name.trim() || t("workspace.project.summary.unnamed");
  const memberName = (m: ProjectMember) => m.status === "pending" ? (m.invited_email ?? t("workspace.share.pendingInvite")) : (m.full_name?.trim() || t("workspace.project.summary.unnamed"));
  const visible = (members ?? []).filter((m) => isOwner || m.status === "accepted");

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) { setFeedback(null); onClose(); } }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg" data-testid="project-share-dialog">
          <DialogHeader>
            <DialogTitle>{t(isOwner ? "workspace.share.title" : "workspace.share.membersTitle")}</DialogTitle>
            <DialogDescription className="break-words">{project.title}</DialogDescription>
          </DialogHeader>

          {isOwner && (archived ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="share-archived">{t("workspace.share.archived")}</p>
          ) : (
            <form className="space-y-2" onSubmit={submit} noValidate>
              <Label htmlFor="share-email">{t("workspace.share.emailLabel")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="share-email" type="email" inputMode="email" autoComplete="off" value={email} disabled={busy}
                  placeholder={t("workspace.share.emailPlaceholder")} aria-describedby="share-hint"
                  onChange={(event) => { setEmail(event.target.value); setFeedback(null); }} className="flex-1" />
                <Button type="submit" disabled={busy || !email.trim()}>
                  {invite.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus aria-hidden />}
                  {t("workspace.share.invite")}
                </Button>
              </div>
              <p id="share-hint" className="text-xs text-muted-foreground">{t("workspace.share.hint")}</p>
              {feedback && <p role={feedback.tone === "error" ? "alert" : "status"} data-testid="share-feedback"
                className={cn("text-sm", feedback.tone === "error" ? "text-destructive" : feedback.tone === "success" ? "text-primary" : "text-foreground")}>{feedback.text}</p>}
            </form>
          ))}

          <section aria-label={t("workspace.share.membersTitle")} className="space-y-2">
            <h3 className="text-sm font-medium">{t("workspace.share.membersTitle")}</h3>
            <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border" data-testid="share-members">
              <li className="flex items-center gap-3 px-3 py-2.5">
                <PersonAvatar name={ownerName} photo={owner.photo} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={ownerName}>{ownerName}{project.user_id === user?.id && ` ${t("workspace.share.you")}`}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Crown className="h-3 w-3" aria-hidden />{t("workspace.share.owner")}</span>
              </li>
              {isLoading && <li className="px-3 py-3 text-sm text-muted-foreground">{t("workspace.share.loading")}</li>}
              {error && <li className="flex flex-wrap items-center gap-2 px-3 py-3 text-sm" role="alert">
                <span className="flex-1 text-destructive">{t("workspace.share.loadError")}</span>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("workspace.mural.retry")}</Button>
              </li>}
              {!isLoading && !error && visible.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground" data-testid="share-empty">{t(isOwner ? "workspace.share.emptyOwner" : "workspace.share.empty")}</li>}
              {visible.map((member) => {
                const name = memberName(member);
                return (
                  <li key={member.member_id} className="flex items-center gap-3 px-3 py-2.5" data-testid="share-member" data-status={member.status}>
                    {member.status === "pending"
                      ? <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"><Mail className="h-4 w-4" /></span>
                      : <PersonAvatar name={name} photo={member.avatar_url} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={name}>{name}{member.user_id && member.user_id === user?.id && ` ${t("workspace.share.you")}`}</p>
                      <p className="text-xs text-muted-foreground">{t(`workspace.share.status.${member.status}`)}</p>
                    </div>
                    {isOwner && member.status !== "declined" && (
                      <Button variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive" disabled={busy}
                        aria-label={`${t(member.status === "pending" ? "workspace.share.cancelInvite" : "workspace.share.remove")}: ${name}`}
                        onClick={() => setConfirm({ kind: "remove", member })}>
                        <UserMinus aria-hidden /><span className="hidden sm:inline">{t(member.status === "pending" ? "workspace.share.cancelInvite" : "workspace.share.remove")}</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {!isOwner && (
            <div className="flex justify-end">
              <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirm({ kind: "leave" })} data-testid="share-leave">
                {leave.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <LogOut aria-hidden />}{t("workspace.share.leave")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => void runConfirm()}
        title={t(confirm?.kind === "leave" ? "workspace.share.leaveTitle" : confirm?.member.status === "pending" ? "workspace.share.cancelInviteTitle" : "workspace.share.removeTitle")}
        body={confirm?.kind === "leave" ? t("workspace.share.leaveBody")
          : t(confirm?.member.status === "pending" ? "workspace.share.cancelInviteBody" : "workspace.share.removeBody").replace("{name}", confirm ? memberName(confirm.member) : "")}
        confirm={t(confirm?.kind === "leave" ? "workspace.share.leave" : confirm?.member.status === "pending" ? "workspace.share.cancelInvite" : "workspace.share.remove")} />
    </>
  );
}
