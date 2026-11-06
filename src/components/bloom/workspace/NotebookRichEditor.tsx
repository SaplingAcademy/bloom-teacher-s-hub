import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Bold, Italic, Underline, List, ListOrdered, ListChecks, Link2, Undo2, Redo2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { normalizeDocument, safeNotebookLink, type RichDocument } from "@/lib/workspace-notebooks";

export function NotebookRichEditor({ document, onChange, editable = true, onReady }: { document: RichDocument; onChange: (document: RichDocument) => void; editable?: boolean; onReady?: (editor: Editor | null) => void }) {
  const { t } = useLanguage();
  const [linkOpen, setLinkOpen] = useState(false), [url, setUrl] = useState(""), [urlError, setUrlError] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false,
      link: { openOnClick: true, autolink: true, defaultProtocol: "https", protocols: ["http", "https"], isAllowedUri: (url) => Boolean(safeNotebookLink(url)), HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }), TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => `${t("workspace.notebook.tools.taskList")}: ${node.textContent}` } })],
    content: document,
    editorProps: { attributes: { class: "notebook-prose", role: "textbox", "aria-multiline": "true", "aria-label": t("workspace.notebook.contentLabel") } },
    onUpdate: ({ editor }) => onChange(normalizeDocument(editor.getJSON())),
  });
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  useEffect(() => { onReady?.(editor); return () => onReady?.(null); }, [editor, onReady]);
  useEffect(() => {
    if (editor && JSON.stringify(normalizeDocument(editor.getJSON())) !== JSON.stringify(document)) editor.commands.setContent(document, { emitUpdate: false });
  }, [editor, document]);
  const state = useEditorState({ editor, selector: ({ editor }) => editor ? {
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"), bulletList: editor.isActive("bulletList"), orderedList: editor.isActive("orderedList"), taskList: editor.isActive("taskList"), link: editor.isActive("link"),
    heading: [1, 2, 3].find((level) => editor.isActive("heading", { level })) ?? 0,
    undo: editor.can().undo(), redo: editor.can().redo(),
  } : null });
  const tool = (key: string, Icon: LucideIcon, run: () => void, active = false, disabled = false) => <Tooltip key={key}><TooltipTrigger asChild><Button type="button" size="icon" variant={active ? "secondary" : "ghost"} className="h-8 w-8 shrink-0" aria-label={t(`workspace.notebook.tools.${key}`)} aria-pressed={active} disabled={!editor || !editable || disabled} onClick={run}><Icon className="h-4 w-4" aria-hidden /></Button></TooltipTrigger><TooltipContent>{t(`workspace.notebook.tools.${key}`)}</TooltipContent></Tooltip>;
  return <div className="min-w-0">
    <TooltipProvider delayDuration={300}><div role="toolbar" aria-label={t("workspace.notebook.formatting")} className="flex flex-wrap items-center gap-0.5 border-y border-border bg-muted/30 px-3 py-2 sm:px-5">
      <Select value={String(state?.heading ?? 0)} onValueChange={(value) => { if (!editor) return; const level = Number(value); if (level === 1 || level === 2 || level === 3) editor.chain().focus().toggleHeading({ level }).run(); else editor.chain().focus().setParagraph().run(); }}><SelectTrigger className="mr-2 h-8 w-32 border-0 bg-transparent text-xs shadow-none" aria-label={t("workspace.notebook.tools.style")}><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map((level) => <SelectItem key={level} value={String(level)}>{t(`workspace.notebook.tools.h${level}`)}</SelectItem>)}</SelectContent></Select>
      {tool("bold", Bold, () => editor?.chain().focus().toggleBold().run(), state?.bold)}
      {tool("italic", Italic, () => editor?.chain().focus().toggleItalic().run(), state?.italic)}
      {tool("underline", Underline, () => editor?.chain().focus().toggleUnderline().run(), state?.underline)}
      <span className="mx-1 h-4 border-l border-border" aria-hidden />
      {tool("bulletList", List, () => editor?.chain().focus().toggleBulletList().run(), state?.bulletList)}
      {tool("orderedList", ListOrdered, () => editor?.chain().focus().toggleOrderedList().run(), state?.orderedList)}
      {tool("taskList", ListChecks, () => editor?.chain().focus().toggleTaskList().run(), state?.taskList)}
      {tool("link", Link2, () => { setUrl(editor?.getAttributes("link").href ?? ""); setUrlError(false); setLinkOpen(true); }, state?.link)}
      <span className="mx-1 h-4 border-l border-border" aria-hidden />
      {tool("undo", Undo2, () => editor?.chain().focus().undo().run(), false, !state?.undo)}
      {tool("redo", Redo2, () => editor?.chain().focus().redo().run(), false, !state?.redo)}
    </div></TooltipProvider>
    <EditorContent editor={editor} className="min-h-96" />
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t("workspace.notebook.tools.link")}</DialogTitle><DialogDescription className="sr-only">{t("workspace.notebook.linkLabel")}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const href = safeNotebookLink(url.trim()); if (!href) { setUrlError(true); return; } editor?.chain().focus().extendMarkRange("link").setLink({ href, target: "_blank", rel: "noopener noreferrer" }).run(); setLinkOpen(false); }}><Label htmlFor="notebook-link">{t("workspace.notebook.linkLabel")}</Label><Input id="notebook-link" autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(false); }} placeholder="https://" aria-invalid={urlError} />{urlError && <p className="text-sm text-destructive">{t("workspace.notebook.invalidLink")}</p>}<DialogFooter><Button type="button" variant="ghost" onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); }}>{t("workspace.notebook.removeLink")}</Button><Button type="submit">{t("workspace.notebook.applyLink")}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}