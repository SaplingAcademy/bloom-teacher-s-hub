import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCatalogSelectOptions,
  type CatalogCategory,
  type CatalogOptions,
} from "@/lib/catalog-options";

const NONE_VALUE = "__none__";

interface CatalogOptionSelectProps {
  id?: string;
  catalog: CatalogOptions | null;
  category: CatalogCategory;
  /** Raw stored value (stable ID or historical literal); empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Label for the clearing choice; omit to disallow clearing. */
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Pedagogical catalog selector: shows active options in the teacher's configured
 * order, keeps the record's historical value visible/selectable when it is no
 * longer an active choice, and saves stable IDs only.
 */
export function CatalogOptionSelect({
  id,
  catalog,
  category,
  value,
  onChange,
  placeholder,
  noneLabel,
  disabled,
  className,
}: CatalogOptionSelectProps) {
  const options = catalog ? getCatalogSelectOptions(catalog, category, value) : [];
  // Without a loaded catalog, still show the stored value so editing never blanks it.
  const fallbackOnly = !catalog && value.trim() !== "";

  return (
    <Select
      value={value === "" ? NONE_VALUE : value}
      onValueChange={(val) => onChange(val === NONE_VALUE ? "" : val)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel ? <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
        {fallbackOnly ? <SelectItem value={value}>{value}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}
