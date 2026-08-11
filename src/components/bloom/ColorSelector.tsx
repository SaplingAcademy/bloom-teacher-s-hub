import { Check, RotateCcw } from "lucide-react";
import {
  BrandColorKey,
  BRAND_COLOR_PALETTE,
  BrandColorMeta,
} from "@/lib/brand-colors";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ColorSelectorProps {
  value?: string;
  onChange: (colorKey: BrandColorKey) => void;
  label?: string;
}

export function ColorSelector({
  value = "default",
  onChange,
  label = "Cor de Identificação (Padrão Bloom)",
}: ColorSelectorProps) {
  const selectedKey = (value in BRAND_COLOR_PALETTE ? value : "default") as BrandColorKey;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-foreground">{label}</Label>
        {selectedKey !== "default" && (
          <button
            type="button"
            onClick={() => onChange("default")}
            className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 font-medium cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Remover personalização
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
        {(Object.keys(BRAND_COLOR_PALETTE) as BrandColorKey[]).map((key) => {
          const item: BrandColorMeta = BRAND_COLOR_PALETTE[key];
          const isSelected = selectedKey === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={`${item.label} ${isSelected ? "— selecionado" : ""}`}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer text-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                  : "border-border/80 bg-card hover:bg-muted/50 hover:border-border"
              }`}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-xs border border-black/10"
                style={{ backgroundColor: item.swatchHex }}
              >
                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
              <span className="text-[10px] font-medium text-foreground truncate w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
