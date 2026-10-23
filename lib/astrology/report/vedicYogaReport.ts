// 2026-10-22 — Word/PDF: Vedik D1 yoga denetim tablosu (SAF). Yalnız KAYITLI D1 teknik verisi (yeni istek / yeni hesap YOK).
// Durum, nitelik ve kanıt kayıttaki karardır; oluşum kuralı + ekol notu kendi kataloğumuzdan; ilgili graha/bhava ve bağımsız denetim
// D1 konumlarından türetilir. Sağlayıcının oluşum/etki metinleri burada BASILMAZ (yalnız yorum katmanı).

import type { VedicD1Technical } from "../model/vedic";
import {
  VEDIC_YOGA_CONSISTENCY_LABELS,
  VEDIC_YOGA_DICTIONARY_NOTE,
  VEDIC_YOGA_METHOD_TEXT,
  VEDIC_YOGA_QUALITY_LABELS,
  VEDIC_YOGA_STATUS_LABELS,
} from "../model/vedicYoga";
import { VEDIC_YOGA_FAMILY_LABELS } from "../model/vedic";
import { analyzeVedicYogas, vedicYogaSummary, vedicYogaTriggerText } from "../verify/vedicYoga";
import type { ReportBuilderLike } from "./vedicMatchReport";

const DASH = "—";

export function vedicYogaReport(b: ReportBuilderLike, technical: unknown) {
  const rows = analyzeVedicYogas(technical as VedicD1Technical);
  if (!rows.length) return;
  const sum = vedicYogaSummary(rows);
  const fam = (f: string) => (VEDIC_YOGA_FAMILY_LABELS as Record<string, string>)[f] ?? (f || DASH);
  b.h(3, `Yoga denetim tablosu (${sum.total} kural)`);
  b.p(
    `${sum.total} hesaplanmış yoga denetiminden ${sum.present} tanesi oluşuyor${sum.suppressed ? `, ${sum.suppressed} tanesi bastırıldı` : ""}. Bağımsız denetim: ${sum.consistent} uyumlu, ${sum.uncertain} ekole bağlı, ${sum.notChecked} denetlenmedi${sum.inconsistent ? `, ${sum.inconsistent} uyuşmazlık` : ""}.`,
    sum.inconsistent ? "warn" : "muted",
  );
  b.table(
    ["Yoga", "Aile", "Durum", "Oluşum kuralı", "İlgili graha · bhava", "Nitelik", "Bağımsız denetim"],
    rows.map((r) => [
      r.sanskrit,
      fam(r.family),
      VEDIC_YOGA_STATUS_LABELS[r.status],
      r.formation ?? DASH,
      vedicYogaTriggerText(r.triggers),
      r.quality ? VEDIC_YOGA_QUALITY_LABELS[r.quality] : DASH,
      VEDIC_YOGA_CONSISTENCY_LABELS[r.consistency],
    ]),
    { widths: [1.2, 1.1, 1, 3.2, 1.8, 0.8, 1], compact: true },
  );
  const notable = rows.filter((r) => r.status !== "absent" || r.consistency === "inconsistent");
  if (notable.length) {
    b.h(3, "Oluşan / bastırılan yogalar — denetim ayrıntısı");
    b.table(
      ["Yoga", "Durum", "Bağımsız denetim ayrıntısı", "Kanıt"],
      notable.map((r) => [r.sanskrit, VEDIC_YOGA_STATUS_LABELS[r.status], `${VEDIC_YOGA_CONSISTENCY_LABELS[r.consistency]}: ${r.check.detail}`, r.evidence ?? DASH]),
      { widths: [1.2, 1.1, 3, 3.4], compact: true },
    );
  }
  const schools = [...new Map(rows.filter((r) => r.status !== "absent" && r.school).map((r) => [r.school as string, `${r.sanskrit}: ${r.school}`])).values()];
  if (schools.length) {
    b.h(3, "Ekol notları");
    b.bullets(schools);
  }
  b.p(VEDIC_YOGA_METHOD_TEXT, "muted");
  b.p(VEDIC_YOGA_DICTIONARY_NOTE, "muted");
}
