// HD-UZMAN-01 — Merkez durumu sınıflandırması: Tanımlı / Tanımsız / Açık (SAF, deterministik).
//
// Human Design'da tanımsız merkez iki ayrı durumdur:
//   • Tanımsız (Undefined)       — merkez tanımlı değil, ama en az bir AKTİF kapısı var.
//   • Açık (Completely Open)     — merkez tanımlı değil ve HİÇ aktif kapısı yok.
// Kullanıcıya yalnız "Tanımlı" / "Tanımsız" / "Açık" yazılır ("Tamamen Açık" yazılmaz).
//
// TEK KURAL: Durum yalnız KANITLA verilir. Eksik / bozuk / çelişkili veri boş kapı listesi
// SAYILMAZ → "unverified" ("Doğrulanamadı"). Bu dördüncü bir HD merkez kategorisi DEĞİLDİR;
// yalnız güvenlik durumudur. Eksik veriden ASLA kendiliğinden "Açık" üretilmez.
//
// Kanıt kaynakları (yeni Roxy çağrısı YOK, hesap motoru YOK — yalnız engine/channels topolojisi):
//   1) Kayıtlı 26 gezegensel aktivasyon (13 Personality + 13 Design, her gezegen tam bir kez):
//      aktif kapılar → tanımlı kanallar → tanımlı merkezler türetilir ve kayıtlı tanımlı merkez /
//      kanal / kapı listeleriyle BİREBİR örtüşmelidir. Örtüşürse her merkezin aktif kapıları kesindir.
//   2) Sağlayıcının (Roxy) kayıtlı `centers[]` yanıtı varsa çapraz denetim: `defined` ve `gates`
//      aktivasyonlardan türetilenle aynı olmalı. Alan hiç yoksa (eski/kısmi yanıt) denetim atlanır;
//      alan VAR ama null / dizi değil / geçersiz kapı → o merkez "unverified".
//   3) Aktivasyon yoksa (manuel / kısmi kayıt): tanımlı merkez uzman beyanıdır → Tanımlı. Tanımlı
//      olmayan merkezde beyan edilmiş aktif kapı varsa → Tanımsız (pozitif kanıt). Hiç kapı yoksa
//      kapı listesinin eksiksiz olduğu kanıtlanamaz → "unverified" (Açık TAHMİN EDİLMEZ).

import { GATE_CENTER, getActiveGates, getDefinedCenters, getDefinedChannels, type CenterName } from "../engine/channels";
import { HUMAN_DESIGN_CENTERS } from "../constants";
import type { HdCenterCode } from "../types";
import { APP_CENTER_TO_ENGINE_CENTER, toAppCenterCode, toAppChannelCode, toAppGate } from "../normalize/hdAppCodes";

export type HdCenterState = "defined" | "undefined" | "open" | "unverified";

/** Kullanıcıya gösterilen Türkçe etiket. "open" → yalnız "Açık". */
export const HD_CENTER_STATE_LABEL: Readonly<Record<HdCenterState, string>> = {
  defined: "Tanımlı",
  undefined: "Tanımsız",
  open: "Açık",
  unverified: "Doğrulanamadı",
};

/** Profesyonel İngilizce karşılık (uygun yerlerde). "unverified" bir HD kategorisi değildir. */
export const HD_CENTER_STATE_EN: Readonly<Record<HdCenterState, string | null>> = {
  defined: "Defined",
  undefined: "Undefined",
  open: "Completely Open",
  unverified: null,
};

export type HdCenterStateEntry = {
  code: HdCenterCode;
  state: HdCenterState;
  /** Merkezdeki aktif kapılar (kanıtlı); doğrulanamadıysa null. */
  gates: number[] | null;
  /** "unverified" ise kısa teknik neden (kullanıcıya gösterilmez; test/teşhis için). */
  reason?: string;
};

export type HdCenterStates = Record<HdCenterCode, HdCenterStateEntry>;

export type HdCenterEvidence = "activations" | "declared" | "none";

export type HdCenterClassification = {
  states: HdCenterStates;
  /** Ana kanıt kaynağı: tam aktivasyon seti / uzman beyanı / hiçbiri. */
  evidence: HdCenterEvidence;
};

export const HD_CENTER_CODES: ReadonlyArray<HdCenterCode> = HUMAN_DESIGN_CENTERS.map((c) => c.code);

const ENGINE_TO_APP: Readonly<Record<CenterName, HdCenterCode>> = Object.fromEntries(
  (Object.entries(APP_CENTER_TO_ENGINE_CENTER) as Array<[HdCenterCode, string]>).map(([app, eng]) => [eng, app]),
) as Record<CenterName, HdCenterCode>;

/** Bir kapının merkezi (uygulama kodu) — engine/channels doğrulanmış 64 kapı tablosu. */
export function hdGateCenterCode(gate: number): HdCenterCode | null {
  const c = GATE_CENTER[gate];
  return c ? ENGINE_TO_APP[c] : null;
}

const PLANETS = [
  "Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
] as const;
const PLANET_SET = new Set<string>(PLANETS);

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sameNumSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).join(",") === [...b].sort((x, y) => x - y).join(",");
const sameStrSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/**
 * 26 aktivasyon eksiksiz ve geçerli mi? (13 Personality + 13 Design; her tarafta 13 gezegenin her biri
 * tam bir kez; kapı 1–64, çizgi 1–6). Değilse null — aktif kapı seti KESİN değildir.
 */
export function completeActivationGates(activations: unknown): number[] | null {
  if (!Array.isArray(activations) || activations.length !== 26) return null;
  const seen = { personality: new Set<string>(), design: new Set<string>() };
  const gates: number[] = [];
  for (const a of activations) {
    if (!isObj(a)) return null;
    const side = a.side;
    const body = typeof a.body === "string" ? a.body : typeof a.planet === "string" ? a.planet : null;
    if ((side !== "personality" && side !== "design") || !body || !PLANET_SET.has(body)) return null;
    if (!isInt(a.gate, 1, 64) || !isInt(a.line, 1, 6)) return null;
    if (seen[side].has(body)) return null;
    seen[side].add(body);
    gates.push(a.gate);
  }
  if (seen.personality.size !== 13 || seen.design.size !== 13) return null;
  return getActiveGates(gates.map((gate) => ({ gate })));
}

export type HdCenterClassifyInput = {
  /** Kayıtlı tanımlı merkezler (herhangi bir sözlükte; merkezi normalizasyonla çevrilir). */
  definedCenters: unknown;
  /** Kayıtlı tanımsız/açık merkezler (eski genel "open" listesi). */
  openCenters: unknown;
  /** Kayıtlı aktif kapılar (varsa). */
  gates?: unknown;
  /** Kayıtlı tanımlı kanallar (varsa). */
  channels?: unknown;
  /** Kayıtlı gezegensel aktivasyonlar (hesaplanmış haritalar). Yoksa beyan kuralı uygulanır. */
  activations?: unknown;
  /** Sağlayıcının kayıtlı `centers[]` yanıtı (Roxy). Yoksa çapraz denetim atlanır. */
  providerCenters?: unknown;
};

function codeList(v: unknown, fn: (x: unknown) => string | null): { ok: boolean; list: string[] } {
  if (v === undefined || v === null) return { ok: true, list: [] };
  if (!Array.isArray(v)) return { ok: false, list: [] };
  const list: string[] = [];
  for (const x of v) {
    const m = fn(x);
    if (m === null) return { ok: false, list: [] };
    if (!list.includes(m)) list.push(m);
  }
  return { ok: true, list };
}

function allUnverified(reason: string): HdCenterClassification {
  const states = {} as HdCenterStates;
  for (const code of HD_CENTER_CODES) states[code] = { code, state: "unverified", gates: null, reason };
  return { states, evidence: "none" };
}

/** Merkezi sınıflandırıcı — bütün yüzeyler (harita, kart, Bilgi Bankası, Sistem Yorumu, Word) bunu kullanır. */
export function classifyHdCenters(input: HdCenterClassifyInput): HdCenterClassification {
  const defined = codeList(input.definedCenters, toAppCenterCode);
  const open = codeList(input.openCenters, toAppCenterCode);
  if (!defined.ok || !open.ok) return allUnverified("merkez kimliği çözülemedi");
  const definedSet = new Set(defined.list as HdCenterCode[]);
  const openSet = new Set(open.list as HdCenterCode[]);

  const activeGates = input.activations === undefined || input.activations === null ? null : completeActivationGates(input.activations);
  if (activeGates) return classifyFromActivations(activeGates, definedSet, openSet, input);
  // Aktivasyon yok ya da eksik/bozuk (kısmi kayıt) → beyan kuralı: tanımlı merkez ve beyan edilmiş
  // kapı kanıt sayılır; Açık asla tahmin edilmez.
  return classifyFromDeclaration(definedSet, openSet, input);
}

function classifyFromActivations(
  activeGates: number[],
  definedSet: Set<HdCenterCode>,
  openSet: Set<HdCenterCode>,
  input: HdCenterClassifyInput,
): HdCenterClassification {
  // Topoloji: aktivasyonlardan türetilen tanımlı merkezler kayıtla BİREBİR örtüşmeli.
  const derivedChannels = getDefinedChannels(activeGates);
  const derivedDefined = getDefinedCenters(derivedChannels).map((c) => ENGINE_TO_APP[c]);
  if (!sameStrSet(derivedDefined, [...definedSet])) return allUnverified("tanımlı merkez ↔ aktivasyon uyuşmazlığı");
  for (const c of openSet) if (definedSet.has(c)) return allUnverified("merkez hem tanımlı hem açık");
  // Kayıtlı açık liste tanımlıların tümleyeni olmalı (eksik merkez = çelişki).
  const complement = HD_CENTER_CODES.filter((c) => !definedSet.has(c));
  if (!sameStrSet(complement, [...openSet])) return allUnverified("eksik ya da fazla merkez");
  if (input.channels !== undefined && input.channels !== null) {
    const ch = codeList(input.channels, (x) => toAppChannelCode(x));
    if (!ch.ok || !sameStrSet(ch.list, derivedChannels.map((c) => c.id))) return allUnverified("tanımlı kanal uyuşmazlığı");
  }
  if (input.gates !== undefined && input.gates !== null) {
    const g = codeList(input.gates, (x) => {
      const n = toAppGate(x);
      return n === null ? null : String(n);
    });
    if (!g.ok || !sameNumSet(g.list.map(Number), activeGates)) return allUnverified("aktif kapı uyuşmazlığı");
  }

  const gatesByCenter = new Map<HdCenterCode, number[]>(HD_CENTER_CODES.map((c) => [c, []]));
  for (const gate of activeGates) {
    const c = hdGateCenterCode(gate);
    if (!c) return allUnverified(`kapı merkezi yok: ${gate}`);
    gatesByCenter.get(c)!.push(gate);
  }

  const provider = providerCenterMap(input.providerCenters);
  if (provider === "invalid") return allUnverified("sağlayıcı merkez listesi bozuk");

  const states = {} as HdCenterStates;
  for (const code of HD_CENTER_CODES) {
    const gates = gatesByCenter.get(code)!;
    const isDefined = definedSet.has(code);
    const p = provider?.get(code);
    if (provider && !p) {
      states[code] = { code, state: "unverified", gates: null, reason: "sağlayıcıda merkez eksik" };
      continue;
    }
    if (p) {
      if (p.defined !== isDefined) {
        states[code] = { code, state: "unverified", gates: null, reason: "sağlayıcı defined uyuşmazlığı" };
        continue;
      }
      if (p.gates === "invalid") {
        states[code] = { code, state: "unverified", gates: null, reason: "sağlayıcı kapı listesi bozuk" };
        continue;
      }
      if (p.gates !== "absent" && !sameNumSet(p.gates, gates)) {
        states[code] = { code, state: "unverified", gates: null, reason: "sağlayıcı kapı ↔ aktivasyon uyuşmazlığı" };
        continue;
      }
    }
    states[code] = { code, state: isDefined ? "defined" : gates.length > 0 ? "undefined" : "open", gates };
  }
  return { states, evidence: "activations" };
}

type ProviderCenter = { defined: boolean; gates: number[] | "absent" | "invalid" };

/** Sağlayıcı merkezleri. undefined/null → denetim yok (null); yapısal bozukluk → "invalid". */
function providerCenterMap(raw: unknown): Map<HdCenterCode, ProviderCenter> | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 9) return "invalid";
  const map = new Map<HdCenterCode, ProviderCenter>();
  for (const c of raw) {
    if (!isObj(c) || typeof c.defined !== "boolean") return "invalid";
    // Kimlik katı: id çözülmeli; ad da çözülüyorsa aynı merkezi göstermeli (kimlik uyuşmazlığı = bozuk).
    const code = toAppCenterCode(c.id);
    const byName = toAppCenterCode(c.name);
    if (!code || map.has(code) || (byName !== null && byName !== code)) return "invalid";
    let gates: ProviderCenter["gates"];
    if (!("gates" in c) || c.gates === undefined) gates = "absent";
    else if (!Array.isArray(c.gates)) gates = "invalid"; // null dahil — boş liste SAYILMAZ
    else if (!c.gates.every((n) => isInt(n, 1, 64) && hdGateCenterCode(n) === code)) gates = "invalid";
    else gates = getActiveGates((c.gates as number[]).map((gate) => ({ gate })));
    map.set(code, { defined: c.defined, gates });
  }
  return map;
}

function classifyFromDeclaration(
  definedSet: Set<HdCenterCode>,
  openSet: Set<HdCenterCode>,
  input: HdCenterClassifyInput,
): HdCenterClassification {
  // Beyan edilmiş kapılar: geçersiz değer → kapı kanıtı kullanılamaz (yalnız Tanımlı beyanı kalır).
  let declared: number[] | null = [];
  if (input.gates !== undefined && input.gates !== null) {
    if (!Array.isArray(input.gates)) declared = null;
    else {
      for (const x of input.gates) {
        const n = toAppGate(x);
        if (n === null) {
          declared = null;
          break;
        }
        if (!declared.includes(n)) declared.push(n);
      }
    }
  }
  // Beyan edilen kapılar bir kanalı tamamlıyorsa o kanalın merkezleri tanımsız/açık OLAMAZ.
  const channelDefined = new Set<HdCenterCode>(
    declared ? getDefinedCenters(getDefinedChannels(declared)).map((c) => ENGINE_TO_APP[c]) : [],
  );

  const states = {} as HdCenterStates;
  for (const code of HD_CENTER_CODES) {
    const inDefined = definedSet.has(code);
    const inOpen = openSet.has(code);
    if (inDefined && inOpen) {
      states[code] = { code, state: "unverified", gates: null, reason: "merkez hem tanımlı hem açık" };
    } else if (inDefined) {
      const gates = declared ? declared.filter((g) => hdGateCenterCode(g) === code) : null;
      states[code] = { code, state: "defined", gates };
    } else if (!inOpen) {
      states[code] = { code, state: "unverified", gates: null, reason: "merkez kayıtta yok" };
    } else if (!declared) {
      states[code] = { code, state: "unverified", gates: null, reason: "kapı listesi bozuk" };
    } else if (channelDefined.has(code)) {
      states[code] = { code, state: "unverified", gates: null, reason: "kanal ↔ açık merkez çelişkisi" };
    } else {
      const gates = declared.filter((g) => hdGateCenterCode(g) === code);
      states[code] =
        gates.length > 0
          ? { code, state: "undefined", gates }
          : { code, state: "unverified", gates: null, reason: "kapı listesinin eksiksizliği kanıtlanamadı" };
    }
  }
  return { states, evidence: definedSet.size + openSet.size > 0 ? "declared" : "none" };
}

/** Kayıtlı hesaplanmış harita (computed_result) + varsa sağlayıcı merkezleri → sınıflandırma. */
export function classifyComputedChartCenters(
  computed: unknown,
  providerCenters?: unknown,
): HdCenterClassification {
  if (!isObj(computed)) return allUnverified("hesaplanmış sonuç yok");
  const centers = isObj(computed.centers) ? computed.centers : null;
  const app = isObj(computed.appCodes) ? computed.appCodes : null;
  const channels = Array.isArray(computed.channels)
    ? computed.channels.map((c) => (isObj(c) && typeof c.id === "string" ? c.id : null))
    : undefined;
  return classifyHdCenters({
    definedCenters: app ? app.active_centers : centers?.defined,
    openCenters: app ? app.open_centers : centers?.open,
    gates: app ? app.gates : undefined,
    channels: app ? app.channels : channels,
    activations: computed.activations ?? null,
    providerCenters,
  });
}

/** Kayıtlı ham Roxy yanıtındaki `centers` alanı (yalnız okuma; yeni çağrı yok). */
export function providerCentersFromRaw(raw: unknown): unknown {
  return isObj(raw) ? raw.centers : undefined;
}

/**
 * Kayıtlı harita satırı (manuel ya da hesaplanmış) → sınıflandırma. Hesaplanmış satırda
 * computed_result kullanılır; manuel satırda skaler kolonlar beyan olarak değerlendirilir.
 */
export function classifyChartRowCenters(row: {
  source?: unknown;
  active_centers?: unknown;
  open_centers?: unknown;
  gates?: unknown;
  channels?: unknown;
  computed_result?: unknown;
}): HdCenterClassification {
  // Harita, Bilgi Bankası eşleşmesi ve Word AYNI kanıttan beslenir: kayıtlı computed_result.
  // (Sağlayıcı merkez kapıları yeni kayıtta alımda — normalize — zaten birebir doğrulanır.)
  if (row.source === "computed" && isObj(row.computed_result)) {
    return classifyComputedChartCenters(row.computed_result);
  }
  return classifyHdCenters({
    definedCenters: row.active_centers,
    openCenters: row.open_centers,
    gates: row.gates,
    channels: undefined,
  });
}

/** Merkez → durum (kısa harita). */
export function centerStateMap(c: HdCenterClassification): Record<HdCenterCode, HdCenterState> {
  const out = {} as Record<HdCenterCode, HdCenterState>;
  for (const code of HD_CENTER_CODES) out[code] = c.states[code].state;
  return out;
}

export function hdCenterStateLabel(state: HdCenterState): string {
  return HD_CENTER_STATE_LABEL[state];
}
