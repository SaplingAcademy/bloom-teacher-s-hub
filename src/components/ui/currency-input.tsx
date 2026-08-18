import React from "react";
import { Input } from "@/components/ui/input";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
}

/**
 * CurrencyInput allows flexible decimal input for monetary values.
 * Accepts both comma (,) and dot (.) as decimal separators.
 * Allows empty input without auto-inserting '0'.
 * Prevents leading zeros concatenation (e.g. '05' becomes '5', while '0,5' is preserved).
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  id,
  placeholder,
  required,
  ...props
}: CurrencyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Allow empty string for clearing/deleting freely
    if (raw === "") {
      onChange("");
      return;
    }

    // Filter invalid characters: allow only digits, comma, and dot
    raw = raw.replace(/[^0-9.,]/g, "");

    // Prevent multiple decimal separators (keep only the first one)
    const firstSepIndex = raw.search(/[,.]/);
    if (firstSepIndex !== -1) {
      const sep = raw[firstSepIndex];
      const integerPart = raw.slice(0, firstSepIndex);
      const decimalPart = raw.slice(firstSepIndex + 1).replace(/[,.]/g, "");
      raw = integerPart + sep + decimalPart;
    }

    // Handle leading zeros: e.g. "05" -> "5", but "0,5" or "0.5" or "0" is kept
    if (/^0[0-9]/.test(raw)) {
      raw = raw.replace(/^0+/, "");
      if (raw === "") raw = "0";
    }

    onChange(raw);
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      className={className}
      {...props}
    />
  );
}
