/**
 * HD MANUEL HARİTA — TUTARLILIK UYARILARI + KOD ALLOW-LIST DOĞRULAMASI (SAF)
 * ==========================================================================
 *
 * Manuel harita kaydı (dış sitede hesaplanıp elle işaretlenen değerler) KORUNUR;
 * bu modül otomatik hesap YAPMAZ ve kaydı ASLA engellemez. Yalnız girilen alanların
 * birbiriyle çelişip çelişmediğini tespit eder → UI'da amber "Tutarsızlık uyarıları"
 * paneli + kaydederken engellemeyen onay.
 *
 * Motor (lib/human-design/engine/**) YALNIZ import edilir (saf graf fonksiyonları);
 * motor dosyalarında hiçbir değişiklik YOKTUR. DB/ağ/React YOK → client + server güvenli.
 *
 * Sunucu tarafı yalnız `validateManualChartCodes` ile allow-list uygular: bilinmeyen
 * kod → 400. Tutarsızlık sunucuda da ASLA engel değildir.
 */

import {
  CHANNELS,
  getDefinedCenters,
  getDefinedChannels,
  type CenterName,
  type Channel,
} from "@/lib/human-design/engine/channels";
import { computeDefinition, type DefinitionKind } from "@/lib/human-design/engine/definition";
import { computeTypeAndAuthority, type HdAuthority, type HdType } from "@/lib/human-design/engine/type-authority";
import {
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_PROFILES,
  HUMAN_DESIGN_TYPES,
} from "@/lib/human-design/constants";

// ── Form kodu ↔ motor adı haritaları ───────────────────────────────────────────

export const FORM_CENTER_TO_ENGINE: Readonly<Record<string, CenterName>> = {
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

const ENGINE_CENTER_TO_FORM: Readonly<Record<CenterName, string>> = Object.fromEntries(
  Object.entries(FORM_CENTER_TO_ENGINE).map(([form, engine]) => [engine, form]),
) as Record<CenterName, string>;

const ENGINE_TYPE_TO_FORM: Readonly<Record<HdType, string>> = {
  Generator: "generator",
  "Manifesting Generator": "manifesting_generator",
  Manifestor: "manifestor",
  Projector: "projector",
  Reflector: "reflector",
};

const ENGINE_AUTHORITY_TO_FORM: Readonly<Record<HdAuthority, string>> = {
  Emotional: "emotional",
  Sacral: "sacral",
  Splenic: "splenic",
  Ego: "ego_heart",
  "Self-Projected": "self_projected",
  Mental: "mental_environmental",
  Lunar: "lunar",
};

/** Motor tanım türü → form tanım kodu ("none" → tanım yok). */
const ENGINE_DEFINITION_TO_FORM: Readonly<Record<DefinitionKind, string | null>> = {
  none: null,
  single: "single",
  "split-small": "split",
  "split-large": "split",
  "triple-split": "triple_split",
  "quad-split": "quadruple_split",
};

const TYPE_LABEL = new Map<string, string>(HUMAN_DESIGN_TYPES.map((t) => [t.code, t.label]));
const AUTHORITY_LABEL = new Map<string, string>(HUMAN_DESIGN_AUTHORITIES.map((a) => [a.code, a.label]));
const DEFINITION_LABEL = new Map<string, string>(HUMAN_DESIGN_DEFINITIONS.map((d) => [d.code, d.label]));
const CENTER_LABEL = new Map<string, string>(HUMAN_DESIGN_CENTERS.map((c) => [c.code, c.label]));

const CHANNEL_BY_ID: ReadonlyMap<string, Channel> = new Map(CHANNELS.map((c) => [c.id, c]));

// ── Girdi / çıktı tipleri ─────────────────────────────────────────────────────

export type ManualChartInput = {
  type_code?: string | null;
  authority_code?: string | null;
  profile_code?: string | null;
  definition_code?: string | null;
  active_centers?: readonly string[] | null;
  open_centers?: readonly string[] | null;
  gates?: readonly number[] | null;
  channels?: readonly string[] | null;
};

export type ConsistencyField = "type" | "authority" | "definition" | "centers" | "channels" | "gates";

export type ConsistencyWarning = {
  /** Stabil makine kodu (test/analitik). */
  code: string;
  field: ConsistencyField;
  /** Kullanıcıya gösterilecek sade Türkçe açıklama. */
  message: string;
};

function lbl(map: Map<string, string>, code: string): string {
  return map.get(code) ?? code;
}

function uniq<T>(xs: readonly T[]): T[] {
  return Array.from(new Set(xs));
}

/** Kanal kodlarından (form "a-b") motor Channel'ları (bilinmeyen kod atlanır). */
function channelsFromCodes(codes: readonly string[]): Channel[] {
  const out: Channel[] = [];
  for (const code of codes) {
    const ch = CHANNEL_BY_ID.get(code);
    if (ch) out.push(ch);
  }
  return out;
}

/** Tanımlı merkezler + kanallar → motor→Boğaz bağlantısı (motor saf fonksiyonları). */
function motorToThroatFromChannels(channels: readonly Channel[]): boolean {
  const centers = getDefinedCenters(channels);
  const gates = uniq(channels.flatMap((c) => [c.gateA, c.gateB]));
  const def = computeDefinition(centers, channels, gates);
  return computeTypeAndAuthority(centers, def.components).motorToThroat;
}

/** Otorite hiyerarşisinin (motor ile birebir) tanımlı merkezlerden beklenen sonucu. */
function expectedAuthorityFromCenters(activeEngineCenters: readonly CenterName[]): string {
  // computeTypeAndAuthority'nin otorite dalı yalnız tanımlı merkez kümesine bağlıdır.
  return ENGINE_AUTHORITY_TO_FORM[computeTypeAndAuthority(activeEngineCenters, []).authority];
}

/** Tipe göre HD'de mümkün olan otoriteler (merkez bilgisi olmadan da uygulanabilir). */
const ALLOWED_AUTHORITIES_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  generator: ["sacral", "emotional"],
  manifesting_generator: ["sacral", "emotional"],
  manifestor: ["emotional", "splenic", "ego_heart"],
  projector: ["emotional", "splenic", "ego_heart", "self_projected", "mental_environmental"],
  reflector: ["lunar"],
};

/**
 * SAF: manuel harita alanları arasındaki tutarsızlıkları listeler. Boş/eksik alanlar
 * uyarı üretmez (kısmi giriş normaldir). Sonuç yalnız UYARIDIR; kayıt engellenmez.
 */
export function checkManualChartConsistency(input: ManualChartInput): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  const push = (w: ConsistencyWarning) => {
    if (!warnings.some((x) => x.code === w.code && x.message === w.message)) warnings.push(w);
  };

  const type = (input.type_code ?? "").trim();
  const authority = (input.authority_code ?? "").trim();
  const definition = (input.definition_code ?? "").trim();
  const active = uniq((input.active_centers ?? []).filter((c) => c in FORM_CENTER_TO_ENGINE));
  const open = uniq((input.open_centers ?? []).filter((c) => c in FORM_CENTER_TO_ENGINE));
  const gates = uniq((input.gates ?? []).filter((g) => Number.isInteger(g) && g >= 1 && g <= 64));
  const channelCodes = uniq((input.channels ?? []).filter((c) => CHANNEL_BY_ID.has(c)));
  const centersEntered = active.length > 0 || open.length > 0;
  const activeSet = new Set(active);
  const activeEngine = active.map((c) => FORM_CENTER_TO_ENGINE[c]);

  // 1) Aynı merkez hem tanımlı hem açık.
  for (const c of active) {
    if (open.includes(c)) {
      push({
        code: "CENTER_BOTH_DEFINED_AND_OPEN",
        field: "centers",
        message: `${lbl(CENTER_LABEL, c)} hem "Tanımlı" hem "Açık" işaretli.`,
      });
    }
  }

  // 2) Tip ↔ otorite (merkez bilgisi gerekmez).
  if (type && authority) {
    const allowed = ALLOWED_AUTHORITIES_BY_TYPE[type];
    if (allowed && !allowed.includes(authority)) {
      push({
        code: "TYPE_AUTHORITY_MISMATCH",
        field: "authority",
        message: `${lbl(TYPE_LABEL, type)} tipi ile ${lbl(AUTHORITY_LABEL, authority)} otoritesi birlikte görülmez.`,
      });
    }
  }

  // 3) Reflektör kuralları.
  if (type === "reflector") {
    if (active.length > 0) {
      push({
        code: "REFLECTOR_HAS_DEFINED_CENTER",
        field: "centers",
        message: "Reflector tipinde tanımlı merkez bulunmaz; tanımlı merkez işaretli.",
      });
    }
    if (channelCodes.length > 0) {
      push({
        code: "REFLECTOR_HAS_CHANNEL",
        field: "channels",
        message: "Reflector tipinde tanımlı kanal bulunmaz; kanal seçili.",
      });
    }
    if (definition) {
      push({
        code: "REFLECTOR_HAS_DEFINITION",
        field: "definition",
        message: "Reflector tipinde tanım (bağlantı) türü bulunmaz; tanım seçili.",
      });
    }
  }
  // 4) Sakral kuralları (merkez girildiyse).
  if (centersEntered && (type === "generator" || type === "manifesting_generator")) {
    if (!activeSet.has("sacral")) {
      push({
        code: "GENERATOR_SACRAL_UNDEFINED",
        field: "centers",
        message: `${lbl(TYPE_LABEL, type)} tipinde Sakral merkez tanımlı olmalıdır.`,
      });
    }
  }
  if (centersEntered && (type === "projector" || type === "manifestor") && activeSet.has("sacral")) {
    push({
      code: "NON_GENERATOR_SACRAL_DEFINED",
      field: "centers",
      message: `${lbl(TYPE_LABEL, type)} tipinde Sakral merkez tanımsızdır; tanımlı işaretli.`,
    });
  }

  // 5) Motor → Boğaz (kanal girildiyse).
  if (channelCodes.length > 0 && (type === "manifestor" || type === "projector")) {
    const m2t = motorToThroatFromChannels(channelsFromCodes(channelCodes));
    if (type === "manifestor" && !m2t) {
      push({
        code: "MANIFESTOR_NO_MOTOR_TO_THROAT",
        field: "channels",
        message: "Manifestor tipinde bir motor merkez Boğaz'a kanalla bağlı olmalıdır; seçili kanallarda bu bağlantı yok.",
      });
    }
    if (type === "projector" && m2t) {
      push({
        code: "PROJECTOR_MOTOR_TO_THROAT",
        field: "channels",
        message: "Projector tipinde hiçbir motor merkez Boğaz'a bağlı değildir; seçili kanallar bu bağlantıyı içeriyor.",
      });
    }
  }

  // 6) Otorite ↔ tanımlı merkezler (merkez girildiyse; motor hiyerarşisi).
  if (centersEntered && authority) {
    const expected = expectedAuthorityFromCenters(activeEngine);
    if (expected !== authority) {
      push({
        code: "AUTHORITY_CENTERS_MISMATCH",
        field: "authority",
        message: `Tanımlı merkezlere göre beklenen otorite ${lbl(AUTHORITY_LABEL, expected)}; seçili otorite ${lbl(AUTHORITY_LABEL, authority)}.`,
      });
    }
  }

  // 7) Kanal ↔ kapı (kapı girildiyse).
  if (gates.length > 0) {
    const gateSet = new Set(gates);
    for (const code of channelCodes) {
      const ch = CHANNEL_BY_ID.get(code)!;
      const missing = [ch.gateA, ch.gateB].filter((g) => !gateSet.has(g));
      if (missing.length > 0) {
        push({
          code: "CHANNEL_GATES_MISSING",
          field: "channels",
          message: `${code} kanalı seçili ama ${missing.join(" ve ")} numaralı kapı${missing.length > 1 ? "lar" : ""} seçili değil.`,
        });
      }
    }
    const fromGates = getDefinedChannels(gates);
    for (const ch of fromGates) {
      if (!channelCodes.includes(ch.id)) {
        push({
          code: "GATES_CHANNEL_UNMARKED",
          field: "channels",
          message: `${ch.gateA} ve ${ch.gateB} numaralı kapılar seçili ama ${ch.id} kanalı işaretlenmemiş.`,
        });
      }
    }

    // 8) Kapılardan türetilen tip/otorite/tanım/merkezlerle karşılaştırma.
    const derivedChannels = fromGates;
    const derivedCenters = getDefinedCenters(derivedChannels);
    const def = computeDefinition(derivedCenters, derivedChannels, gates);
    const ta = computeTypeAndAuthority(derivedCenters, def.components);
    const derivedType = ENGINE_TYPE_TO_FORM[ta.type];
    const derivedAuthority = ENGINE_AUTHORITY_TO_FORM[ta.authority];
    const derivedDefinition = ENGINE_DEFINITION_TO_FORM[def.kind];

    if (type && type !== derivedType) {
      push({
        code: "GATES_TYPE_MISMATCH",
        field: "type",
        message: `Seçili kapılardan türetilen tip ${lbl(TYPE_LABEL, derivedType)}; seçili tip ${lbl(TYPE_LABEL, type)}.`,
      });
    }
    if (authority && authority !== derivedAuthority) {
      push({
        code: "GATES_AUTHORITY_MISMATCH",
        field: "authority",
        message: `Seçili kapılardan türetilen otorite ${lbl(AUTHORITY_LABEL, derivedAuthority)}; seçili otorite ${lbl(AUTHORITY_LABEL, authority)}.`,
      });
    }
    if (definition && definition !== derivedDefinition) {
      push({
        code: "GATES_DEFINITION_MISMATCH",
        field: "definition",
        message: derivedDefinition
          ? `Seçili kapılardan türetilen tanım ${lbl(DEFINITION_LABEL, derivedDefinition)}; seçili tanım ${lbl(DEFINITION_LABEL, definition)}.`
          : `Seçili kapılarda tamamlanmış kanal yok (tanım bulunmaz); seçili tanım ${lbl(DEFINITION_LABEL, definition)}.`,
      });
    }
    if (centersEntered) {
      const derivedForm = new Set(derivedCenters.map((c) => ENGINE_CENTER_TO_FORM[c]));
      const extra = active.filter((c) => !derivedForm.has(c));
      const missing = [...derivedForm].filter((c) => !activeSet.has(c));
      if (extra.length > 0 || missing.length > 0) {
        const parts: string[] = [];
        if (missing.length > 0) parts.push(`tanımlı olması beklenen: ${missing.map((c) => lbl(CENTER_LABEL, c)).join(", ")}`);
        if (extra.length > 0) parts.push(`kapılara göre tanımsız: ${extra.map((c) => lbl(CENTER_LABEL, c)).join(", ")}`);
        push({
          code: "GATES_CENTERS_MISMATCH",
          field: "centers",
          message: `Tanımlı merkezler seçili kapılarla uyuşmuyor (${parts.join("; ")}).`,
        });
      }
    }
  }

  return warnings;
}

/** Kayıttan önce kullanıcıya gösterilecek engellemeyen onay metni. */
export const MANUAL_CHART_CONFIRM_MESSAGE =
  "Girdiğiniz alanlar birbiriyle uyumsuz olabilir. Yine de kaydetmek istiyor musunuz? (Kayıt engellenmez; değerleri daha sonra düzenleyebilirsiniz.)";

// ── Sunucu allow-list doğrulaması (bilinmeyen kod → 400) ───────────────────────

const TYPE_CODES = new Set<string>(HUMAN_DESIGN_TYPES.map((t) => t.code));
const AUTHORITY_CODES = new Set<string>(HUMAN_DESIGN_AUTHORITIES.map((a) => a.code));
const PROFILE_CODES = new Set<string>(HUMAN_DESIGN_PROFILES.map((p) => p.code));
const DEFINITION_CODES = new Set<string>(HUMAN_DESIGN_DEFINITIONS.map((d) => d.code));
const CENTER_CODES = new Set<string>(HUMAN_DESIGN_CENTERS.map((c) => c.code));
const CHANNEL_CODES = new Set<string>(HUMAN_DESIGN_CHANNELS.map((c) => c.code));

export type ManualCodeValidation = { ok: true } | { ok: false; field: string; error: string };

function badField(field: string): ManualCodeValidation {
  return { ok: false, field, error: `Geçersiz harita değeri: ${field}.` };
}

function checkScalar(values: Record<string, unknown>, key: string, allowed: Set<string>): ManualCodeValidation | null {
  if (!(key in values)) return null;
  const v = values[key];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !allowed.has(v)) return badField(key);
  return null;
}

function checkList(
  values: Record<string, unknown>,
  key: string,
  ok: (item: unknown) => boolean,
): ManualCodeValidation | null {
  if (!(key in values)) return null;
  const v = values[key];
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length > 128 || !v.every(ok)) return badField(key);
  return null;
}

/**
 * SAF sunucu kapısı: manuel harita alanlarında YALNIZ allow-list kodları kabul edilir.
 * Tutarsızlık (ör. Reflector + tanımlı merkez) burada KONTROL EDİLMEZ — asla engel değildir.
 */
export function validateManualChartCodes(values: Record<string, unknown>): ManualCodeValidation {
  return (
    checkScalar(values, "type_code", TYPE_CODES) ??
    checkScalar(values, "authority_code", AUTHORITY_CODES) ??
    checkScalar(values, "profile_code", PROFILE_CODES) ??
    checkScalar(values, "definition_code", DEFINITION_CODES) ??
    checkList(values, "active_centers", (x) => typeof x === "string" && CENTER_CODES.has(x)) ??
    checkList(values, "open_centers", (x) => typeof x === "string" && CENTER_CODES.has(x)) ??
    checkList(values, "channels", (x) => typeof x === "string" && CHANNEL_CODES.has(x)) ??
    checkList(values, "gates", (x) => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 64) ??
    { ok: true }
  );
}
