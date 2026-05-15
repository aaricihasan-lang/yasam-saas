/** Analiz türü anahtar → görünen ad (liste ve filtreler). */

export const ANALIZ_TURU_LABELS: Record<string, string> = {
  "ana-kulvar": "Ana Kulvar",
  "yan-kulvar": "Yan Kulvar",
  "ifade-sayisi": "İfade Sayısı",
  "hayat-yolu": "Hayat Yolu",
  "cakra-omurga": "Çakra Omurga",
  element: "Element",
  diger: "Diğer",
};

export const ANALIZ_TURU_FILTER_OPTIONS = [
  { value: "", label: "Tüm analiz türleri" },
  ...Object.entries(ANALIZ_TURU_LABELS).map(([value, label]) => ({ value, label })),
];

export function analizTuruLabel(key: string): string {
  return ANALIZ_TURU_LABELS[key] ?? key;
}

export function formatBilgiBankaTarih(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
