import React, { useState, useEffect } from "react";
import { StudentLesson } from "@/lib/lesson-plan-sync";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  FileText,
  Paperclip,
  Link as LinkIcon,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeFilename } from "@/lib/pdf-export";

export interface LessonAttachment {
  id: string;
  type: "file" | "link";
  title?: string;
  file_path?: string;
  file_url: string;
  file_name?: string;
  file_size?: number; // in bytes
  created_at?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  teacherId: string;
  studentName: string;
  lesson: StudentLesson | null;
  onSave: (updatedLesson: StudentLesson) => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function LessonNotesModal({
  isOpen,
  onClose,
  studentId,
  teacherId,
  studentName,
  lesson,
  onSave,
}: Props) {
  if (!lesson) return null;

  const [notesText, setNotesText] = useState(lesson.notes || "");
  const [attachments, setAttachments] = useState<LessonAttachment[]>(
    (lesson as any).attachments || []
  );

  // Form states for adding link
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);

  // Sync state and refresh signed URLs when lesson changes
  useEffect(() => {
    if (lesson) {
      setNotesText(lesson.notes || "");
      const rawList: LessonAttachment[] = (lesson as any).attachments || [];
      setAttachments(rawList);

      // Asynchronously refresh signed URLs for all file attachments
      const hasFileAttachments = rawList.some((att) => att.type === "file" && att.file_path);
      if (hasFileAttachments) {
        Promise.all(
          rawList.map(async (att) => {
            if (att.type === "file" && att.file_path) {
              try {
                const { data } = await supabase.storage
                  .from("resources")
                  .createSignedUrl(att.file_path, 3600);
                if (data?.signedUrl) {
                  return { ...att, file_url: data.signedUrl };
                }
              } catch (err) {
                console.warn("[LessonNotesModal] Failed to refresh signed URL:", err);
              }
            }
            return att;
          })
        ).then((refreshed) => {
          setAttachments(refreshed);
        });
      }
    }
  }, [lesson]);

  // Helper to extract clean domain from URL
  const getDomainLabel = (url: string, title?: string) => {
    if (title && title.trim().length > 0) return title.trim();
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, "");
    } catch (e) {
      return url;
    }
  };

  // Add Link Handler
  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      toast.error("Insira uma URL válida.");
      return;
    }

    let finalUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const newAttachment: LessonAttachment = {
      id: crypto.randomUUID(),
      type: "link",
      title: linkTitle.trim() || undefined,
      file_url: finalUrl,
      created_at: new Date().toISOString(),
    };

    setAttachments((prev) => [...prev, newAttachment]);
    setLinkTitle("");
    setLinkUrl("");
    setIsAddingLink(false);
    toast.success("Link adicionado com sucesso!");
  };

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MIME type & extension
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Por favor, selecione apenas arquivos PDF (.pdf).");
      return;
    }

    // Validate File Size (10MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("O arquivo excede o limite máximo de 10 MB.");
      return;
    }

    setIsUploading(true);
    try {
      const safeName = `${Date.now()}_${sanitizeFilename(file.name.replace(/\.pdf$/i, ""))}.pdf`;
      const storagePath = `${teacherId}/${studentId}_L${lesson.lesson_number}/${safeName}`;
      const bucketName = "resources";

      let signedViewingUrl = "";

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadErr) {
        console.warn("[LessonNotesModal] Supabase Storage upload failed, creating object URL fallback:", uploadErr.message);
        signedViewingUrl = URL.createObjectURL(file);
      } else if (uploadData) {
        // Request 1-hour signed URL for private bucket
        const { data: signedData } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(storagePath, 3600);

        signedViewingUrl = signedData?.signedUrl || URL.createObjectURL(file);
      }

      const newAttachment: LessonAttachment = {
        id: crypto.randomUUID(),
        type: "file",
        title: file.name,
        file_name: file.name,
        file_path: storagePath,
        file_url: signedViewingUrl,
        file_size: file.size,
        created_at: new Date().toISOString(),
      };

      setAttachments((prev) => [...prev, newAttachment]);
      toast.success("PDF anexado com sucesso!");
    } catch (err: any) {
      console.error("[LessonNotesModal] Upload exception:", err);
      toast.error("Erro ao enviar PDF.");
    } finally {
      setIsUploading(false);
      // Reset input value
      e.target.value = "";
    }
  };

  // Delete Attachment Handler
  const handleDeleteAttachment = async (attachmentId: string) => {
    const target = attachments.find((a) => a.id === attachmentId);
    if (!target) return;

    // Delete storage object if file_path exists
    if (target.type === "file" && target.file_path) {
      try {
        await supabase.storage.from("resources").remove([target.file_path]);
      } catch (e) {
        console.warn("[LessonNotesModal] Failed to remove storage object:", e);
      }
    }

    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    toast.info("Anexo removido.");
  };

  // Save Modal Handler
  const handleSaveModal = () => {
    const updatedLesson: StudentLesson = {
      ...lesson,
      notes: notesText.trim(),
      attachments: attachments,
    } as any;

    onSave(updatedLesson);
    onClose();
    toast.success("Notas e anexos da aula salvos com sucesso!");
  };

  const formattedDate = lesson.scheduled_date
    ? lesson.scheduled_date.split("-").reverse().join("/")
    : "—";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl bg-card border-border shadow-lg space-y-5">
        <DialogHeader className="space-y-1 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold font-display text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span>Notas da Aula</span>
            </DialogTitle>
          </div>

          {/* Context Banner */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground pt-1">
            <span className="text-foreground font-bold bg-primary/10 px-2 py-0.5 rounded-md text-primary">
              Aula {lesson.lesson_number}
            </span>
            <span>•</span>
            <span>{formattedDate}</span>
            <span>•</span>
            <span>{studentName}</span>
          </div>
        </DialogHeader>

        {/* Text Area Notes Section */}
        <div className="space-y-2">
          <Label htmlFor="lesson-notes-text" className="text-xs font-bold uppercase tracking-wider text-foreground/90">
            Anotações da Aula
          </Label>
          <Textarea
            id="lesson-notes-text"
            rows={4}
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Registre observações sobre a aula, dificuldades, pontos para revisar, materiais utilizados ou qualquer informação importante..."
            className="text-xs rounded-xl bg-background border-border resize-none focus-visible:ring-primary leading-relaxed"
          />
        </div>

        {/* Attachments Section */}
        <div className="space-y-3 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-foreground/90 flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-primary" />
              <span>Anexos ({attachments.length})</span>
            </Label>

            {/* Action Buttons: Upload PDF & Add Link */}
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold cursor-pointer transition-colors">
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>Enviar PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setIsAddingLink(!isAddingLink)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold transition-colors cursor-pointer"
              >
                <LinkIcon className="w-3.5 h-3.5 text-primary" />
                <span>Adicionar link</span>
              </button>
            </div>
          </div>

          {/* Add Link Form */}
          {isAddingLink && (
            <form onSubmit={handleAddLink} className="p-3.5 rounded-xl bg-secondary/40 border border-border/60 space-y-3 animate-in fade-in duration-150">
              <h5 className="text-xs font-bold text-foreground">Novo Link Externo</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Título do link (opcional, ex: Canva)"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="h-9 text-xs rounded-lg bg-background border-border"
                />
                <Input
                  placeholder="URL (ex: https://canva.com/...)"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  required
                  className="h-9 text-xs rounded-lg bg-background border-border"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingLink(false)}
                  className="h-8 text-xs rounded-lg cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  Adicionar
                </Button>
              </div>
            </form>
          )}

          {/* Attachments List */}
          {attachments.length === 0 ? (
            <div className="py-6 text-center rounded-xl border border-dashed border-border/80 bg-secondary/10 space-y-1">
              <Paperclip className="w-6 h-6 text-muted-foreground/50 mx-auto" />
              <p className="text-xs font-medium text-muted-foreground">
                Nenhum anexo nesta aula ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/60 hover:border-border transition-all text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {att.type === "file" ? (
                      <div className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <LinkIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-bold text-foreground truncate block text-xs">
                        {att.type === "file"
                          ? att.file_name || att.title
                          : getDomainLabel(att.file_url, att.title)}
                      </span>
                      <span className="text-[10px] text-muted-foreground block truncate">
                        {att.type === "file"
                          ? att.file_size
                            ? `${(att.file_size / (1024 * 1024)).toFixed(2)} MB • PDF`
                            : "Arquivo PDF"
                          : att.file_url}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background border border-border text-foreground hover:bg-secondary text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <span>{att.type === "file" ? "Visualizar" : "Abrir"}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors cursor-pointer"
                      title="Remover anexo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-10 text-xs font-semibold rounded-xl cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSaveModal}
            className="h-10 px-5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer shadow-sm"
          >
            Salvar Notas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
