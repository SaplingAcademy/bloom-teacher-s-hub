import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({ meta: [{ title: "Resources · Bloom" }, { name: "description", content: "Your organized teaching library, replacing scattered Drive folders." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Resources"
      description="One organized library for every worksheet, slide, audio and PDF — no more lost Drive folders."
      icon={FolderOpen}
      goal="Find and reuse the right material in seconds, and later sell your best resources."
      planned={[
        "Folders, tags and powerful search",
        "Preview PDFs, images, audio and docs inline",
        "Filter by level, skill and language",
        "Attach resources to lessons and students",
        "Publish to the community marketplace",
      ]}
    />
  ),
});