import { FileSignature } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContractDocumentInput } from "@/components/bloom/ContractDocumentInput";
import { useLanguage } from "@/hooks/use-language";

export function StudentContractRegistrationFields({
  startDate,
  endDate,
  file,
  onStartDateChange,
  onEndDateChange,
  onFileChange,
  disabled,
}: {
  startDate: string;
  endDate: string;
  file: File | null;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const { t } = useLanguage();

  return (
    <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/40 pb-2 font-display text-sm font-bold text-foreground">
        <FileSignature className="h-4 w-4 text-primary" aria-hidden />
        {t("contracts.registrationTitle")}
      </div>
      <p className="text-xs text-muted-foreground">{t("contracts.registrationDescription")}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="std-contract-start" className="text-xs font-semibold">
            {t("contracts.start")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="std-contract-start"
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            required
            disabled={disabled}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="std-contract-end" className="text-xs font-semibold">
            {t("contracts.end")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="std-contract-end"
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            min={startDate || undefined}
            required
            disabled={disabled}
            className="h-11 rounded-xl"
          />
        </div>
      </div>
      <ContractDocumentInput id="std-contract-file" file={file} onChange={onFileChange} disabled={disabled} />
    </section>
  );
}
