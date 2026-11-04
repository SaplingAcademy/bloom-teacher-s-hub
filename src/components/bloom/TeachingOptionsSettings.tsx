import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { CATALOG_OPTIONS_QUERY_KEY, useCatalogOptions } from "@/hooks/use-catalog-options";
import { CatalogValidationError, type CatalogOptions } from "@/lib/catalog-options";
import { CatalogSettingsError, changeCatalogOptionLifecycle, saveCatalogSettings } from "@/lib/catalog-settings";
import type { CatalogCategory } from "@/lib/catalog-options";
import { TeachingOptionsEditor } from "@/components/bloom/TeachingOptionsEditor";
import { Button } from "@/components/ui/button";

export function TeachingOptionsSettings({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const { user, session, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { catalogOptions, error, isLoading, refetch } = useCatalogOptions();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ teacherId, catalog }: { teacherId: string; catalog: CatalogOptions }) => saveCatalogSettings(teacherId, catalog),
    onSuccess: (persisted, { teacherId }) => {
      queryClient.setQueryData(CATALOG_OPTIONS_QUERY_KEY(teacherId), persisted);
    },
  });
  const lifecycle = useMutation({
    mutationFn: ({ teacherId, catalog, category, id, action }: { teacherId: string; catalog: CatalogOptions; category: CatalogCategory; id: string; action: "remove" | "restore" }) => changeCatalogOptionLifecycle(teacherId, catalog, category, id, action),
    onSuccess: (result, { teacherId }) => queryClient.setQueryData(CATALOG_OPTIONS_QUERY_KEY(teacherId), result.catalog),
  });

  if (isLoading) return <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("teachingOptions.loading")}</p>;
  if (error) return (
    <div className="space-y-3 py-5">
      <p role="alert" className="text-sm text-destructive">{t(error instanceof CatalogValidationError ? "teachingOptions.invalidCatalog" : "teachingOptions.loadError")}</p>
      <Button variant="outline" onClick={() => { void refetch(); }}>{t("teachingOptions.retry")}</Button>
    </div>
  );
  if (authLoading || !user || session?.user.id !== user.id || !catalogOptions) return <p role="alert" className="text-sm text-destructive">{t("teachingOptions.authentication")}</p>;
  const teacherId = user.id;

  return <TeachingOptionsEditor key={teacherId} initialCatalog={catalogOptions} onDirtyChange={onDirtyChange} onSave={(catalog) => {
    if (authLoading || session?.user.id !== teacherId) return Promise.reject(new CatalogSettingsError("authentication"));
    return mutation.mutateAsync({ teacherId, catalog });
  }} onLifecycle={(catalog, category, id, action) => {
    if (authLoading || session?.user.id !== teacherId) return Promise.reject(new CatalogSettingsError("authentication"));
    return lifecycle.mutateAsync({ teacherId, catalog, category, id, action });
  }} />;
}