import { createFileRoute } from "@tanstack/react-router";
import { DiagnosticFlow } from "@/components/bloom/diagnostic/DiagnosticFlow";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico Inicial · Bloom" },
      { name: "description", content: "Diagnóstico inicial para conhecer a rotina das teachers." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiagnosticFlow,
});
