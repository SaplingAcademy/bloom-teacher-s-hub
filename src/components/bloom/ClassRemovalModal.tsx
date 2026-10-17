import { useEffect, useState } from "react";
import { Trash2, Archive, Users, Wallet, UserX, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { reviewClassRemoval, removeClassSafely, teacherCalendarDate, type ClassRemovalReview } from "@/lib/class-lifecycle";
import type { ClassWithDetails } from "@/lib/class-sync";
import type { ClassMember } from "@/types/classes";

export type StudentNextStep = "package" | "enroll" | "inactivate";
export function ClassRemovalModal({ cls, classes, hidden = false, onClose, onChanged, onStudentAction }: {
  cls: ClassWithDetails; classes: ClassWithDetails[]; onClose: () => void;
  hidden?: boolean;
  onChanged: () => void;
  onStudentAction: (studentId: string, action: StudentNextStep, classId?: string) => void;
}) {
  const { user, profile } = useAuth();
  const { t, lang } = useLanguage();
  const [review, setReview] = useState<ClassRemovalReview | null>(null);
  const [affected, setAffected] = useState<ClassMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [kept, setKept] = useState<string[]>([]);
  const [targetClass, setTargetClass] = useState<Record<string, string>>({});
  const today = () => teacherCalendarDate(profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const load = async () => {
    if (!user?.id) return;
    setError("");
    try {
      const result = await reviewClassRemoval(user.id, cls.id, today());
      setReview(result);
      setAffected(result.activeMembers);
    } catch { setError(t("classRemoval.loadError")); }
  };
  useEffect(() => { void load(); }, [cls.id, user?.id]);
  const confirm = async () => {
    if (!user?.id || !review) return;
    setSaving(true); setError("");
    try {
      const result = await removeClassSafely(user.id, cls.id, today(), review.mode, lang);
      onChanged();
      if (result.mode === "archive" && affected.length) setFinished(true);
      else onClose();
    } catch {
      // Some cleanup steps may already have succeeded; refresh and keep this dialog available for retry.
      onChanged();
      setError(t("classRemoval.saveError"));
      const fresh = await reviewClassRemoval(user.id, cls.id, today()).catch(() => null);
      if (fresh) setReview(fresh);
    } finally { setSaving(false); }
  };
  const availableClasses = classes.filter((c) => c.id !== cls.id && c.status === "active");
  return (
    <Dialog open={!hidden} onOpenChange={(open) => { if (!open && !saving && !hidden) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            {finished ? <Users className="h-5 w-5 text-primary" /> : <Trash2 className="h-5 w-5 text-destructive" />}
            {t(finished ? "classRemoval.nextTitle" : "classRemoval.title")}
          </DialogTitle>
          <DialogDescription>{cls.name}</DialogDescription>
        </DialogHeader>
        {finished ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("classRemoval.nextDescription")}</p>
            {affected.map((member) => (
              <div key={member.id} className="border-b border-border pb-4 space-y-3">
                <p className="font-semibold text-foreground">{member.student_name}</p>
                {kept.includes(member.student_id) ? <p className="text-sm text-muted-foreground flex gap-2"><Check className="h-4 w-4" />{t("classRemoval.kept")}</p> : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => onStudentAction(member.student_id, "package")}><Wallet className="h-4 w-4" />{t("classRemoval.package")}</Button>
                    <Button variant="outline" size="sm" onClick={() => setKept((ids) => [...ids, member.student_id])}><Check className="h-4 w-4" />{t("classRemoval.keep")}</Button>
                    <Button variant="outline" size="sm" onClick={() => onStudentAction(member.student_id, "inactivate")}><UserX className="h-4 w-4" />{t("classRemoval.inactivate")}</Button>
                    {availableClasses.length > 0 && (
                      <div className="flex w-full min-w-0 gap-2">
                        <Select value={targetClass[member.student_id] || ""} onValueChange={(id) => setTargetClass((old) => ({ ...old, [member.student_id]: id }))}>
                          <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={t("classRemoval.selectClass")} /></SelectTrigger>
                          <SelectContent>{availableClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" disabled={!targetClass[member.student_id]} onClick={() => onStudentAction(member.student_id, "enroll", targetClass[member.student_id])}><Users className="h-4 w-4" />{t("classRemoval.enroll")}</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <Button onClick={onClose}>{t("classRemoval.done")}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {review && <p className="text-sm text-muted-foreground">{t(review.mode === "delete" ? "classRemoval.deleteDescription" : "classRemoval.archiveDescription")}</p>}
            {!review && !error && <p className="text-sm text-muted-foreground">{t("classRemoval.loading")}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={onClose}>{t("classRemoval.cancel")}</Button>
              {!review && error ? <Button onClick={load}>{t("classRemoval.retry")}</Button> : (
                <Button variant={review?.mode === "delete" ? "destructive" : "default"} disabled={!review || saving} onClick={confirm}>
                  {review?.mode === "archive" ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  {t(saving ? "classRemoval.saving" : review?.mode === "archive" ? "classRemoval.archive" : "classRemoval.delete")}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}