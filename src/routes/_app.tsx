import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { AppTopNav, APP_CONTAINER } from "@/components/layout/AppTopNav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useScheduledContractActivation } from "@/hooks/use-scheduled-contract-activation";
import { visitorRedirectTarget } from "@/lib/public-landing";
import { onboardingGate } from "@/lib/onboarding-status";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile, error, retryProfileSync, signOut } = useAuth();
  // Scheduled contract renewals: activation fallback when the app opens (same RPC as the schedule).
  useScheduledContractActivation(user?.id);

  const loadingScreen = (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#163020] font-figtree">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-[#F4EBE1] flex items-center justify-center shadow-lg animate-pulse">
            <span className="font-outfit font-extrabold text-[#163020] text-3xl">B</span>
          </div>
          <div className="flex flex-col items-center mt-1">
            <h3 className="font-outfit text-xl font-bold text-white tracking-wide">Bloom</h3>
            <div className="mt-2.5 h-1 w-24 overflow-hidden rounded-full bg-emerald-900/50">
              <div className="h-full w-12 rounded-full bg-[#F4EBE1] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );

  if (loading) {
    return loadingScreen;
  }

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background px-4 font-figtree select-none">
        <div className="max-w-md w-full text-center p-8 bg-card rounded-2xl border border-border shadow-lg space-y-6">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
            <span className="font-outfit font-extrabold text-2xl">!</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-outfit text-[#163020]">Erro de Sincronização</h2>
            <p className="text-sm text-muted-foreground">
              {error?.message ||
                "Ocorreu um erro ao carregar ou criar o seu perfil de usuário no banco de dados."}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => retryProfileSync()}
              className="w-full flex h-11 items-center justify-center rounded-xl bg-[#163020] text-white hover:bg-[#163020]/90 font-bold text-sm shadow-sm transition-colors cursor-pointer"
            >
              Tentar Novamente
            </button>
            <button
              onClick={() => signOut()}
              className="w-full flex h-11 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-secondary/45 font-bold text-sm shadow-sm transition-colors cursor-pointer"
            >
              Sair / Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    // Visitors of the bare root see the public product page; every other protected path (and any
    // auth round-trip carrying parameters) still goes to sign-in, exactly as before.
    const target = typeof window === "undefined"
      ? "/auth"
      : visitorRedirectTarget(window.location.pathname, window.location.search, window.location.hash);
    return <Navigate to={target} replace />;
  }

  // Onboarding status comes only from the profile loaded from Supabase (never browser storage,
  // which logout purges): wait while it loads, never treat a missing profile as "pending".
  const gate = onboardingGate({ loading, error, profile });
  if (gate === "loading") {
    return loadingScreen;
  }
  if (gate === "pending") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {/* Top navigation (header + horizontal menu): same on every authenticated page. */}
      <AppTopNav />
      <main className="min-h-0 flex-1 overflow-y-auto scroll-smooth pb-6 pt-4 lg:pt-6">
        <div className={cn(APP_CONTAINER)}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
