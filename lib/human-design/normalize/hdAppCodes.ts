// HD — MERKEZİ DEĞER NORMALİZASYONU (SAF, deterministik, yan etkisiz).
//
// NEDEN: Aynı Human Design kavramı üç farklı sözlükte yaşar:
//   • Manuel/uygulama kodları (lib/human-design/constants.ts): "generator", "2_4", "split",
//     "solar_plexus", "g_identity", "heart_ego" … → uzman Bilgi Bankası kodları bunlardan türer
//     (tip_{code}, profil_{code}, tanim_{code}, merkez_tanimli_{code} …).
//   • Dahili motor RAW değerleri (eski computed kayıtlar): "Generator", "2/4", "split-small",
//     "SolarPlexus", "G", "Heart".
//   • RoxyAPI değerleri: "Generator", "2/4", "Split", "solar-plexus" / "Solar Plexus", "g" / "G Center".
//
// TEK KURAL: sağlayıcı/motor değerleri uygulamanın HİÇBİR yerinde ayrı ayrı dönüştürülmez —
// yalnız bu modül üzerinden manuel/uygulama koduna çevrilir. Bilinmeyen değer SESSİZCE
// atlanmaz / tahmin edilmez → `null` döner (çağıran fail-closed karar verir).
//
// Bu modül hiçbir motor/hesap içermez; yalnız sözlük eşlemesi yapar.

import {
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_PROFILES,
  HUMAN_DESIGN_TYPES,
} from "../constants";
import type {
  HdAuthorityCode,
  HdCenterCode,
  HdChannelCode,
  HdProfileCode,
  HdTypeCode,
} from "../types";

/**
 * Uygulama tanım kodu. Manuel sözlükteki 4 değer + "none" (Tanımsız — Reflector).
 * "none" manuel açılır listede YOKTUR (manuel akış değişmez); yalnız hesaplanmış
 * haritalarda sessiz veri kaybını önlemek için taşınır.
 */
export type HdAppDefinitionCode = (typeof HUMAN_DESIGN_DEFINITIONS)[number]["code"] | "none";

/** Karşılaştırma anahtarı: büyük/küçük harf, boşluk, tire, alt çizgi duyarsız. */
function key(v: string): string {
  return v.trim().toLowerCase().replace(/[\s_\-]+/g, "");
}

const TYPE_CODES = new Set<string>(HUMAN_DESIGN_TYPES.map((t) => t.code));
const AUTHORITY_CODES = new Set<string>(HUMAN_DESIGN_AUTHORITIES.map((a) => a.code));
const PROFILE_CODES = new Set<string>(HUMAN_DESIGN_PROFILES.map((p) => p.code));
const CENTER_CODES = new Set<string>(HUMAN_DESIGN_CENTERS.map((c) => c.code));
const CHANNEL_CODES = new Set<string>(HUMAN_DESIGN_CHANNELS.map((c) => c.code));

// ── Tip ─────────────────────────────────────────────────────────────────────
const TYPE_ALIASES: Readonly<Record<string, HdTypeCode>> = {
  generator: "generator",
  puregenerator: "generator",
  manifestinggenerator: "manifesting_generator",
  manifestor: "manifestor",
  projector: "projector",
  reflector: "reflector",
};

export function toAppTypeCode(raw: unknown): HdTypeCode | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (TYPE_CODES.has(raw.trim())) return raw.trim() as HdTypeCode;
  return TYPE_ALIASES[key(raw)] ?? null;
}

// ── Otorite ─────────────────────────────────────────────────────────────────
const AUTHORITY_ALIASES: Readonly<Record<string, HdAuthorityCode>> = {
  emotional: "emotional",
  solarplexus: "emotional",
  sacral: "sacral",
  splenic: "splenic",
  spleen: "splenic",
  ego: "ego_heart",
  egoheart: "ego_heart",
  heart: "ego_heart",
  egomanifested: "ego_heart",
  egoprojected: "ego_heart",
  selfprojected: "self_projected",
  mental: "mental_environmental",
  environmental: "mental_environmental",
  mentalenvironmental: "mental_environmental",
  lunar: "lunar",
};

export function toAppAuthorityCode(raw: unknown): HdAuthorityCode | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (AUTHORITY_CODES.has(raw.trim())) return raw.trim() as HdAuthorityCode;
  return AUTHORITY_ALIASES[key(raw)] ?? null;
}

// ── Profil ("2/4" | "2_4" | "2 / 4") ───────────────────────────────────────
export function toAppProfileCode(raw: unknown): HdProfileCode | null {
  if (typeof raw !== "string") return null;
  const m = /^\s*([1-6])\s*[/_\-]\s*([1-6])\s*$/.exec(raw);
  if (!m) return null;
  const code = `${m[1]}_${m[2]}`;
  return PROFILE_CODES.has(code) ? (code as HdProfileCode) : null;
}

// ── Tanım ───────────────────────────────────────────────────────────────────
// NOT: Motorun "split-small"/"split-large" değerleri uygulamada "split"e iner (manuel
// sözlükte alt ayrım yok). Ham değer çağıranın computed_result'ında KORUNUR — bu yalnız
// uygulama/Bilgi Bankası kodudur. RoxyAPI yalnız "Split" döndürür → small/large TAHMİN EDİLMEZ.
const DEFINITION_ALIASES: Readonly<Record<string, HdAppDefinitionCode>> = {
  none: "none",
  nodefinition: "none",
  single: "single",
  singledefinition: "single",
  split: "split",
  splitdefinition: "split",
  splitsmall: "split",
  splitlarge: "split",
  smallsplit: "split",
  largesplit: "split",
  triplesplit: "triple_split",
  triplesplitdefinition: "triple_split",
  quadruplesplit: "quadruple_split",
  quadsplit: "quadruple_split",
};

export function toAppDefinitionCode(raw: unknown): HdAppDefinitionCode | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = raw.trim();
  if (t === "none" || HUMAN_DESIGN_DEFINITIONS.some((d) => d.code === t)) return t as HdAppDefinitionCode;
  return DEFINITION_ALIASES[key(raw)] ?? null;
}

// ── Merkez ──────────────────────────────────────────────────────────────────
const CENTER_ALIASES: Readonly<Record<string, HdCenterCode>> = {
  head: "head",
  ajna: "ajna",
  throat: "throat",
  g: "g_identity",
  gcenter: "g_identity",
  identity: "g_identity",
  gidentity: "g_identity",
  heart: "heart_ego",
  ego: "heart_ego",
  will: "heart_ego",
  heartego: "heart_ego",
  solarplexus: "solar_plexus",
  emotional: "solar_plexus",
  sacral: "sacral",
  spleen: "spleen",
  splenic: "spleen",
  root: "root",
};

export function toAppCenterCode(raw: unknown): HdCenterCode | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (CENTER_CODES.has(raw.trim())) return raw.trim() as HdCenterCode;
  return CENTER_ALIASES[key(raw)] ?? null;
}

/** Uygulama merkez kodu → dahili motor/BodyGraph merkez adı (topoloji karşılaştırması için). */
export const APP_CENTER_TO_ENGINE_CENTER: Readonly<Record<HdCenterCode, string>> = {
  head: "Head",
  ajna: "Ajna",
  throat: "Throat",
  g_identity: "G",
  heart_ego: "Heart",
  solar_plexus: "SolarPlexus",
  sacral: "Sacral",
  spleen: "Spleen",
  root: "Root",
};

// ── Kapı / Kanal ────────────────────────────────────────────────────────────
export function toAppGate(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 64 ? n : null;
}

/**
 * İki kapıdan (sırasız) resmi kanal kodu "küçük-büyük" ("43","23" → "23-43").
 * Yalnız resmi 36 kanaldan biriyse döner; aksi null.
 */
export function toAppChannelCode(a: unknown, b?: unknown): HdChannelCode | null {
  let ga: number | null;
  let gb: number | null;
  if (b === undefined && typeof a === "string") {
    const m = /^\s*(\d{1,2})\s*[-_]\s*(\d{1,2})\s*$/.exec(a);
    if (!m) return null;
    ga = toAppGate(Number(m[1]));
    gb = toAppGate(Number(m[2]));
  } else {
    ga = toAppGate(a);
    gb = toAppGate(b);
  }
  if (ga === null || gb === null || ga === gb) return null;
  const code = `${Math.min(ga, gb)}-${Math.max(ga, gb)}`;
  return CHANNEL_CODES.has(code) ? (code as HdChannelCode) : null;
}

// ── Toplu: bir haritanın uygulama kodları ──────────────────────────────────

/** Uzman Bilgi Bankası eşleştirmesi için tek tip, uygulama-kodlu harita özeti. */
export type HdAppChartCodes = {
  type_code: HdTypeCode | null;
  authority_code: HdAuthorityCode | null;
  profile_code: HdProfileCode | null;
  definition_code: HdAppDefinitionCode | null;
  active_centers: HdCenterCode[];
  open_centers: HdCenterCode[];
  gates: number[];
  channels: HdChannelCode[];
};

/** Kayıtlı (manuel / eski motor / Roxy) skaler kolonlarını uygulama koduna çevirir. */
export type StoredChartScalars = {
  type_code?: unknown;
  authority_code?: unknown;
  profile_code?: unknown;
  definition_code?: unknown;
  active_centers?: unknown;
  open_centers?: unknown;
  gates?: unknown;
  channels?: unknown;
};

function mapList<T>(v: unknown, fn: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    const m = fn(x);
    if (m !== null && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Herhangi bir kaynaktan gelen skaler harita değerlerini uygulama kodlarına çevirir.
 * Manuel kodlar olduğu gibi geçer (idempotent) → manuel haritalarda davranış DEĞİŞMEZ.
 */
export function toAppChartCodes(chart: StoredChartScalars): HdAppChartCodes {
  return {
    type_code: toAppTypeCode(chart.type_code),
    authority_code: toAppAuthorityCode(chart.authority_code),
    profile_code: toAppProfileCode(chart.profile_code),
    definition_code: toAppDefinitionCode(chart.definition_code),
    active_centers: mapList(chart.active_centers, toAppCenterCode),
    open_centers: mapList(chart.open_centers, toAppCenterCode),
    gates: mapList(chart.gates, toAppGate).sort((a, b) => a - b),
    channels: mapList(chart.channels, (c) => toAppChannelCode(c)),
  };
}

/**
 * Uzman Bilgi Bankası kodları (human_design_knowledge_records.code) —
 * rapor-olustur/helpers/hdRapor.ts buildCodesFromChart ile BİREBİR aynı biçim:
 *   tip_{code} otorite_{code} profil_{code} tanim_{code}
 *   merkez_tanimli_{code} merkez_acik_{code} kanal_{a_b} kapi_{n}
 */
export function buildExpertKnowledgeCodes(codes: HdAppChartCodes): string[] {
  const out: string[] = [];
  if (codes.type_code) out.push(`tip_${codes.type_code}`);
  if (codes.authority_code) out.push(`otorite_${codes.authority_code}`);
  if (codes.profile_code) out.push(`profil_${codes.profile_code}`);
  if (codes.definition_code) out.push(`tanim_${codes.definition_code}`);
  for (const c of codes.active_centers) out.push(`merkez_tanimli_${c}`);
  for (const c of codes.open_centers) out.push(`merkez_acik_${c}`);
  for (const ch of codes.channels) out.push(`kanal_${ch.replace(/-/g, "_")}`);
  for (const g of codes.gates) out.push(`kapi_${g}`);
  return [...new Set(out)];
}
