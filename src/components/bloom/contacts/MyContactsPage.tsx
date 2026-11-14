import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Clock, Loader2, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/bloom/PageHeader";
import { InfoTooltip } from "@/components/bloom/InfoTooltip";
import { useLanguage } from "@/hooks/use-language";
import { useContactActions, useTeacherContacts, useTeacherSearch, type ContactAction } from "@/hooks/use-teacher-contacts";
import { contactErrorCode, cooldownDaysLeft, type ContactEntry, type TeacherSearchResult } from "@/lib/teacher-contacts";
import { cn } from "@/lib/utils";
import { parseContactsTab, type ContactsUrlTab } from "@/lib/notification-targets";

const SUCCESS_KEY: Record<ContactAction["type"], string> = {
  send: "contacts.sent", accept: "contacts.accepted", decline: "contacts.declined", cancel: "contacts.cancelled", remove: "contacts.removed",
};

function initials(name: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function TeacherAvatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lilac-soft text-xs font-semibold text-foreground">
      {initials(name)}
    </span>
  );
}

/** One teacher row: avatar + name on the left, actions on the right; stacked when its panel is narrow. */
function TeacherRow({ name, avatar, meta, children, testId }: { name: string; avatar: string | null; meta?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <li data-testid={testId} className="flex flex-col gap-3 py-3 @lg:flex-row @lg:items-center @lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <TeacherAvatar name={name} url={avatar} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 @lg:shrink-0 @lg:justify-end">{children}</div>}
    </li>
  );
}

function StatusPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{icon}{children}</span>;
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-busy="true" className="divide-y divide-border" data-testid="contacts-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-3 py-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-40" /></li>
      ))}
    </ul>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function ErrorState({ message, retry, retryLabel }: { message: string; retry: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 p-4 text-sm">
      <p className="flex-1 text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={retry}>{retryLabel}</Button>
    </div>
  );
}

/** URL tab names ↔ internal tab values. */
const TAB_VALUE: Record<ContactsUrlTab, string> = { contacts: "contacts", received: "incoming", sent: "outgoing" };
const URL_TAB: Record<string, ContactsUrlTab> = { contacts: "contacts", incoming: "received", outgoing: "sent" };

export function MyContactsPage({ tab, onTabChange }: { tab?: ContactsUrlTab; onTabChange?: (tab: ContactsUrlTab) => void } = {}) {
  // Controlled by the URL when the route provides it; local state otherwise.
  const [localTab, setLocalTab] = useState<ContactsUrlTab>(parseContactsTab(tab) ?? "contacts");
  const currentTab = onTabChange ? parseContactsTab(tab) ?? "contacts" : localTab;
  const changeTab = (value: string) => {
    const next = URL_TAB[value] ?? "contacts";
    if (onTabChange) onTabChange(next);
    else setLocalTab(next);
  };
  const { t, lang } = useLanguage();
  const [raw, setRaw] = useState("");
  const [removing, setRemoving] = useState<ContactEntry | null>(null);
  const search = useTeacherSearch(raw);
  const contacts = useTeacherContacts();
  const { run, pendingTarget, isPending } = useContactActions();
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === "en" ? "en-US" : "pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)) : "");
  const displayName = (name: string | null) => name?.trim() || t("contacts.unnamed");
  const cooldownText = (until: string | null) => {
    const days = cooldownDaysLeft(until);
    return days === 1 ? t("contacts.cooldownOne") : t("contacts.cooldownMany").replace("{n}", String(days));
  };

  const act = async (action: ContactAction): Promise<boolean> => {
    try {
      const result = await run(action);
      if (result?.relation === "cooldown") toast.info(cooldownText(result.cooldown_until), { id: "contacts-feedback" });
      else if (result?.relation === "incoming") toast.info(t("contacts.alreadyIncoming"), { id: "contacts-feedback" });
      else if (result?.relation === "contact") toast.info(t("contacts.alreadyContact"), { id: "contacts-feedback" });
      else toast.success(t(SUCCESS_KEY[action.type]), { id: "contacts-feedback" });
      return true;
    } catch (error) {
      toast.error(t(`contacts.errors.${contactErrorCode(error)}`), { id: "contacts-feedback" });
      return false;
    }
  };
  const busy = (id: string) => pendingTarget === id;
  const spinner = (id: string, icon: ReactNode) => (busy(id) ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : icon);

  const all = contacts.data ?? [];
  const groups = {
    contact: all.filter((entry) => entry.relation === "contact"),
    incoming: all.filter((entry) => entry.relation === "incoming"),
    outgoing: all.filter((entry) => entry.relation === "outgoing"),
  };

  const searchActions = (result: TeacherSearchResult) => {
    switch (result.relation) {
      case "contact":
        return <StatusPill icon={<Check className="h-3.5 w-3.5" aria-hidden />}>{t("contacts.isContact")}</StatusPill>;
      case "outgoing":
        return <>
          <StatusPill icon={<Clock className="h-3.5 w-3.5" aria-hidden />}>{t("contacts.requestSent")}</StatusPill>
          {result.request_id && <Button variant="ghost" size="sm" disabled={isPending} onClick={() => void act({ type: "cancel", requestId: result.request_id! })}>
            {spinner(result.request_id, <X className="h-4 w-4" aria-hidden />)}{t("contacts.cancel")}</Button>}
        </>;
      case "incoming":
        return result.request_id ? <>
          <Button size="sm" disabled={isPending} onClick={() => void act({ type: "accept", requestId: result.request_id! })}>
            {spinner(result.request_id, <Check className="h-4 w-4" aria-hidden />)}{t("contacts.accept")}</Button>
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => void act({ type: "decline", requestId: result.request_id! })}>{t("contacts.decline")}</Button>
        </> : null;
      case "cooldown":
        return <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="contact-cooldown"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />{cooldownText(result.cooldown_until)}</p>;
      default:
        return <Button size="sm" disabled={isPending} onClick={() => void act({ type: "send", teacherId: result.teacher_id })}>
          {spinner(result.teacher_id, <UserPlus className="h-4 w-4" aria-hidden />)}{t("contacts.add")}</Button>;
    }
  };

  const tabLabel = (key: string, count: number, highlight = false) => (
    <span className="flex items-center gap-1.5">
      {t(key)}
      {contacts.data && <span className={cn("rounded-full px-1.5 text-[11px] font-semibold leading-5", highlight && count > 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{count}</span>}
    </span>
  );

  const listBody = (entries: ContactEntry[], emptyKey: string, render: (entry: ContactEntry) => ReactNode) => {
    if (contacts.isPending) return <ListSkeleton />;
    if (contacts.error) return <ErrorState message={t("contacts.loadError")} retry={() => void contacts.refetch()} retryLabel={t("contacts.retry")} />;
    if (entries.length === 0) return <EmptyState>{t(emptyKey)}</EmptyState>;
    return <ul className="divide-y divide-border">{entries.map(render)}</ul>;
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        className="grid-cols-1"
        eyebrow={t("communityV1.eyebrow")}
        title={t("contacts.title")}
        titleAddon={<InfoTooltip label={`${t("globalUi.aboutPage")} ${t("contacts.title")}`} text={t("contacts.info")} className="text-muted-foreground" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Search */}
        <section aria-labelledby="contacts-search-title" className="@container space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 id="contacts-search-title" className="font-display text-base font-semibold">{t("contacts.searchTitle")}</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={raw} onChange={(event) => setRaw(event.target.value)} aria-label={t("contacts.searchLabel")}
              placeholder={t("contacts.searchPlaceholder")} className="pl-9" autoComplete="off" maxLength={200} />
          </div>
          {!search.query ? (
            <p className="text-xs text-muted-foreground">{t("contacts.searchHint")}</p>
          ) : search.isPending ? (
            <ListSkeleton rows={2} />
          ) : search.error ? (
            <ErrorState message={t("contacts.searchError")} retry={() => void search.refetch()} retryLabel={t("contacts.retry")} />
          ) : (search.data ?? []).length === 0 ? (
            <EmptyState>{t("contacts.searchEmpty")}</EmptyState>
          ) : (
            <ul className="divide-y divide-border" aria-live="polite">
              {search.data!.map((result) => (
                <TeacherRow key={result.teacher_id} testId="contact-search-result" name={displayName(result.full_name)} avatar={result.avatar_url}>
                  {searchActions(result)}
                </TeacherRow>
              ))}
            </ul>
          )}
        </section>

        {/* Lists */}
        <section className="@container rounded-2xl border border-border bg-card p-4 sm:p-5">
          <Tabs value={TAB_VALUE[currentTab]} onValueChange={changeTab}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="contacts">{tabLabel("contacts.tabContacts", groups.contact.length)}</TabsTrigger>
              <TabsTrigger value="incoming">{tabLabel("contacts.tabIncoming", groups.incoming.length, true)}</TabsTrigger>
              <TabsTrigger value="outgoing">{tabLabel("contacts.tabOutgoing", groups.outgoing.length)}</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts" className="mt-3">
              {listBody(groups.contact, "contacts.emptyContacts", (entry) => (
                <TeacherRow key={entry.request_id} testId="contact-row" name={displayName(entry.full_name)} avatar={entry.avatar_url}
                  meta={entry.responded_at ? t("contacts.contactSince").replace("{date}", date(entry.responded_at)) : undefined}>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={isPending} onClick={() => setRemoving(entry)}>
                    {spinner(entry.other_id, <UserMinus className="h-4 w-4" aria-hidden />)}{t("contacts.remove")}</Button>
                </TeacherRow>
              ))}
            </TabsContent>
            <TabsContent value="incoming" className="mt-3">
              {listBody(groups.incoming, "contacts.emptyIncoming", (entry) => (
                <TeacherRow key={entry.request_id} testId="incoming-row" name={displayName(entry.full_name)} avatar={entry.avatar_url}
                  meta={`${t("contacts.wantsToConnect")} · ${t("contacts.receivedOn").replace("{date}", date(entry.created_at))}`}>
                  <Button size="sm" disabled={isPending} onClick={() => void act({ type: "accept", requestId: entry.request_id })}>
                    {spinner(entry.request_id, <Check className="h-4 w-4" aria-hidden />)}{t("contacts.accept")}</Button>
                  <Button variant="outline" size="sm" disabled={isPending} onClick={() => void act({ type: "decline", requestId: entry.request_id })}>{t("contacts.decline")}</Button>
                </TeacherRow>
              ))}
            </TabsContent>
            <TabsContent value="outgoing" className="mt-3">
              {listBody(groups.outgoing, "contacts.emptyOutgoing", (entry) => (
                <TeacherRow key={entry.request_id} testId="outgoing-row" name={displayName(entry.full_name)} avatar={entry.avatar_url}
                  meta={t("contacts.sentOn").replace("{date}", date(entry.created_at))}>
                  <Button variant="ghost" size="sm" disabled={isPending} onClick={() => void act({ type: "cancel", requestId: entry.request_id })}>
                    {spinner(entry.request_id, <X className="h-4 w-4" aria-hidden />)}{t("contacts.cancel")}</Button>
                </TeacherRow>
              ))}
            </TabsContent>
          </Tabs>
          {!contacts.isPending && !contacts.error && all.length === 0 && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" aria-hidden />{t("contacts.info")}</p>
          )}
        </section>
      </div>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !isPending) setRemoving(null); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contacts.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("contacts.removeBody").replace("{name}", displayName(removing?.full_name ?? null))}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="ghost" disabled={isPending} onClick={() => setRemoving(null)}>{t("contacts.keep")}</Button>
            <Button variant="destructive" disabled={isPending} onClick={async () => {
              if (removing && await act({ type: "remove", otherId: removing.other_id })) setRemoving(null);
            }}>{removing && spinner(removing.other_id, <UserMinus className="h-4 w-4" aria-hidden />)}{t("contacts.remove")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
