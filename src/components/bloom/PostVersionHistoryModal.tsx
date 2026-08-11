import { useState, useEffect } from "react";
import { PostVersion, fetchPostVersions, restorePostVersion } from "@/lib/community-persistence";
import { toast } from "sonner";
import {
  History,
  Clock,
  RotateCcw,
  User,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileCode,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PostVersionHistoryModalProps {
  postId: string | null;
  teacherId?: string;
  isAuthor?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionRestored?: () => void;
}

export function PostVersionHistoryModal({
  postId,
  teacherId,
  isAuthor = false,
  open,
  onOpenChange,
  onVersionRestored,
}: PostVersionHistoryModalProps) {
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PostVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadVersions = async () => {
    if (!postId) return;
    setLoading(true);
    const data = await fetchPostVersions(postId);
    setVersions(data);
    if (data.length > 0) {
      setSelectedVersion(data[0]);
    } else {
      setSelectedVersion(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && postId) {
      loadVersions();
    }
  }, [open, postId]);

  const handleRestore = async (version: PostVersion) => {
    if (!postId || !teacherId) return;

    setRestoring(true);
    const res = await restorePostVersion(postId, teacherId, version.version_number);
    setRestoring(false);

    if (res.success) {
      toast.success(
        `Restaurado com sucesso! Criada a nova Versão #${res.newVersionNumber} a partir do histórico.`
      );
      onOpenChange(false);
      if (onVersionRestored) onVersionRestored();
    } else {
      toast.error(`Erro ao restaurar versão: ${res.error}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Histórico de Versões da Publicação
          </DialogTitle>
          <DialogDescription>
            Todas as edições salvas geram snapshots imutáveis. Restaurar uma versão cria uma nova revisão sem apagar o histórico.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Carregando histórico de edições...
          </div>
        ) : versions.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
            Nenhuma edição anterior registrada. Esta publicação ainda está em sua versão original.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Version List Sidebar */}
            <div className="space-y-2 border-r border-border pr-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Revisões ({versions.length})
              </h4>
              <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                {versions.map((ver) => (
                  <button
                    key={ver.id}
                    onClick={() => setSelectedVersion(ver)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs space-y-1 ${
                      selectedVersion?.id === ver.id
                        ? "bg-primary/10 border-primary text-card-foreground font-medium"
                        : "bg-card border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">Versão #{ver.version_number}</span>
                      <Badge variant="outline" className="text-[9px] capitalize py-0">
                        {ver.change_type}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(ver.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {ver.edit_reason && (
                      <p className="text-[10px] italic text-muted-foreground truncate">
                        "{ver.edit_reason}"
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Version Snapshot Viewer */}
            <div className="md:col-span-2 space-y-3">
              {selectedVersion ? (
                <div className="space-y-3 bg-muted/20 p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
                    <div>
                      <span className="font-bold text-card-foreground">
                        Snapshot Versão #{selectedVersion.version_number}
                      </span>
                      <span className="text-muted-foreground block text-[11px]">
                        Editado por {selectedVersion.created_by_name} em{" "}
                        {new Date(selectedVersion.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    {isAuthor && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={restoring}
                        className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleRestore(selectedVersion)}
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${restoring ? "animate-spin" : ""}`} />
                        Restaurar esta Versão
                      </Button>
                    )}
                  </div>

                  {selectedVersion.edit_reason && (
                    <div className="bg-card p-2 rounded border border-border text-xs italic text-muted-foreground">
                      <strong>Motivo da Edição:</strong> {selectedVersion.edit_reason}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Título</span>
                      <h4 className="font-bold text-sm text-card-foreground">{selectedVersion.title_snapshot}</h4>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Conteúdo do Snapshot</span>
                      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed bg-card p-3 rounded-lg border border-border">
                        {selectedVersion.content_snapshot}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Selecione uma versão na lista ao lado para visualizar o snapshot.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
