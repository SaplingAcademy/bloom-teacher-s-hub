import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";
import { landingTranslations } from "@/lib/i18n-landing";

const meta = landingTranslations.pt.landing.meta;

// Public product page, outside the authenticated "/_app" layout: visitors can learn about Bloom
// before signing in; "Entrar" and "Começar agora" go to the existing /auth page.
export const Route = createFileRoute("/conheca")({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      { property: "og:title", content: meta.title },
      { property: "og:description", content: meta.description },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/landing/app-index.webp" },
      { property: "og:image:alt", content: landingTranslations.pt.landing.hero.imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: meta.title },
      { name: "twitter:description", content: meta.description },
      { name: "twitter:image", content: "/landing/app-index.webp" },
    ],
    links: [
      { rel: "canonical", href: "/conheca" },
      { rel: "preload", as: "image", href: "/landing/app-index.webp", type: "image/webp" },
    ],
  }),
  component: LandingPage,
});
