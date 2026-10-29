/**
 * Klasik Numeroloji · Karşılaştırma — HİZALAMA (SAF; istemci + sunucu güvenli; IO yok).
 *
 * alignRecords(mevcutAnlıkGörüntü | null, klasikSonuç | null) → kavram satırları.
 *   • İlişki (relation) YALNIZ mekanik hesaplanır: same_value | same_root | different | one_missing | not_comparable.
 *   • "same_value" yalnız iki sayı birebir aynıysa (11 ≠ 2; 19/10 ≠ 1).
 *   • Yorum metni ÜRETİLMEZ; açıklama yalnız sözlükteki sabit metindir. İki sayı tek sayıda BİRLEŞTİRİLMEZ.
 *   • Mevcut taraf kaydedildiği gibi okunur (legacyReader); Mevcut motor çalıştırılmaz.
 *   • Girdiler değiştirilmez.
 */
import type { ChartResult, NumberKind } from "../model";
import { compactStoneName } from "../stones/nameIndex";
import { canonicalSha256 } from "./hash";
import {
  COMPARE_GLOSSARY_VERSION,
  glossaryEntry,
  ONLY_CLASSIC,
  ONLY_LEGACY,
  type ComparableKind,
  type ConceptKey,
  type OnlyClassicKey,
  type OnlyLegacyKey,
} from "./glossary";
import { digitRoot, readLegacySnapshot, type LegacyMissingReason, type LegacyRead, type LegacySnapshotRead } from "./legacyReader";

export const COMPARE_ALIGN_VERSION = "num-compare-align-v1";

export type Relation = "same_value" | "same_root" | "different" | "one_missing" | "not_comparable";

export type ClassicMissingReason = "no_result" | "field_missing" | "not_requested";

export type LegacySide = {
  display: string;
  value: number | null;
  root: number | null;
  source: string;
  extra?: Record<string, unknown>;
};

export type ClassicSide = {
  value: number | null;
  type: NumberKind | null;
  karmicDebt: number | null;
  /** Rakam kökü (value'dan; mekanik). */
  root: number | null;
  source: string;
  extra?: Record<string, unknown>;
};

export type AlignRow = {
  conceptKey: ConceptKey;
  /** Zirve/mücadele için dönem sırası (Klasik sırası); diğerlerinde null. */
  position: number | null;
  labelTr: string;
  legacy: LegacySide | null;
  legacyMissingReason: LegacyMissingReason | null;
  classic: ClassicSide | null;
  classicMissingReason: ClassicMissingReason | null;
  relation: Relation;
  comparable: ComparableKind;
  sameNameDifferentFormula: boolean;
  /** Sözlükteki sabit uzman açıklaması (üretilmiş yorum DEĞİL). */
  explanation: string;
};

export type OnlySideItem<K extends string> = { key: K; labelTr: string; present: boolean };

export type StoneProvenanceClassic = {
  name: string;
  source: "classic_direct" | "classic_derived";
  stoneKey: string | null;
  methods: string[];
};

export type StoneAlignment = {
  legacyAssigned: { name: string; slot: string }[];
  classicDirect: { name: string; input: string; status: string; stoneKey: string | null }[];
  classicDerived: { name: string; stoneKey: string; methods: string[] }[];
  /** Her iki tarafta bulunan adlar (tam ad / boşluksuz ad eşitliği; kısmi eşleşme YOK). Köken korunur. */
  overlap: { nameLegacy: string; slots: string[]; classic: StoneProvenanceClassic[] }[];
};

export type Alignment = {
  version: typeof COMPARE_ALIGN_VERSION;
  glossaryVersion: typeof COMPARE_GLOSSARY_VERSION;
  rows: AlignRow[];
  onlyLegacy: OnlySideItem<OnlyLegacyKey>[];
  onlyClassic: OnlySideItem<OnlyClassicKey>[];
  stones: StoneAlignment;
  /** Hangi taraf eksik: "both" iki taraf da yoksa. */
  missing: "legacy" | "classic" | "both" | null;
  legacyMeta: {
    methodology: string | null;
    methodologyCurrent: boolean | null;
    stampedAt: string | null;
    recalculatedFrom: string | null;
    zirveFormat: LegacySnapshotRead["zirve"]["format"];
    mucadeleFormat: LegacySnapshotRead["mucadele"]["format"];
    reason: LegacyMissingReason | null;
  };
  sourceHashes: { legacy: string | null; classic: string | null };
};

/** Klasik tarafın girdi kapsayıcısı (kayıtlı klasik analiz sonuçları). Çıplak ChartResult da kabul edilir. */
export type ClassicCompareSource = {
  chart?: ChartResult | null;
  personalDay?: unknown;
  bridge?: unknown;
  chaldean?: unknown;
  businessName?: unknown;
  /** Doğaltaş eşleştirici çıktısı (StoneMatchResult). */
  stones?: unknown;
};

export type AlignOptions = Record<string, never>;

// ── yardımcılar ──────────────────────────────────────────────────────────────────────────────

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
const KINDS: readonly NumberKind[] = ["single", "master", "compound"];

function classicNumber(v: unknown, source: string): ClassicSide | null {
  const r = rec(v);
  if (!r) return null;
  const value = int(r.value);
  if (value === null) return null;
  const type = KINDS.includes(r.type as NumberKind) ? (r.type as NumberKind) : null;
  return { value, type, karmicDebt: int(r.karmicDebt), root: digitRoot(value), source };
}

function plainClassic(value: unknown, source: string, extra?: Record<string, unknown>): ClassicSide | null {
  const v = int(value);
  if (v === null) return null;
  return { value: v, type: "single", karmicDebt: null, root: digitRoot(v), source, ...(extra ? { extra } : {}) };
}

function legacySide(r: LegacyRead): LegacySide | null {
  if (!r.ok) return null;
  const v = r.value;
  return { display: v.display, value: v.value, root: v.root, source: v.source, ...(v.extra ? { extra: { ...v.extra } } : {}) };
}

/** Mekanik ilişki. Yorum yok. */
export function computeRelation(comparable: ComparableKind, legacy: LegacySide | null, classic: ClassicSide | null): Relation {
  if (!legacy || !classic) return "one_missing";
  if (comparable === "not_comparable") return "not_comparable";
  if (legacy.value !== null && classic.value !== null && legacy.value === classic.value) return "same_value";
  if (legacy.root !== null && classic.root !== null && legacy.root === classic.root) return "same_root";
  return "different";
}

function row(
  key: ConceptKey,
  position: number | null,
  legacyRead: LegacyRead,
  classic: ClassicSide | null,
  classicReason: ClassicMissingReason,
): AlignRow {
  const g = glossaryEntry(key);
  const legacy = legacySide(legacyRead);
  return {
    conceptKey: key,
    position,
    labelTr: position === null ? g.labelTr : `${g.labelTr} · ${position}.`,
    legacy,
    legacyMissingReason: legacyRead.ok ? null : legacyRead.reason,
    classic,
    classicMissingReason: classic ? null : classicReason,
    relation: computeRelation(g.comparable, legacy, classic),
    comparable: g.comparable,
    sameNameDifferentFormula: g.sameNameDifferentFormula,
    explanation: g.differenceTr,
  };
}

function normalizeClassic(classic: ClassicCompareSource | ChartResult | null | undefined): ClassicCompareSource | null {
  if (!classic) return null;
  const r = rec(classic);
  if (!r) return null;
  if (rec(r.core)) return { chart: classic as ChartResult };
  return classic as ClassicCompareSource;
}

function periodsOf(arr: unknown): Map<number, Record<string, unknown>> {
  const m = new Map<number, Record<string, unknown>>();
  if (!Array.isArray(arr)) return m;
  arr.forEach((p, i) => {
    const r = rec(p);
    if (!r) return;
    const pos = int(r.position) ?? i + 1;
    if (!m.has(pos)) m.set(pos, r);
  });
  return m;
}

function classicPeriod(r: Record<string, unknown> | undefined, source: string): ClassicSide | null {
  if (!r) return null;
  const extra: Record<string, unknown> = {};
  if (int(r.startAge) !== null) extra.startAge = r.startAge;
  if (r.endAge === null || int(r.endAge) !== null) extra.endAge = r.endAge;
  return plainClassic(r.number, source, extra);
}

// ── taşlar ────────────────────────────────────────────────────────────────────────────────

function alignStones(legacy: LegacySnapshotRead, classic: ClassicCompareSource | null): StoneAlignment {
  const legacyAssigned = legacy.stones.map((s) => ({ name: s.name, slot: s.slot }));
  const sm = rec(classic?.stones);
  const classicDirect: StoneAlignment["classicDirect"] = [];
  const classicDerived: StoneAlignment["classicDerived"] = [];
  if (sm) {
    for (const it of Array.isArray(sm.providerDirect) ? sm.providerDirect : []) {
      const r = rec(it);
      const input = str(r?.input);
      if (!r || !input) continue;
      classicDirect.push({ name: str(r.nameTr) ?? input, input, status: str(r.status) ?? "text_only", stoneKey: str(r.stoneKey) });
    }
    for (const it of Array.isArray(sm.suggestions) ? sm.suggestions : []) {
      const r = rec(it);
      const key = str(r?.stoneKey);
      const name = str(r?.nameTr);
      if (!r || !key || !name || r.primary === "provider_direct") continue;
      const methods = Array.isArray(r.reasons)
        ? [...new Set(r.reasons.map((x) => str(rec(x)?.method)).filter((x): x is string => !!x))]
        : [];
      classicDerived.push({ name, stoneKey: key, methods });
    }
  } else {
    // Eşleştirici çıktısı yoksa: klasik sonucun uğurlu taş adları (yalnız metin).
    const gems = rec(classic?.chart?.luckyAssociations)?.gemstones;
    for (const g of Array.isArray(gems) ? gems : []) {
      if (typeof g === "string" && g.trim()) classicDirect.push({ name: g.trim(), input: g.trim(), status: "text_only", stoneKey: null });
    }
  }

  const classicByKey = new Map<string, StoneProvenanceClassic[]>();
  const add = (k: string, p: StoneProvenanceClassic) => {
    if (!k) return;
    const list = classicByKey.get(k) ?? [];
    if (!list.some((x) => x.source === p.source && x.name === p.name && x.stoneKey === p.stoneKey)) list.push(p);
    classicByKey.set(k, list);
  };
  for (const d of classicDirect) {
    const p: StoneProvenanceClassic = { name: d.name, source: "classic_direct", stoneKey: d.stoneKey, methods: ["provider_direct"] };
    add(compactStoneName(d.name), p);
    add(compactStoneName(d.input), p);
  }
  for (const d of classicDerived) add(compactStoneName(d.name), { name: d.name, source: "classic_derived", stoneKey: d.stoneKey, methods: [...d.methods] });

  const overlapMap = new Map<string, StoneAlignment["overlap"][number]>();
  for (const s of legacyAssigned) {
    const k = compactStoneName(s.name);
    const hits = classicByKey.get(k);
    if (!k || !hits) continue;
    const cur = overlapMap.get(k);
    if (cur) {
      if (!cur.slots.includes(s.slot)) cur.slots.push(s.slot);
    } else overlapMap.set(k, { nameLegacy: s.name, slots: [s.slot], classic: hits.map((h) => ({ ...h, methods: [...h.methods] })) });
  }
  return { legacyAssigned, classicDirect, classicDerived, overlap: [...overlapMap.values()] };
}

// ── ana giriş ────────────────────────────────────────────────────────────────────────────

export function alignRecords(
  legacySnapshot: unknown | null,
  classicResult: ClassicCompareSource | ChartResult | null,
  _opts: AlignOptions = {},
): Alignment {
  void _opts;
  const L = readLegacySnapshot(legacySnapshot);
  const C = normalizeClassic(classicResult);
  const chart = rec(C?.chart);
  const core = rec(chart?.core);
  const cReason: ClassicMissingReason = chart ? "field_missing" : "no_result";
  const rows: AlignRow[] = [];

  rows.push(row("hayat_yolu", null, L.hayatYolu, classicNumber(core?.lifePath, "core.lifePath"), cReason));
  rows.push(row("ifade", null, L.ifade, classicNumber(core?.expression, "core.expression"), cReason));
  rows.push(row("ana_kulvar", null, L.anaKulvar, classicNumber(core?.soulUrge, "core.soulUrge"), cReason));
  rows.push(row("yan_kulvar", null, L.yanKulvar, classicNumber(core?.personality, "core.personality"), cReason));
  rows.push(row("dogum_gunu", null, L.dogumGunu, classicNumber(core?.birthDay, "core.birthDay"), cReason));
  rows.push(row("olgunluk", null, L.olgunluk, classicNumber(core?.maturity, "core.maturity"), cReason));

  // Zirveler
  const cPin = periodsOf(chart?.pinnacles);
  const lPin = new Map(L.zirve.periods.map((p) => [p.position, p.read]));
  const pinPositions = [...new Set([...lPin.keys(), ...cPin.keys(), 1, 2, 3, 4])].sort((a, b) => a - b);
  const zirveMissing: LegacyRead = { ok: false, reason: L.zirve.reason ?? "field_missing" };
  for (const pos of pinPositions) {
    rows.push(row("zirve", pos, lPin.get(pos) ?? zirveMissing, classicPeriod(cPin.get(pos), `pinnacles[${pos}]`), cReason));
  }

  // Mücadele / Zorluklar (formül eşlemesi legacyReader'da)
  const cCh = periodsOf(chart?.challenges);
  const lCh = new Map(L.mucadele.periods.map((p) => [p.position, p.read]));
  const chPositions = [...new Set([...lCh.keys(), ...cCh.keys(), 1, 2, 3, 4])].sort((a, b) => a - b);
  const mucMissing: LegacyRead = { ok: false, reason: L.mucadele.reason ?? "field_missing" };
  for (const pos of chPositions) {
    rows.push(row("mucadele", pos, lCh.get(pos) ?? mucMissing, classicPeriod(cCh.get(pos), `challenges[${pos}]`), cReason));
  }

  // Zamanlama
  const py = rec(chart?.personalYear);
  rows.push(row("kisisel_yil", null, L.kisiselYil, plainClassic(py?.personalYear, "personalYear.personalYear"), cReason));
  rows.push(row("kisisel_ay", null, L.kisiselAy, plainClassic(rec(py?.personalMonth)?.personalMonth, "personalYear.personalMonth"), cReason));
  const pd = rec(C?.personalDay);
  const pdTarget = str(pd?.targetDate);
  rows.push(
    row(
      "kisisel_gun",
      null,
      L.kisiselGun,
      plainClassic(pd?.personalDay, "personal_day.personalDay", pdTarget ? { targetDate: pdTarget } : undefined),
      C?.personalDay === undefined ? (C ? "not_requested" : "no_result") : "field_missing",
    ),
  );

  // Karmik (karşılaştırılamaz; yan yana)
  const karmikLegacy: LegacyRead = L.karmik.available
    ? {
        ok: true,
        value: {
          display: L.karmik.markers.length > 0 ? "19" : "—",
          value: L.karmik.markers.length > 0 ? 19 : null,
          root: null,
          source: "motor.anaKulvar|motor.yanKulvar",
          extra: { markers: L.karmik.markers.map((m) => ({ ...m })) },
        },
      }
    : { ok: false, reason: L.anaKulvar.ok ? "field_missing" : (L.anaKulvar as { reason: LegacyMissingReason }).reason };
  const kd = rec(chart?.karmicDebt);
  const kl = rec(chart?.karmicLessons);
  const intList = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => int(n) !== null) : []);
  const karmikClassic: ClassicSide | null =
    kd || kl
      ? {
          value: null,
          type: null,
          karmicDebt: null,
          root: null,
          source: "karmicDebt|karmicLessons",
          extra: { debtNumbers: intList(kd?.debtNumbers), missingNumbers: intList(kl?.missingNumbers) },
        }
      : null;
  rows.push(row("karmik", null, karmikLegacy, karmikClassic, cReason));

  // Yalnız bir ekolde olanlar
  const onlyLegacy = ONLY_LEGACY.map((e) => ({ key: e.key, labelTr: e.labelTr, present: L.presentOnlyLegacy.includes(e.key) }));
  const has = (v: unknown) => v !== undefined && v !== null;
  const classicPresence: Record<OnlyClassicKey, boolean> = {
    karmik_dersler: has(chart?.karmicLessons),
    kopru_sayilari: has(C?.bridge),
    gizli_tutku: has(chart?.hiddenPassion),
    bilincalti: has(chart?.subconsciousSelf),
    isim_harfleri: has(chart?.nameLetters),
    dogum_gunu_profili: has(chart?.birthDayProfile),
    kalde_bilesik: has(C?.chaldean),
    ugurlu_iliskiler: has(chart?.luckyAssociations),
    isletme_adi_kalde: has(C?.businessName),
  };
  const onlyClassic = ONLY_CLASSIC.map((e) => ({ key: e.key, labelTr: e.labelTr, present: classicPresence[e.key] }));

  const legacyMissing = !L.ok;
  const classicMissing = !chart;
  return {
    version: COMPARE_ALIGN_VERSION,
    glossaryVersion: COMPARE_GLOSSARY_VERSION,
    rows,
    onlyLegacy,
    onlyClassic,
    stones: alignStones(L, C),
    missing: legacyMissing && classicMissing ? "both" : legacyMissing ? "legacy" : classicMissing ? "classic" : null,
    legacyMeta: {
      methodology: L.methodology,
      methodologyCurrent: L.methodologyCurrent,
      stampedAt: L.stampedAt,
      recalculatedFrom: L.recalculatedFrom,
      zirveFormat: L.zirve.format,
      mucadeleFormat: L.mucadele.format,
      reason: L.reason,
    },
    sourceHashes: {
      legacy: legacySnapshot === null || legacySnapshot === undefined ? null : canonicalSha256(legacySnapshot),
      classic: C ? canonicalSha256(classicResult) : null,
    },
  };
}

// ── not anlık görüntüsü ──────────────────────────────────────────────────────────────────────

export const NOTE_SNAPSHOT_SCHEMA = "num-compare-note-v1";

export type NoteSnapshotRow = {
  k: ConceptKey;
  p: number | null;
  l: { d: string; v: number | null; r: number | null } | null;
  c: { v: number | null; t: NumberKind | null; kd: number | null } | null;
  rel: Relation;
};

export type NoteSnapshot = {
  schema: typeof NOTE_SNAPSHOT_SCHEMA;
  alignVersion: string;
  glossaryVersion: string;
  missing: Alignment["missing"];
  legacyMethodology: string | null;
  sourceHashes: { legacy: string | null; classic: string | null };
  rows: NoteSnapshotRow[];
  stones: { legacy: string[]; classicDirect: string[]; classicDerived: string[]; overlap: string[] };
  /** Satırların kanonik özeti (bütünlük). */
  rowsHash: string;
};

/** Uzman notuyla saklanacak kompakt anlık görüntü (numerology_comparative_notes.snapshot). Yorum içermez. */
export function buildNoteSnapshot(a: Alignment): NoteSnapshot {
  const rows: NoteSnapshotRow[] = a.rows.map((r) => ({
    k: r.conceptKey,
    p: r.position,
    l: r.legacy ? { d: r.legacy.display, v: r.legacy.value, r: r.legacy.root } : null,
    c: r.classic ? { v: r.classic.value, t: r.classic.type, kd: r.classic.karmicDebt } : null,
    rel: r.relation,
  }));
  return {
    schema: NOTE_SNAPSHOT_SCHEMA,
    alignVersion: a.version,
    glossaryVersion: a.glossaryVersion,
    missing: a.missing,
    legacyMethodology: a.legacyMeta.methodology,
    sourceHashes: { ...a.sourceHashes },
    rows,
    stones: {
      legacy: a.stones.legacyAssigned.map((s) => `${s.slot}:${s.name}`),
      classicDirect: a.stones.classicDirect.map((s) => s.name),
      classicDerived: a.stones.classicDerived.map((s) => s.name),
      overlap: a.stones.overlap.map((s) => s.nameLegacy),
    },
    rowsHash: canonicalSha256(rows),
  };
}
