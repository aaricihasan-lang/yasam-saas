// HD — analiz ekranı "Word İndir": yeniden kullanılacak hazır Word raporunu seçer (SAF; istemci + test).
//
// Yalnız AYNI analize (chart_id) bağlı, Word v2 (hd-report-2) şemalı DONMUŞ profesyonel rapor
// yeniden indirilir → her tıklamada yeni rapor kopyası oluşmaz, Roxy çağrılmaz. Eski şema
// (hd-report-1) veya eski "legacy" raporlar Kayıtlı Raporlar'da kalır; analiz ekranında Word v2
// ile yeni rapor oluşturulur. (Sabit, sunucu modülü reportSnapshotV2'deki değerle aynı; istemci
// paketine node:crypto girmemesi için burada tekrar edilir — harness eşitliği doğrular.)

export const WORD_V2_SCHEMA_VERSION = "hd-report-2";

export type WordReportBrief = {
  id: string;
  chart_id: string | null;
  report_kind: string | null;
  schema_version: string | null;
  created_at: string;
};

/** Analizin en yeni Word v2 raporu (yoksa null). */
export function latestWordReportId(rows: ReadonlyArray<WordReportBrief>, chartId: string): string | null {
  let best: WordReportBrief | null = null;
  for (const r of rows) {
    if (r.chart_id !== chartId || r.report_kind !== "canonical" || r.schema_version !== WORD_V2_SCHEMA_VERSION) continue;
    if (!best || r.created_at > best.created_at) best = r;
  }
  return best?.id ?? null;
}
