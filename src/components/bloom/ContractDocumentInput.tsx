import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import {
  CONTRACT_FILE_ACCEPT,
  validateContractFile,
  type ContractFileIssue,
} from "@/lib/contract-document-rules";

export function ContractDocumentInput({
  id,
  file,
  onChange,
  disabled = false,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [issue, setIssue] = useState<ContractFileIssue | null>(null);

  const selectFile = (next: File | undefined) => {
    if (!next) return;
    const nextIssue = validateContractFile(next, next.name);
    setIssue(nextIssue);
    onChange(nextIssue ? null : next);
    if (nextIssue && inputRef.current) inputRef.current.value = "";
  };

  const clear = () => {
    setIssue(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("contracts.signedDocumentOptional")}</Label>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          id={id}
          type="file"
          accept={CONTRACT_FILE_ACCEPT}
          disabled={disabled}
          className="hidden"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Paperclip className="h-4 w-4" />
          {file ? t("contracts.replaceFile") : t("contracts.chooseFile")}
        </Button>
        {file && (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{file.name}</span>
            <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={clear} aria-label={t("contracts.removeFile")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("contracts.fileRule")}</p>
      {issue && <p role="alert" className="text-sm text-destructive">{t(`contracts.file_${issue}`)}</p>}
    </div>
  );
}
