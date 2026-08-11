import { useEffect, useState } from "react";
import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile, error, retryProfileSync, signOut } = useAuth();

  // Desktop Pinning State (persisted in localStorage)
  const [isPinned, setIsPinned] = useState(false);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const storedPin = localStorage.getItem("bloom_sidebar_pinned");
    if (storedPin) setIsPinned(storedPin === "true");
  }, []);

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem("bloom_sidebar_pinned", String(next));
      return next;
    });
  };

  const handleNavigate = () => {
    if (mobileOpen) setMobileOpen(false);
  };

  if (loading) {
    return (
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
    return <Navigate to="/auth" replace />;
  }

  const onboardingCompleted =
    Boolean(profile?.onboarding_completed) ||
    (typeof window !== "undefined"
      ? localStorage.getItem("bloom.onboarding.completed") === "true"
      : false);

  const onboardingSkipped =
    profile?.onboarding_status === "skipped" ||
    (typeof window !== "undefined"
      ? localStorage.getItem("bloom.onboarding.skipped") === "true"
      : false);

  if (!onboardingCompleted && !onboardingSkipped) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {/* Desktop Sidebar Layout Container */}
      <div
        className={cn(
          "hidden h-screen shrink-0 relative z-30 lg:block transition-[width] duration-300 ease-in-out",
          isPinned ? "w-[240px]" : "w-[72px]"
        )}
      >
        <div className="absolute top-0 left-0 h-full z-30">
          <AppSidebar
            isPinned={isPinned}
            onTogglePin={togglePin}
            onNavigate={handleNavigate}
            onExpandChange={(expanded) => setIsHoverExpanded(expanded)}
          />
        </div>
      </div>

      {/* Mobile Drawer (Hidden on Desktop) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full z-50 shadow-2xl">
            <AppSidebar
              isMobile={true}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Region — No layout jump when sidebar expands on hover */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative z-10">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto scroll-smooth px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
