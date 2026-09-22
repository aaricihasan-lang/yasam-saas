/**
 * FAZ 2 — SAF görüntüleme yardımcıları (yan-etkisiz; harness ile test edilir).
 * Byte/MB/GB, Türkiye saatli tarih + göreli zaman, ve MetricValue → görünüm sınıflandırması.
 */
import type { MetricValue } from "@/lib/admin/stats/contract";

/** Byte → insanca. Negatif/geçersiz → "—". */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = n / Math.pow(1024, i);
  const s = i === 0 ? String(n) : val.toFixed(val >= 100 || i === 0 ? 0 : 1);
  return `${s} ${units[i]}`;
}

/** ISO → Türkiye saatli tam tarih. Geçersiz → "—". */
export function formatDateTimeTr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(t));
}

/** ISO → "x önce" (TR). nowMs test için parametre. Geçersiz → "—". */
export function formatRelativeTr(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, nowMs - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} gün önce`;
  return formatDateTimeTr(iso);
}

/**
 * MetricValue → görünüm türü. value===null (unavailable→"—" / diğer→"Veri yok"),
 * measured 0 → gerçek sıfır, approximate → yaklaşık, aksi → değer. 0 ASLA otomatik
 * unavailable/null'a; null ASLA otomatik 0'a dönüşmez.
 */
export type MetricDisplayKind = "value" | "approximate" | "zero" | "unavailable" | "empty";

export function metricDisplayKind<T>(m: MetricValue<T> | null | undefined): MetricDisplayKind {
  if (!m) return "empty";
  if (m.value === null || m.value === undefined) {
    return m.status === "unavailable" ? "unavailable" : "empty";
  }
  if (m.status === "approximate") return "approximate";
  if (m.status === "measured" && (m.value as unknown) === 0) return "zero";
  return "value";
}

/** Görünüm türü → kısa etiket (değer olmayan durumlar için). */
export function metricPlaceholder(kind: MetricDisplayKind): string {
  switch (kind) {
    case "unavailable": return "Ölçülemiyor";
    case "empty": return "Veri yok";
    default: return "";
  }
}

/** Arşiv, pasifin ALT KÜMESİDİR — toplam = aktif + pasif (arşiv AYRI eklenmez). */
export function isConsistentCounts(active: number, passive: number, archived: number, total: number): boolean {
  return archived <= passive && active + passive === total;
}
