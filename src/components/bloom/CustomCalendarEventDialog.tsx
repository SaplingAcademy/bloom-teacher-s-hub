import { useState } from "react";
import { CalendarDays, Pencil, Save, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { customEventErrorKey, deleteCustomEvent, saveCustomEvent, type CustomEventInput } from "@/lib/custom-calendar-events";
import type { CalendarEvent } from "@/lib/calendar-sync";

export function CustomCalendarEventDialog({ event, date, startTime = "", endTime = "", onClose, onSaved }: {
  event: CalendarEvent | null; date: string; startTime?: string; endTime?: string; onClose: () => void; onSaved: (date: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [editing, setEditing] = useState(!event);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CustomEventInput>({
    title: event?.title || "", category: event?.category || "", date: event?.date || date,
    startTime: event?.startTime.slice(0, 5) || startTime, endTime: event?.endTime.slice(0, 5) || endTime,
    locationLink: event?.locationLink || "", notes: event?.notes || "",
  });
  const field = (key: keyof CustomEventInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const finish = async (remove: boolean) => {
    if (!user?.id || busy) return;
    setBusy(true); setError("");
    try {
      if (remove && event) await deleteCustomEvent(user.id, event.id);
      else await saveCustomEvent(user.id, form, event?.id);
      await onSaved(form.date);
      onClose();
    } catch (failure) {
      setError(t(`customCalendar.${customEventErrorKey(failure)}`));
      setConfirmDelete(false);
    } finally { setBusy(false); }
  };
  const textField = (key: keyof CustomEventInput, label: string, type = "text") => <div className="space-y-2"><Label htmlFor={`custom-${key}`}>{t(`customCalendar.${label}`)}</Label><Input id={`custom-${key}`} type={type} value={form[key]} onChange={(e) => field(key, e.target.value)} readOnly={!editing} disabled={busy} /></div>;
  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><CalendarDays className="h-5 w-5 text-lilac" />{t(event ? "customCalendar.details" : "customCalendar.new")}</DialogTitle>
          <DialogDescription>{form.category || t("customCalendar.category")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void finish(false); }}>
          {textField("title", "title")}
          {textField("category", "category")}
          {textField("date", "date", "date")}
          <div className="grid grid-cols-2 gap-4">{textField("startTime", "start", "time")}{textField("endTime", "end", "time")}</div>
          {textField("locationLink", "location")}
          <div className="space-y-2"><Label htmlFor="custom-notes">{t("customCalendar.notes")}</Label><Textarea id="custom-notes" value={form.notes} onChange={(e) => field("notes", e.target.value)} readOnly={!editing} disabled={busy} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            {event ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)} className="text-destructive"><Trash2 className="h-4 w-4" />{t("customCalendar.delete")}</Button> : <span />}
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("customCalendar.close")}</Button>{editing ? <Button type="submit" disabled={busy || !user?.id}><Save className="h-4 w-4" />{t(busy ? "customCalendar.saving" : "customCalendar.save")}</Button> : <Button type="button" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />{t("customCalendar.edit")}</Button>}</div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!busy) setConfirmDelete(open); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("customCalendar.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("customCalendar.deleteDescription")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("customCalendar.cancel")}</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={() => void finish(true)}><Trash2 className="h-4 w-4" />{t(busy ? "customCalendar.saving" : "customCalendar.delete")}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}