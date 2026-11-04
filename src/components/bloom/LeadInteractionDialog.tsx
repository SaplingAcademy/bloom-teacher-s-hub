import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import {
  LEAD_INTERACTION_TYPES,
  createLeadInteraction,
  emptyInteractionDraft,
  toDateTimeLocal,
  validateInteractionDraft,
  type LeadInteractionDraft,
  type LeadInteractionType,
} from "@/lib/lead-interactions";

interface Props {
  open: boolean;
  teacherId?: string;
  leadId?: string;
  leadName?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function LeadInteractionDialog({ open, teacherId, leadId, leadName, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const L = (k: string) => t(`leadInteractions.${k}`);
  const [draft, setDraft] = useState<LeadInteractionDraft>(() => emptyInteractionDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (open) {
      setDraft(emptyInteractionDraft());
      setError(null);
    }
  }, [open, leadId]);

  const submit = async () => {
    if (inFlight.current || !teacherId || !leadId) return;
    const issue = validateInteractionDraft(draft);
    if (issue) return setError(L(issue));
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await createLeadInteraction(teacherId, leadId, draft);
      onSaved();
      onClose();
    } catch (err) {
      console.error("[Leads] Interaction save error:", err);
      setError(L("saveError"));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{L("title")}</DialogTitle>
          {leadName && <DialogDescription>{leadName}</DialogDescription>}
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{L("type")}</Label>
              <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as LeadInteractionType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_INTERACTION_TYPES.map((k) => <SelectItem key={k} value={k}>{L(`types.${k}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interaction-at">{L("occurredAt")}</Label>
              <Input id="interaction-at" type="datetime-local" max={toDateTimeLocal(new Date())} value={draft.occurredAt}
                onChange={(e) => setDraft({ ...draft, occurredAt: e.target.value })} />
            </div>
          </div>
          {draft.type === "note" && <p className="text-xs text-muted-foreground">{L("noteHint")}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="interaction-desc">{L("description")}</Label>
            <Textarea id="interaction-desc" rows={4} value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>{L("cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? L("saving") : L("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
