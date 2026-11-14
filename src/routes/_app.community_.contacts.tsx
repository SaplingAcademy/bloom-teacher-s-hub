import { createFileRoute } from "@tanstack/react-router";
import { MyContactsPage } from "@/components/bloom/contacts/MyContactsPage";

export const Route = createFileRoute("/_app/community_/contacts")({
  head: () => ({
    meta: [
      { title: "Meus Contatos · Bloom" },
      { name: "description", content: "Conecte-se com outros professores da Bloom." },
      { property: "og:title", content: "Meus Contatos · Bloom" },
      { property: "og:description", content: "Conecte-se com outros professores da Bloom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyContactsPage,
});
