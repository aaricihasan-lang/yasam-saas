/**
 * Klasik Numeroloji · Karşılaştırma — MEVCUT NUMEROLOJİ kayıtlı anlık görüntü okuyucu (SAF).
 *
 * Kaynak: `numerology_records.analysis_data` (kaydedildiği hali). Şekil (app/numeroloji/utils/analysisJson.ts):
 *   { version: 1, motor: <hesaplaNumeroloji çıktısı>, summary, tas?, gorsel?, calc?: { methodology, stampedAt, recalculatedFrom? } }
 *
 * GARANTİLER:
 *   • Mevcut motor ASLA çalıştırılmaz / içe aktarılmaz; değerler yalnız kayıttan okunur.
 *   • Girdi nesnesi DEĞİŞTİRİLMEZ (yalnız okuma; çıktı yeni nesnelerdir).
 *   • `display` metni kaydedildiği gibi korunur; kök (root) yalnız gösterimin/kayıtlı bileşenlerin rakam
 *     köküdür (1–9; 0 yalnız 0 için). Kök, bir "yeniden hesap" değildir: mod 9 korunduğu için kaydın
 *     kendi sayılarının kökü ile aynıdır.
 *   • Eksik / eski / bozuk alan → { ok:false, reason } (asla hata fırlatmaz).
 *
 * Kayıtta TUTULMAYAN kavramlar (Kişisel Yıl/Ay/Gün, Olgunluk, Doğum Günü Enerjisi): Mevcut Numeroloji
 * ekranında canlı hesaplanır, `analysis_data` içinde yoktur → reason "not_in_snapshot".
 */

/** Mevcut Numeroloji'nin bilinen güncel metodoloji damgası (lib/numeroloji/methodology.ts ile test eşitliği). */
export const LEGACY_METHODOLOGY_KNOWN = "num-v1.1-ozel-sayi-2026-10";

export type LegacyMissingReason =
  | "no_snapshot"
  | "invalid_snapshot"
  | "unsupported_version"
  | "field_missing"
  | "not_in_snapshot"
  | "empty"
  | "unparseable";

export const LEGACY_MISSING_REASON_TR: Readonly<Record<LegacyMissingReason, string>> = Object.freeze({
  no_snapshot: "Mevcut Numeroloji kaydı seçilmedi.",
  invalid_snapshot: "Kayıtlı analiz okunamadı.",
  unsupported_version: "Kayıtlı analizin sürümü desteklenmiyor.",
  field_missing: "Bu bölüm bu kayıtta bulunmuyor.",
  not_in_snapshot: "Bu değer kayıtlı analizde saklanmaz; Mevcut Numeroloji ekranında görülür.",
  empty: "Bu kayıtta değer boş.",
  unparseable: "Kayıtlı gösterim sayısal olarak çözümlenemedi.",
});

export type ParsedDisplay = {
  /** Kaydedildiği gibi (değiştirilmez). */
  display: string;
  /** Sondaki parantez grubu soyulmuş ana gösterim. */
  main: string;
  /** Ana gösterimdeki sayılar ("/" veya "-" ayırıcı). */
  segments: number[];
  /** Parantez içi (alternatif okuma) metni; yoksa null. */
  parenthetical: string | null;
};

export type LegacyValue = {
  display: string;
  /** Tek sayıya karşılık gelen değer (Hayat Yolu'nda son sayı; tek parçalı kulvar; zirve/mücadele sayısı). Bileşik yol gösteriminde null. */
  value: number | null;
  /** Rakam kökü (1–9; değer 0 ise 0). */
  root: number | null;
  /** Okunan alan yolu. */
  source: string;
  extra?: Record<string, unknown>;
};

export type LegacyRead = { ok: true; value: LegacyValue } | { ok: false; reason: LegacyMissingReason };

export type LegacyPeriod = { position: number; read: LegacyRead };

export type LegacyKarmicMarker = { field: "anaKulvar" | "yanKulvar"; number: 19 };

export type LegacyStone = { name: string; slot: "bileklik" | "kolye" | "kutle" };

export type LegacySnapshotRead = {
  ok: boolean;
  reason: LegacyMissingReason | null;
  version: number | null;
  methodology: string | null;
  /** Damga bilinen güncel metodolojiye eşit mi (null: damga yok → önceki metodoloji). */
  methodologyCurrent: boolean | null;
  stampedAt: string | null;
  recalculatedFrom: string | null;
  hayatYolu: LegacyRead;
  ifade: LegacyRead;
  anaKulvar: LegacyRead;
  yanKulvar: LegacyRead;
  dogumGunu: LegacyRead;
  olgunluk: LegacyRead;
  kisiselYil: LegacyRead;
  kisiselAy: LegacyRead;
  kisiselGun: LegacyRead;
  zirve: { format: "iki_metot" | "tek_yas" | null; periods: LegacyPeriod[]; reason: LegacyMissingReason | null };
  mucadele: { format: "kitap2" | "onceki" | null; periods: LegacyPeriod[]; reason: LegacyMissingReason | null };
  karmik: { markers: LegacyKarmicMarker[]; available: boolean };
  /** Yalnız Mevcut Numeroloji bölümlerinden kayıtta bulunanlar (glossary ONLY_LEGACY anahtarları). */
  presentOnlyLegacy: string[];
  stones: LegacyStone[];
};

// ── yardımcılar ──────────────────────────────────────────────────────────────────────────────

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function finiteInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+\s*$/.test(v)) return Number(v);
  return null;
}

/** Rakam kökü: 0 → 0, aksi halde 1–9. */
export function digitRoot(n: number): number {
  const a = Math.abs(Math.trunc(n));
  if (a === 0) return 0;
  return 1 + ((a - 1) % 9);
}

const PAREN_RE = /\s*\(([^()]*)\)\s*$/;

/** Kayıtlı gösterimi ayrıştırır ("36/9", "19/3", "11/11 (22)", "22-11"); gösterim değiştirilmez. */
export function parseLegacyDisplay(display: unknown): ParsedDisplay | null {
  if (typeof display !== "string") return null;
  const full = display;
  const t = full.trim();
  if (!t || t === "-" || t === "—") return null;
  const m = PAREN_RE.exec(t);
  const main = (m ? t.slice(0, m.index) : t).trim();
  const parenthetical = m ? m[1].trim() : null;
  if (!main) return null;
  const parts = main.split(/\s*[/\-]\s*/);
  const segments: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,4}$/.test(p)) return null;
    segments.push(Number(p));
  }
  return { display: full, main, segments, parenthetical };
}

const NOT_IN_SNAPSHOT: LegacyRead = Object.freeze({ ok: false, reason: "not_in_snapshot" }) as LegacyRead;

function fail(reason: LegacyMissingReason): LegacyRead {
  return { ok: false, reason };
}

function displayOf(field: unknown): { display: string } | LegacyMissingReason {
  const f = rec(field);
  if (!f) return "field_missing";
  if (typeof f.display !== "string") return "field_missing";
  const t = f.display.trim();
  if (!t || t === "-" || t === "—") return "empty";
  return { display: f.display };
}

function componentValuesOf(field: unknown): number[] | null {
  const f = rec(field);
  const cv = f?.componentValues;
  if (!Array.isArray(cv)) return null;
  const out: number[] = [];
  for (const x of cv) {
    const n = finiteInt(x);
    if (n === null || n < 0) return null;
    out.push(n);
  }
  return out;
}

/** Hayat Yolu: "toplam/sade" → değer = son sayı, kök = son sayının kökü (toplam ile aynı kök). */
function readHayatYolu(motor: Record<string, unknown>): LegacyRead {
  const d = displayOf(motor.hayatYolu);
  if (typeof d === "string") return fail(d);
  const p = parseLegacyDisplay(d.display);
  if (!p) return fail("unparseable");
  const last = p.segments[p.segments.length - 1];
  return {
    ok: true,
    value: {
      display: d.display,
      value: last,
      root: digitRoot(last),
      source: "motor.hayatYolu.display",
      extra: { segments: p.segments, ...(p.segments.length > 1 ? { total: p.segments[0] } : {}) },
    },
  };
}

/** İfade: tek sayı (1–9, 11, 22). */
function readIfade(motor: Record<string, unknown>): LegacyRead {
  const d = displayOf(motor.ifadeSayisi);
  if (typeof d === "string") return fail(d);
  const p = parseLegacyDisplay(d.display);
  if (!p) return fail("unparseable");
  const v = p.segments.length === 1 && !p.parenthetical ? p.segments[0] : null;
  const root = digitRoot(p.segments.reduce((a, b) => a + b, 0));
  return { ok: true, value: { display: d.display, value: v, root, source: "motor.ifadeSayisi.display" } };
}

/**
 * Kulvar (Ana/Yan): özel sayı yolu gösterimi. Tek parçalı ("8", "11") → değer; bileşik ("19/2", "11/11 (22)") → değer null.
 * Kök: kayıtlı `componentValues` toplamının kökü (varsa); yoksa ana gösterim sayılarının toplam kökü.
 */
function readKulvar(motor: Record<string, unknown>, key: "anaKulvar" | "yanKulvar"): LegacyRead {
  const d = displayOf(motor[key]);
  if (typeof d === "string") return fail(d);
  const p = parseLegacyDisplay(d.display);
  if (!p) return fail("unparseable");
  const comps = componentValuesOf(motor[key]);
  const root = digitRoot((comps && comps.some((c) => c > 0) ? comps : p.segments).reduce((a, b) => a + b, 0));
  const single = p.segments.length === 1 && !p.parenthetical ? p.segments[0] : null;
  const f = rec(motor[key])!;
  const extra: Record<string, unknown> = { segments: p.segments, rootFrom: comps && comps.some((c) => c > 0) ? "componentValues" : "display" };
  if (p.parenthetical) extra.parenthetical = p.parenthetical;
  if (comps) extra.componentValues = comps;
  if (typeof f.combinedReading === "string" && f.combinedReading.trim()) extra.combinedReading = f.combinedReading.trim();
  return { ok: true, value: { display: d.display, value: single, root, source: `motor.${key}.display`, extra } };
}

function readZirve(motor: Record<string, unknown>): LegacySnapshotRead["zirve"] {
  const z = rec(motor.zirveYillari);
  if (!z) return { format: null, periods: [], reason: motor.zirveYillari === null ? "empty" : "field_missing" };
  if (!Array.isArray(z.peaks) || z.peaks.length === 0) return { format: null, periods: [], reason: "field_missing" };
  let anyM1 = false;
  const periods: LegacyPeriod[] = [];
  z.peaks.forEach((raw, i) => {
    const pk = rec(raw);
    const position = finiteInt(pk?.index) ?? i + 1;
    if (!pk) {
      periods.push({ position, read: fail("unparseable") });
      return;
    }
    const topic = finiteInt(pk.topic);
    const parsed = parseLegacyDisplay(pk.display);
    // "11/2" → 11 (usta korunmuş), "7" → 7. Eski kayıtlarda display yok → topic (1–9).
    const value = parsed ? parsed.segments[0] : topic;
    if (value === null) {
      periods.push({ position, read: fail("unparseable") });
      return;
    }
    const display = typeof pk.display === "string" && pk.display.trim() ? pk.display : String(value);
    const yasMetot1 = finiteInt(pk.yasMetot1);
    const yasMetot2 = finiteInt(pk.yasMetot2) ?? finiteInt(pk.age);
    if (yasMetot1 !== null) anyM1 = true;
    const extra: Record<string, unknown> = {};
    if (topic !== null) extra.topic = topic;
    if (yasMetot1 !== null) extra.yasMetot1 = yasMetot1;
    if (yasMetot2 !== null) extra.yasMetot2 = yasMetot2;
    if (!parsed) extra.displayFromTopic = true;
    periods.push({ position, read: { ok: true, value: { display, value, root: digitRoot(value), source: `motor.zirveYillari.peaks[${i}]`, extra } } });
  });
  return { format: anyM1 ? "iki_metot" : "tek_yas", periods, reason: null };
}

/**
 * Mücadele: formül eşlemesi (Klasik sırasıyla) — kitap2: M1→1, M2→2, Ana→3, M3→4;
 * önceki metodoloji (yontem/anaMucadele yok): M1→1, M2→2, M3 (= |M1−M2|)→3.
 */
function readMucadele(motor: Record<string, unknown>): LegacySnapshotRead["mucadele"] {
  const m = rec(motor.mucadeleYillari);
  if (!m) return { format: null, periods: [], reason: motor.mucadeleYillari === null ? "empty" : "field_missing" };
  const list = Array.isArray(m.method1) ? m.method1 : null;
  if (!list || list.length === 0) return { format: null, periods: [], reason: "field_missing" };
  const kitap2 = m.yontem === "kitap2" || finiteInt(m.anaMucadele) !== null;
  const item = (idx: number): Record<string, unknown> | null => {
    const found = list.map(rec).find((x) => x && finiteInt(x.index) === idx);
    return found ?? rec(list[idx - 1]);
  };
  const periodFrom = (legacyIndex: number, classicPos: number, labelKey: string): LegacyPeriod => {
    const it = item(legacyIndex);
    const topic = finiteInt(it?.topic);
    if (!it || topic === null) return { position: classicPos, read: fail("field_missing") };
    const extra: Record<string, unknown> = { legacyKey: labelKey };
    const cutoff = finiteInt(it.cutoffAge);
    const start = finiteInt(it.startAge);
    const age = finiteInt(it.age);
    if (start !== null) extra.startAge = start;
    if (cutoff !== null) extra.cutoffAge = cutoff;
    else if (age !== null) extra.age = age;
    return {
      position: classicPos,
      read: { ok: true, value: { display: String(topic), value: topic, root: digitRoot(topic), source: `motor.mucadeleYillari.method1[${legacyIndex}]`, extra } },
    };
  };
  if (kitap2) {
    const ana = finiteInt(m.anaMucadele);
    const anaStart = finiteInt(m.anaMucadeleBaslangicYasi);
    const anaRead: LegacyRead =
      ana === null
        ? fail("field_missing")
        : {
            ok: true,
            value: {
              display: String(ana),
              value: ana,
              root: digitRoot(ana),
              source: "motor.mucadeleYillari.anaMucadele",
              extra: { legacyKey: "ana", ...(anaStart !== null ? { startAge: anaStart } : {}) },
            },
          };
    return {
      format: "kitap2",
      periods: [periodFrom(1, 1, "M1"), periodFrom(2, 2, "M2"), { position: 3, read: anaRead }, periodFrom(3, 4, "M3")],
      reason: null,
    };
  }
  return { format: "onceki", periods: [periodFrom(1, 1, "M1"), periodFrom(2, 2, "M2"), periodFrom(3, 3, "M3")], reason: null };
}

function karmicMarkers(motor: Record<string, unknown>): LegacyKarmicMarker[] {
  const out: LegacyKarmicMarker[] = [];
  for (const key of ["anaKulvar", "yanKulvar"] as const) {
    const comps = componentValuesOf(motor[key]);
    const p = parseLegacyDisplay(rec(motor[key])?.display);
    const has19 = (comps ?? []).includes(19) || (p?.segments ?? []).includes(19);
    if (has19) out.push({ field: key, number: 19 });
  }
  return out;
}

function presentOnlyLegacy(motor: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (rec(motor.pinKodu)) out.push("pin_kodu");
  if (rec(motor.cakraOmurgasi)) out.push("cakra_omurgasi");
  if (rec(motor.elementler)) out.push("elementler");
  if (typeof motor.degisimDonusumMetni === "string" && motor.degisimDonusumMetni.trim()) out.push("degisim_donusum");
  if (Array.isArray(motor.harflerinYankilanisi) && motor.harflerinYankilanisi.length > 0) out.push("harflerin_yankilanisi");
  return out;
}

function readStones(o: Record<string, unknown>): LegacyStone[] {
  const tas = rec(o.tas);
  if (!tas) return [];
  const out: LegacyStone[] = [];
  for (const slot of ["bileklik", "kolye", "kutle"] as const) {
    const v = tas[slot];
    if (typeof v !== "string") continue;
    for (const part of v.split(",")) {
      const name = part.trim();
      if (name && name.length <= 120) out.push({ name, slot });
    }
  }
  return out;
}

function emptyRead(reason: LegacyMissingReason, extra?: Partial<LegacySnapshotRead>): LegacySnapshotRead {
  const f = fail(reason);
  return {
    ok: false,
    reason,
    version: null,
    methodology: null,
    methodologyCurrent: null,
    stampedAt: null,
    recalculatedFrom: null,
    hayatYolu: f,
    ifade: f,
    anaKulvar: f,
    yanKulvar: f,
    dogumGunu: f,
    olgunluk: f,
    kisiselYil: f,
    kisiselAy: f,
    kisiselGun: f,
    zirve: { format: null, periods: [], reason },
    mucadele: { format: null, periods: [], reason },
    karmik: { markers: [], available: false },
    presentOnlyLegacy: [],
    stones: [],
    ...extra,
  };
}

/** Kayıtlı `analysis_data` → karşılaştırılabilir değerler. Asla hata fırlatmaz, girdiyi değiştirmez. */
export function readLegacySnapshot(analysisData: unknown): LegacySnapshotRead {
  if (analysisData === null || analysisData === undefined) return emptyRead("no_snapshot");
  const o = rec(analysisData);
  if (!o) return emptyRead("invalid_snapshot");
  const version = finiteInt(o.version);
  if (o.version !== undefined && version !== 1) return emptyRead("unsupported_version", { version });
  const calc = rec(o.calc);
  const methodology = typeof calc?.methodology === "string" ? calc.methodology : null;
  const meta = {
    version,
    methodology,
    methodologyCurrent: methodology === null ? null : methodology === LEGACY_METHODOLOGY_KNOWN,
    stampedAt: typeof calc?.stampedAt === "string" ? calc.stampedAt : null,
    recalculatedFrom: typeof calc?.recalculatedFrom === "string" ? calc.recalculatedFrom : null,
  };
  const motor = rec(o.motor);
  if (!motor) return emptyRead("invalid_snapshot", { ...meta, stones: readStones(o) });

  const hayatYolu = readHayatYolu(motor);
  const ifade = readIfade(motor);
  const anaKulvar = readKulvar(motor, "anaKulvar");
  const yanKulvar = readKulvar(motor, "yanKulvar");
  const anyCore = [hayatYolu, ifade, anaKulvar, yanKulvar].some((r) => r.ok);
  return {
    ok: anyCore,
    reason: anyCore ? null : "invalid_snapshot",
    ...meta,
    hayatYolu,
    ifade,
    anaKulvar,
    yanKulvar,
    dogumGunu: NOT_IN_SNAPSHOT,
    olgunluk: NOT_IN_SNAPSHOT,
    kisiselYil: NOT_IN_SNAPSHOT,
    kisiselAy: NOT_IN_SNAPSHOT,
    kisiselGun: NOT_IN_SNAPSHOT,
    zirve: readZirve(motor),
    mucadele: readMucadele(motor),
    karmik: { markers: karmicMarkers(motor), available: anaKulvar.ok || yanKulvar.ok },
    presentOnlyLegacy: presentOnlyLegacy(motor),
    stones: readStones(o),
  };
}
