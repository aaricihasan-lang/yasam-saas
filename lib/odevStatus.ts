const META: Record<string, { label: string; color: string; className: string }> = {
  bekliyor:   { label: "Bekliyor",     color: "#d97706", className: "border-amber-200 bg-amber-100 text-amber-800"      },
  devam:      { label: "Devam Ediyor", color: "#2563eb", className: "border-blue-200 bg-blue-100 text-blue-800"         },
  tamamlandi: { label: "Tamamlandı",   color: "#16a34a", className: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  iptal:      { label: "İptal",        color: "#ef4444", className: "border-red-200 bg-red-100 text-red-700"             },
  gecikti:    { label: "Gecikti",      color: "#dc2626", className: "border-red-200 bg-red-100 text-red-700"             },
};

/** Ödev durumunun Türkçe etiketi. Bilinmeyen → ham değer ya da "Bilinmiyor". */
export function odevDurumLabel(status: string | null | undefined): string {
  return META[status ?? ""]?.label ?? (status || "Bilinmiyor");
}

/** Ödev durumunun inline stil rengi (#hex). */
export function odevDurumColor(status: string | null | undefined): string {
  return META[status ?? ""]?.color ?? "#64748b";
}

/** Ödev durumunun Tailwind badge sınıfları. */
export function odevDurumClass(status: string | null | undefined): string {
  return META[status ?? ""]?.className ?? "border-slate-200 bg-slate-100 text-slate-500";
}
