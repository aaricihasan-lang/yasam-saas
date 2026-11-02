// 02.11.2026 — Word/PDF rapor bölümü (SAF): Klasik Asalet ve Almuten (#644). Yalnız KAYITLI teknik veri (yeni hesap YOK).
// Ekrandaki etiketlerle AYNI dizgeler (lib/astrology/model/westernClassicalDignities). Hüküm metni yoktur; Lord of the Geniture YORUM
// etiketiyle, harita almuteni setleri STANDART / ALTERNATİF etiketiyle yazılır.

import { NATAL_HOUSE_SYSTEM_LABELS } from "../labels/tr";
import {
  CLASSICAL_DIGNITIES_SOURCE_TEXT,
  DIGNITY_PLANET_LABELS as P,
  DIGNITY_SCHOOL_LABELS,
  ESSENTIAL_LABELS,
  FIGURE_POINT_LABELS,
  FIGURE_PRESET_SHORT,
  RECEPTION_LABELS,
  SIGN_ANGLE_LABELS,
  SYZYGY_POINT_NOTE,
  accidentalLabel,
  dignityLon,
  signedPoints,
  type ClassicalDignitiesTechnical,
} from "../model/westernClassicalDignities";
import type { ReportBuilderLike } from "./vedicMatchReport";

const DASH = "—";
const pl = (p: string) => P[p] ?? p;

export function classicalDignitiesReport(b: ReportBuilderLike, raw: Record<string, unknown>) {
  const t = raw as unknown as ClassicalDignitiesTechnical;
  const A = t.dignities;
  if (!A || !Array.isArray(A.planets)) {
    b.p("Kayıtta klasik asalet verisi yok.", "muted");
    return;
  }
  b.h(2, "Klasik Asalet ve Almuten");
  b.kv([
    ["Ekol", `${DIGNITY_SCHOOL_LABELS[A.school.id] ?? A.school.id} — ${A.school.label}`],
    ["Harita", t.sect.day ? "Gündüz haritası (Güneş ufkun üstünde)" : "Gece haritası (Güneş ufkun altında)"],
    ["Ev sistemi", NATAL_HOUSE_SYSTEM_LABELS[t.houseSystem] ?? t.houseSystem],
    ["Ay düğümü", t.nodeType === "mean" ? "Ortalama düğüm" : "Gerçek düğüm"],
    ["Şans Noktası", dignityLon(A.partOfFortune.lon)],
    ["Kaynak", CLASSICAL_DIGNITIES_SOURCE_TEXT],
  ]);
  if (t.sect.nearHorizon) b.p(`Güneş doğum anında ufka çok yakın (${t.sect.sunAltitude.toFixed(2).replace(".", ",")}°): gündüz/gece ayrımı doğum saatindeki küçük bir farkla değişebilir.`, "warn");

  b.h(3, "Gezegen puanları");
  b.table(
    ["Gezegen", "Konum", "Ev", "Esas asalet", "Esas", "Arızi asalet", "Arızi", "Toplam"],
    A.planets.map((p) => [
      pl(p.planet),
      dignityLon(p.essential.lon),
      p.house === null ? DASH : `${p.house}. ev`,
      p.essential.reasons.map((r) => `${ESSENTIAL_LABELS[r.key] ?? r.key} ${signedPoints(r.points)}`).join(", ") || DASH,
      signedPoints(p.essential.score),
      p.accidental ? p.accidental.items.map((i) => `${accidentalLabel(i.key)} ${signedPoints(i.points)}`).join(", ") || DASH : DASH,
      signedPoints(p.accidental?.total ?? null),
      signedPoints(p.fortitude),
    ]),
    { widths: [1.1, 1.3, 0.7, 2.6, 0.7, 3.2, 0.7, 0.8], compact: true, empty: "Kayıtta gezegen verisi yok." },
  );

  b.h(3, "Kabuller");
  const recs = A.receptions.all.filter((r) => r.type !== "none");
  b.table(
    ["Çift", "Kabul", "Kabul eden (b→a)", "Kabul eden (a→b)", "Burç açısı"],
    recs.map((r) => [
      `${pl(r.a)} ↔ ${pl(r.b)}`,
      RECEPTION_LABELS[r.type] ?? r.type,
      r.bReceivesA.length ? `${pl(r.b)} → ${pl(r.a)}: ${r.bReceivesA.map((k) => ESSENTIAL_LABELS[k] ?? k).join(", ")}` : DASH,
      r.aReceivesB.length ? `${pl(r.a)} → ${pl(r.b)}: ${r.aReceivesB.map((k) => ESSENTIAL_LABELS[k] ?? k).join(", ")}` : DASH,
      r.aspect.aversion ? "açı yok (aversion)" : `${SIGN_ANGLE_LABELS[r.aspect.signAngle as number] ?? DASH}${r.aspect.withinMoieties ? " · orb içinde" : " · orb dışı"}`,
    ]),
    { widths: [1.4, 0.9, 2.2, 2.2, 1.6], compact: true, empty: "Klasik gezegenler arasında kabul yok." },
  );

  b.h(3, "Ev başı almutenleri");
  if (A.cuspAlmutens) {
    b.table(
      ["Ev", "Ev başı", "Almuten", "Puan", "Diğer adaylar"],
      A.cuspAlmutens.items.map((c) => [`${c.house}. ev`, dignityLon(c.lon), `${c.winners.map(pl).join(" = ")}${c.tie ? " (eşitlik)" : ""}`, String(c.max), c.scores.slice(0, 4).map((x) => `${pl(x.planet)} ${x.total}`).join(" · ")]),
      { widths: [0.7, 1.3, 1.5, 0.6, 2.6], compact: true },
    );
    b.p("Puanlar: burç yöneticisi 5, yücelme 4, üçlü 3, terim 2, yüz 1 (CA s. 115).", "muted");
  } else b.p("Ev başı almutenleri bu kayıtta hesaplanamadı (ev başları yok).", "muted");

  b.h(3, "Harita almuteni");
  b.table(
    ["Set", "Etiket", "Almuten", "Noktalar"],
    A.figureAlmutens.map((f) => [
      FIGURE_PRESET_SHORT[f.preset] ?? f.preset,
      f.standard ? "STANDART" : "ALTERNATİF",
      f.winners && f.winners.length ? `${f.winners.map(pl).join(" = ")} · ${f.max}` : DASH,
      `${f.points.map((x) => FIGURE_POINT_LABELS[x.id] ?? x.id).join(", ")}${f.missing.length ? ` (eksik: ${f.missing.map((m) => FIGURE_POINT_LABELS[m] ?? m).join(", ")})` : ""}`,
    ]),
    { widths: [2, 1, 1.4, 2.6], compact: true },
  );
  if (t.syzygy && A.figureAlmutens.some((f) => f.points.some((x) => x.id === "prenatal_syzygy"))) b.p(SYZYGY_POINT_NOTE, "muted");

  const lg = A.lordOfGenitureLilly;
  b.h(3, "Lord of the Geniture (Lilly) — YORUM");
  if (lg && lg.winners) {
    b.table(["Gezegen", "Esas", "Arızi", "Toplam"], lg.ranking.map((r) => [pl(r.planet), signedPoints(r.essential), signedPoints(r.accidental), signedPoints(r.total)]), { widths: [1.4, 1, 1, 1], compact: true });
    b.p(lg.note, "warn");
  } else b.p("Lord of the Geniture bu ekolde hesaplanmaz (puan yöntemi yok) ya da arızi veri eksik.", "muted");

  b.h(3, "Kaynaklar");
  b.table(["Kaynak", "İçerik", "Teyit"], A.school.sources.map((x) => [x.id, `${x.text}${x.note ? ` — ${x.note}` : ""}`, x.verified ? "Teyitli" : "Teyitsiz"]), { widths: [1.2, 4, 0.8], compact: true });
  if (A.warnings.length) b.bullets(A.warnings);
}
