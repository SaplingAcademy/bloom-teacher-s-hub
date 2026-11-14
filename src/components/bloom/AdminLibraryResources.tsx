import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, Search, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { usePlan } from "@/hooks/use-plan";
import { LIBRARY_CATALOG, type LibraryResource } from "@/lib/library-catalog";
import {
  ADMIN_LIBRARY_QUERY_KEY, fetchLibraryClassifications, resourceAccessLevel, resourceAvailability, setLibraryAvailability, setLibraryClassification,
  type LibraryAvailability,
} from "@/lib/library-access";
import type { SubscriptionPlan } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AdminLibraryResources() {
  const { t } = useLanguage();
  const { isSuperAdmin } = usePlan();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // One confirmation dialog for both independent controls: Free/Premium and availability (SOON).
  const [pending, setPending] = useState<
    | { kind: "level"; resource: LibraryResource; level: SubscriptionPlan }
    | { kind: "availability"; resource: LibraryResource; availability: LibraryAvailability }
    | null
  >(null);
  const query = useQuery({ queryKey: ADMIN_LIBRARY_QUERY_KEY, queryFn: fetchLibraryClassifications, enabled: isSuperAdmin, staleTime: 0, refetchOnWindowFocus: "always" });
  const mutation = useMutation({
    mutationFn: (change: NonNullable<typeof pending>) => change.kind === "level"
      ? setLibraryClassification(change.resource.id, change.level)
      : setLibraryAvailability(change.resource.id, change.availability),
    onSuccess: async () => {
      toast.success(t("libraryAccess.saved"));
      setPending(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_LIBRARY_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["library-access"] }),
      ]);
    },
    onError: () => toast.error(t("libraryAccess.saveError")),
  });
  if (!isSuperAdmin) return null;
  const resources = LIBRARY_CATALOG.filter((item) => item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h2 className="font-display text-xl font-bold">{t("libraryAccess.adminTitle")}</h2>
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("libraryAccess.search")} aria-label={t("libraryAccess.search")} />
      </div>
      {query.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : query.isError ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{t("libraryAccess.loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>{t("common.tryAgain")}</Button>
        </div>
      ) : resources.length === 0 ? <p className="text-sm text-muted-foreground">{t("libraryAccess.empty")}</p> : (
        <ul className="divide-y divide-border">
          {resources.map((resource) => {
            const level = resourceAccessLevel(resource.id, query.data);
            const availability = resourceAvailability(resource.id, query.data);
            return <li key={resource.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-semibold">{resource.title}</p>
                <p className="text-xs text-muted-foreground">{t(`libraryAccess.categories.${resource.category}`)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {availability === "soon" && <Badge variant="outline" className="font-semibold tracking-wide">SOON</Badge>}
                <Badge variant={level === "pro" ? "default" : "secondary"}>{level === "pro" ? t("libraryAccess.premium") : t("libraryAccess.free")}</Badge>
                <Button size="sm" variant="outline" disabled={level === null || mutation.isPending} onClick={() => setPending({ kind: "level", resource, level: level === "pro" ? "free" : "pro" })}>
                  {level === "pro" ? <Unlock /> : <Lock />}
                  {level === "pro" ? t("libraryAccess.makeFree") : t("libraryAccess.makePremium")}
                </Button>
                <Button size="sm" variant="outline" disabled={availability === null || mutation.isPending}
                  onClick={() => setPending({ kind: "availability", resource, availability: availability === "soon" ? "available" : "soon" })}>
                  {availability === "soon" ? <Unlock /> : <Clock />}
                  {availability === "soon" ? t("libraryAccess.release") : t("libraryAccess.markSoon")}
                </Button>
              </div>
            </li>;
          })}
        </ul>
      )}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("libraryAccess.confirmTitle")}</DialogTitle>
            <DialogDescription>{pending ? t(pending.kind === "level"
              ? pending.level === "pro" ? "libraryAccess.confirmPremium" : "libraryAccess.confirmFree"
              : pending.availability === "soon" ? "libraryAccess.confirmSoon" : "libraryAccess.confirmRelease").replace("{name}", pending.resource.title) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setPending(null)}>{t("common.cancel")}</Button>
            <Button disabled={mutation.isPending} onClick={() => { if (pending) mutation.mutate(pending); }}>
              {mutation.isPending && <Loader2 className="animate-spin" />}{t("libraryAccess.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}