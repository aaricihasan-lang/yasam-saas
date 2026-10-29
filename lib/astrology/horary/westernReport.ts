// Gökyüzü Atlası — Batı Horary (William Lilly) RAPOR MODELİ (SAF). Mevcut ortak rapor blok modeli (lib/astrology/report/model.ts
// AstroReport) üretilir; Word (docx) ve PDF (jsPDF) aynı bloklardan mevcut işleyicilerle çizilir. Veri YALNIZ sunucuda yeniden
// yapılan gerçek hesaplamadan (runWesternHorary) gelir; istemcinin gönderdiği sonuç kullanılmaz.
//
// HÜKÜM YOK: olaylar kaynak tanımıyla ve durumuyla yazılır (şartları sağlanan / aday / şartı eksik / sınıflandırılamayan).
// Soru metni yalnız uzman "rapora ekle" dediyse ve yalnız bu rapor için gelir; saklanmaz, günlüğe yazılmaz.

import {
  ASPECT_GLYPH,
  ASPECT_LABEL,
  CONSIDERATION_LABEL,
  INTERPOSITION_LABEL,
  RECEPTION_LABEL,
  SOLAR_PHASE,
  TIMELINE_TAG,
  TRANSLATION_STATUS,
  UNRESOLVED_REASON,
  accidentalLabel,
  body,
  dm,
  localAt,
  lonLabel,
  offsetLabel,
  sign,
  uncertaintyLabel,
} from "@/app/admin/astroloji/_lib/horaryWesternLabels";
import type { AstroReport, ReportBlock, WheelInput } from "@/lib/astrology/report/model";
import type { SignId } from "@/lib/astrology/model/western";
import type { WesternHoraryResult } from "./westernRun";

export const HORARY_REPORT_VERSION = "horary-western-report-1";
const SIGNS: SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const signAt = (lon: number) => SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
const ASPECT_TYPE: Record<number, string> = { 0: "conjunction", 60: "sextile", 90: "square", 120: "trine", 180: "opposition" };
const rec = (ks: string[]) => (ks.length ? ks.map((k) => RECEPTION_LABEL[k] ?? k).join(", ") : "yok");

export function horaryWheelInput(r: WesternHoraryResult): WheelInput {
  const c = r.chart;
  return {
    bodies: c.planets.map((p) => ({ id: p.planet, longitude: p.lon, sign: p.sign as SignId, degreeInSign: p.degree, retrograde: p.retrograde })),
    houses: c.cusps.map((lon, i) => ({ number: i + 1, longitude: lon, sign: signAt(lon), degreeInSign: ((lon % 360) + 360) % 30 })),
    angles: { ascendant: { longitude: c.cusps[0] }, midheaven: { longitude: c.cusps[9] } },
    aspects: c.aspects.filter((a) => a.withinMoieties).map((a) => ({ a: a.a, b: a.b, type: ASPECT_TYPE[a.angle], nature: a.angle === 60 || a.angle === 120 ? "harmonious" : a.angle === 0 ? "neutral" : "challenging" })),
  };
}

/** ASCII güvenli dosya adı kökü: Horary-William-Lilly-YYYY-AA-GG-SSDD[-DEMO]. Soru metni dosya adına GİRMEZ. */
export function horaryFileBase(r: WesternHoraryResult, demo: boolean): string {
  return `Horary-William-Lilly-${r.question.localDate}-${r.question.localTime.replace(":", "")}${demo ? "-DEMO" : ""}`;
}

export function buildHoraryReport(r: WesternHoraryResult, opts: { question: string | null; demo: boolean; generatedAt: string }): AstroReport {
  const c = r.chart;
  const tz = r.question.timezone;
  const at = (iso: string) => localAt(iso, tz);
  const b: ReportBlock[] = [];
  const asc = signAt(c.cusps[0]);
  const qs = signAt(c.cusps[r.significators.quesitedHouse - 1]);

  if (opts.demo) b.push({ kind: "para", tone: "warn", text: "DEMO — Bu rapor örnek (DEMO) girdilerle oluşturulmuştur. Hesaplama gerçektir; girdiler gerçek bir danışana ait değildir." });
  b.push({ kind: "heading", level: 1, text: "Soru ve hesaplama bilgileri" });
  const kv: [string, string][] = [];
  if (opts.question) kv.push(["Soru", opts.question]);
  kv.push(
    ["Soru anı (yerel)", `${r.question.localDate.split("-").reverse().join(".")} ${r.question.localTime} (${offsetLabel(r.question.offsetSeconds)}, ${tz})`],
    ["Soru anı (UTC)", r.question.utc.replace("T", " ").replace("Z", " UTC")],
    ["Konum", `${r.question.place} · ${r.question.latitude.toFixed(4)}°, ${r.question.longitude.toFixed(4)}°`],
    ["Sorulan ev", `${r.significators.quesitedHouse}. ev`],
    ["Yöntem", c.profile.label],
    ["Ev sistemi / efemeris", `Regiomontanus · ${c.methodology.ephemeris}`],
    ["Orb", `Lilly CA s. 107 (${c.methodology.orbVariant})`],
    ["Rapor sürümü", `${HORARY_REPORT_VERSION} · oluşturma ${opts.generatedAt.replace("T", " ").slice(0, 16)} UTC`],
  );
  b.push({ kind: "kv", rows: kv });
  if (r.question.dstResolved) b.push({ kind: "para", tone: "muted", text: "Yerel saat yaz saati geçişinde iki kez yaşandı; uzmanın seçtiği an kullanıldı." });

  b.push({ kind: "heading", level: 1, text: "Horary çarkı" });
  b.push({ kind: "chart", chart: horaryWheelInput(r), caption: "Soru anı haritası · Regiomontanus evleri · orb içindeki açılar" });

  b.push({ kind: "heading", level: 1, text: "Göstergeler" });
  b.push({
    kind: "kv",
    rows: [
      ["Soran", `${body(r.significators.querent)} (1. ev, ${sign(asc)})`],
      ["Sorulan", `${body(r.significators.quesited)} (${r.significators.quesitedHouse}. ev, ${sign(qs)})`],
      ["Ortak gösterge", "Ay"],
      ["Kural", r.significators.rule],
    ],
  });
  if (r.significators.sameRuler) b.push({ kind: "para", tone: "warn", text: "Soran ve sorulan aynı gezegen — gösterge çifti analizi yapılmadı; Ay ilişkisi gösterilir." });
  for (const p of r.pairs) {
    const a = p.analysis;
    const rows: [string, string][] = [
      ["Şu anki açı", `${ASPECT_LABEL[a.now.angle]}, ${dm(a.now.orb)} uzaklık · ${a.now.applying ? "yaklaşıyor" : "ayrılıyor"} · ${a.now.withinMoieties ? "orb içinde" : "orb dışında"}`],
      ["Kesinleşme", a.perfection ? `${ASPECT_GLYPH[a.perfection.angle]} ${ASPECT_LABEL[a.perfection.angle]} — ${at(a.perfection.atUtc)} ${uncertaintyLabel(a.perfection.uncertaintySec) ?? ""}`.trim() : `${r.horizonDays} günlük hesaplama ufkunda yok`],
    ];
    b.push({ kind: "heading", level: 3, text: `${body(p.a)} – ${body(p.b)}` });
    b.push({ kind: "kv", rows });
  }

  b.push({ kind: "heading", level: 1, text: "Ay'ın durumu" });
  b.push({
    kind: "kv",
    rows: [
      ["Burç", `${sign(c.moon.sign)} · burç değişimi ${at(c.moon.ingressUtc)}`],
      ["Boşlukta (burç içi kesinleşme yok)", c.moon.voidOfCourse ? "Evet" : "Hayır"],
      ["Dış gezegenler sayılırsa boşlukta", c.moon.voidOfCourseWithOuter ? "Evet" : "Hayır"],
      ["Burç içindeki sonraki açılar", c.moon.nextInSign.length ? c.moon.nextInSign.map((x) => `${ASPECT_GLYPH[x.angle]} ${body(x.b)} ${at(x.atUtc)}`).join(" · ") : "yok"],
      ["Son açı", c.moon.last ? `${ASPECT_GLYPH[c.moon.last.angle]} ${body(c.moon.last.b)} ${at(c.moon.last.atUtc)}` : "—"],
    ],
  });

  b.push({ kind: "heading", level: 1, text: "Gezegenler, asal ve arızi asalet" });
  b.push({
    kind: "table",
    table: {
      columns: ["Gezegen", "Konum", "Ev", "Hız °/g", "Asal asalet", "Asal puan", "Arızi puan", "Güneş'e göre"],
      widths: [12, 18, 6, 9, 22, 8, 8, 12],
      compact: true,
      rows: c.planets.map((p) => {
        const e = p.essential;
        const dig = [e.domicile && "ev", e.exaltation && "yücelme", e.triplicity && "üçlü", e.term && "terim", e.face && "yüz", e.detriment && "zarar", e.fall && "düşüş", e.peregrine && "peregrine"].filter(Boolean).join(", ");
        return [
          body(p.planet),
          `${lonLabel(p.lon)}${p.retrograde ? " R" : ""}`,
          `${p.house}${p.houseVirtue?.shifted ? ` (etki ${p.houseVirtue.virtueHouse})` : ""}`,
          p.speed.toFixed(3),
          dig || "—",
          e.score === null ? "—" : String(e.score),
          p.accidental.total === null ? "—" : String(p.accidental.total),
          p.solar ? SOLAR_PHASE[p.solar.phase] : "—",
        ];
      }),
    },
  });
  b.push({
    kind: "bullets",
    items: c.planets.map((p) => `${body(p.planet)} arızi: ${p.accidental.items.map((i) => `${accidentalLabel(i.key)} ${i.points !== null && i.points > 0 ? "+" : ""}${i.points ?? "—"}`).join(" · ")}`),
  });

  b.push({ kind: "heading", level: 1, text: "Regiomontanus ev başlangıçları" });
  b.push({ kind: "table", table: { columns: ["Ev", "Başlangıç", "Ev", "Başlangıç"], widths: [8, 42, 8, 42], compact: true, rows: Array.from({ length: 6 }, (_, i) => [`${i + 1}`, lonLabel(c.cusps[i]), `${i + 7}`, lonLabel(c.cusps[i + 6])]) } });
  b.push({
    kind: "kv",
    rows: [
      ["Şans Noktası", `${lonLabel(c.partOfFortune.lon)} (${c.partOfFortune.house}. ev)`],
      ["Gündüz / gece", `${c.sect.day ? "Gündüz" : "Gece"} haritası · Güneş irtifası ${c.sect.sunAltitude.toFixed(1)}°`],
      ["Gezegen saati", c.planetaryHour ? `${body(c.planetaryHour.hourRuler)} · günün yöneticisi ${body(c.planetaryHour.dayRuler)}` : "hesaplanamadı (kutup bölgesi)"],
    ],
  });

  b.push({ kind: "heading", level: 1, text: "Kabul (reception) ilişkileri" });
  const mutual = c.planets.flatMap((p) => p.mutualReception.map((m) => `${body(p.planet)} ↔ ${body(m.with)} · ${RECEPTION_LABEL[m.by]}${m.points !== null ? ` (+${m.points} puan, CA s. 115)` : ""}`));
  b.push({ kind: "para", text: `Karşılıklı kabul: ${mutual.length ? mutual.join("; ") : "yok"}` });
  const hosts = [...new Set(c.receptions.map((x) => x.host))];
  b.push({ kind: "bullets", items: hosts.length ? hosts.map((h) => `${body(h)} kabul eder → ${c.receptions.filter((x) => x.host === h).map((x) => `${body(x.guest)} (${rec(x.by)})`).join(" · ")}`) : ["Tek yönlü kabul yok."] });

  b.push({ kind: "heading", level: 1, text: "Orb içindeki açılar" });
  const near = c.aspects.filter((a) => a.withinMoieties);
  b.push({
    kind: "table",
    table: { columns: ["Açı", "Uzaklık", "Durum", "Burç"], widths: [40, 15, 20, 25], compact: true, rows: near.length ? near.map((a) => [`${body(a.a)} ${ASPECT_GLYPH[a.angle]} ${body(a.b)} (${ASPECT_LABEL[a.angle]})`, dm(a.orb), a.applying ? "yaklaşan" : "ayrılan", a.bySign ? "burç içi" : "burç dışı"]) : [["—", "—", "—", "—"]] },
  });

  b.push({ kind: "heading", level: 1, text: `Olay çizelgesi (sonraki ${r.horizonDays} gün)` });
  b.push({
    kind: "table",
    table: {
      columns: ["Yerel an", "Olay", "Anlam"],
      widths: [24, 32, 44],
      compact: true,
      rows: r.timeline.length
        ? r.timeline.map((e) => [
            `${at(e.atUtc)} ${uncertaintyLabel(e.uncertaintySec) ?? ""}`.trim(),
            e.bodies.length === 2 ? `${body(e.bodies[0])} ${e.angle !== null ? ASPECT_GLYPH[e.angle] : "→"} ${body(e.bodies[1])}` : body(e.bodies[0]),
            e.tags
              .map((t) =>
                t.kind === "station"
                  ? `${TIMELINE_TAG.station} (${t.note === "retrograde" ? "geri" : "düz"})`
                  : t.kind === "ingress" && t.note
                    ? `${TIMELINE_TAG.ingress}: ${t.note.split("→").map(sign).join(" → ")}`
                    : t.kind === "interposition" && t.note
                      ? INTERPOSITION_LABEL[t.note] ?? TIMELINE_TAG.interposition
                      : t.kind === "translation_join" && t.note
                        ? `${TIMELINE_TAG.translation_join} · ${TRANSLATION_STATUS[t.note]}`
                        : TIMELINE_TAG[t.kind],
              )
              .join(" · "),
          ])
        : [["—", "Ufuk içinde olay yok", "—"]],
    },
  });

  // Olaylar: motor kayıtları DEĞİŞTİRİLMEDEN dört gruba ayrılır (ekrandaki "Tüm olaylar" ile aynı sınıflama).
  const met: string[] = [];
  const cand: string[] = [];
  const inc: string[] = [];
  const unr: string[] = [];
  for (const p of r.pairs) {
    const a = p.analysis;
    for (const x of a.interpositions) {
      const t = `${INTERPOSITION_LABEL[x.kind]}: ${body(x.significator)} ${ASPECT_GLYPH[x.angle]} ${body(x.third)} — ${at(x.atUtc)}`;
      if (x.kind === "unresolved") unr.push(`${t}${x.unresolvedReason ? ` (neden: ${UNRESOLVED_REASON[x.unresolvedReason]})` : ""}`);
      else cand.push(t);
    }
    for (const t of a.translations) {
      const line = `Işık aktarımı — ${body(t.by)}: ${body(t.from)} (${at(t.separatedAt)}) → ${body(t.to)} (${at(t.joinsAt)}) · ${TRANSLATION_STATUS[t.status]}${t.interruptions.length ? ` · araya girenler: ${t.interruptions.map((i) => `${body(i.with)} ${ASPECT_GLYPH[i.angle]}${i.orderUncertain ? " (sırası belirsiz)" : ""}`).join(", ")}` : ""}${t.status === "valid" ? ` · CA s. 125: ayrılmış ${t.judgement.significatorsSeparated ? "evet" : "hayır"}, kabul ${rec(t.judgement.receivedBy)}` : ""}`;
      (t.status === "valid" && t.judgement.ok ? met : inc).push(line);
    }
    for (const x of a.collections) {
      const line = `Işık toplanması — ${body(x.by)} (${at(x.aAt)} / ${at(x.bAt)}) · ${x.ok ? "CA s. 126 şartları sağlanıyor" : "şartı eksik"} · kabul: ${body(p.a)} ${rec(x.receivedByA)}, ${body(p.b)} ${rec(x.receivedByB)}`;
      (x.ok ? met : inc).push(line);
    }
    if (a.refranation) cand.push(`Refranation adayı: ${body(p.a)}–${body(p.b)} kesinleşmeden geri dönüyor (en küçük uzaklık ${dm(a.refranation.minOrb)}, ${at(a.refranation.atUtc)})`);
  }
  b.push({ kind: "heading", level: 1, text: "Işık aktarımı, toplanma, engelleme, hüsran ve refranation" });
  b.push({ kind: "para", tone: "muted", text: "Bu bölüm hüküm içermez. Olaylar William Lilly'nin tanımlarına göre sınıflandırılmıştır; değerlendirme uzmana aittir." });
  const group = (title: string, items: string[]) => {
    b.push({ kind: "heading", level: 3, text: title });
    b.push({ kind: "bullets", items: items.length ? items : ["Yok."] });
  };
  group("Klasik şartları sağlanan", met);
  group("Aday — kaynak tanımına uyan olay", cand);
  group("Şartı eksik, kesintili veya sırası/hareketi belirsiz — geçerli sonuç değil", inc);
  group("Sınıflandırılamayan — kaynak bu durumu çözmüyor", unr);

  b.push({ kind: "heading", level: 1, text: "Radikallik ve dikkat noktaları" });
  if (c.radicality) b.push({ kind: "para", text: c.radicality.note });
  b.push({ kind: "bullets", items: c.considerations.length ? c.considerations.map((x) => `${CONSIDERATION_LABEL[x.key] ?? x.key}: ${x.evidence}`) : ["Lilly'nin dikkat noktalarından (CA s. 121–123) hiçbiri yok."] });

  b.push({ kind: "heading", level: 1, text: "Kaynak ve metodoloji" });
  b.push({ kind: "bullets", items: [c.profile.label, `Ev sistemi: Regiomontanus · Efemeris: ${c.methodology.ephemeris}`, r.significators.rule, ...r.openPoints.map((o) => `Açık nokta: ${o}`), "Bu rapor hüküm üretmez; olaylar kaynak tanımıyla ve olay kanıtıyla listelenir."] });

  return {
    title: "William Lilly Horary — Soru Haritası",
    cover: {
      client: opts.demo ? "DEMO girdisi" : "—",
      analysisDate: `${r.question.localDate.split("-").reverse().join(".")} ${r.question.localTime}`,
      tradition: "Klasik Batı Horary",
      technique: "William Lilly (1647)",
      options: `Sorulan ev: ${r.significators.quesitedHouse} · Regiomontanus`,
      dateLabel: "Soru anı",
    },
    blocks: b,
    fileBase: horaryFileBase(r, opts.demo),
    hasInterpretation: false,
    hasChart: true,
  };
}
