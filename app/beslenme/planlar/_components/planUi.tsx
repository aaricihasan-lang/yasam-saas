"use client";
/**
 * Beslenme Plan Motoru — paylaşılan sunum atomları: mobil-dostu Modal kabuğu,
 * besin toplamı rozetleri ve enerji-hedef karşılaştırma satırı (nötr ton).
 * Salt sunum; iş mantığı yok.
 */
import { useEffect, useState, type ReactNode } from "react";
import { MoreVertical, X } from "lucide-react";
import { formatAmount } from "@/lib/beslenme/calc/nutrients";
import { NUTRIENT_LABELS, type NutrientTotal } from "@/lib/beslenme/planContracts";
import { formatEnergy } from "./planFormat";

/* ── Modal ── mobil: alttan tam-genişlik sayfa; masaüstü: ortalanmış kart. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] overflow-y-auto rounded-t-3xl border border-emerald-100 bg-white shadow-2xl sm:rounded-3xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black tracking-tight text-slate-900">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[12px] font-medium text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-50"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Kompakt aksiyon menüsü (üç nokta) ── */
export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
};

export function ActionMenu({ items, label = "İşlemler" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-50"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            {items.map((it, i) => (
              <button
                key={`${it.label}-${i}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold transition hover:bg-slate-50 ${
                  it.danger ? "text-rose-600" : "text-slate-700"
                }`}
              >
                {it.icon ? <span className="shrink-0">{it.icon}</span> : null}
                {it.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Toplam / makro yardımcıları ── */

function findTotal(totals: NutrientTotal[], code: string): NutrientTotal | undefined {
  return totals.find((t) => t.nutrient_code === code);
}

/** Enerji ham değerini toplamlardan çeker. */
export function energyValue(totals: NutrientTotal[]): number {
  return findTotal(totals, "energy")?.amount ?? 0;
}

/** Küçük makro rozeti (protein/karb/yağ/lif). */
function MacroChip({ totals, code }: { totals: NutrientTotal[]; code: string }) {
  const t = findTotal(totals, code);
  const label = NUTRIENT_LABELS[code] ?? code;
  const text = t ? formatAmount(t.amount, t.unit_code) : "0";
  const unit = t?.unit_code ?? "g";
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-800">
        {text}
        <span className="ml-0.5 text-[10px] text-slate-400">{unit}</span>
      </span>
    </span>
  );
}

/** Makro rozet dizisi (protein/karbonhidrat/yağ/lif). */
export function MacroChips({ totals, compact = false }: { totals: NutrientTotal[]; compact?: boolean }) {
  const codes = compact
    ? ["protein", "carbohydrate", "total_fat"]
    : ["protein", "carbohydrate", "total_fat", "fiber"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {codes.map((c) => (
        <MacroChip key={c} totals={totals} code={c} />
      ))}
    </div>
  );
}

/**
 * Enerji-hedef karşılaştırma satırı: "1.930 / 2.000 kcal · −70 kcal" (nötr ton).
 * Hedef yoksa yalnız "1.930 kcal".
 */
export function EnergyTargetLine({
  energyRaw,
  target,
  className = "",
}: {
  energyRaw: number;
  target: number | null;
  className?: string;
}) {
  const kcal = Math.round(energyRaw);
  if (target == null || target <= 0) {
    return (
      <span className={`font-black text-slate-800 ${className}`}>
        {formatEnergy(kcal)} <span className="text-[0.75em] font-bold text-slate-400">kcal</span>
      </span>
    );
  }
  const diff = kcal - Math.round(target);
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <span className={`font-black text-slate-800 ${className}`}>
      {formatEnergy(kcal)}
      <span className="mx-1 font-bold text-slate-400">/ {formatEnergy(target)} kcal</span>
      <span className="font-bold text-slate-500">
        · {sign}
        {formatEnergy(Math.abs(diff))} kcal
      </span>
    </span>
  );
}
