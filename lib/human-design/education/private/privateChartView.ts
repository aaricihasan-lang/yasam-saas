// Human Design — Eğitmene Özel Eğitim Haritaları · HARİTA GÖRÜNÜM ALLOWLIST'i (SAF; IO yok).
//
// FAZ 7 mahremiyet kuralı: kayıtlı `computed_result` / `provider_raw` istemciye ASLA olduğu gibi gitmez.
// Bu modül BodyGraph ve harita özetinin GERÇEKTEN okuduğu yapısal alanlardan YENİ bir nesne kurar
// (allowlist; bilinmeyen / iç içe alanlar kopyalanmaz). Çıkarılanlar:
//   • input (doğum tarihi/saati/saat dilimi/koordinat), timing (doğum + Design UTC anı)
//   • aktivasyon boylamları + sınır işaretleri (tam doğum anını türetmeye yeter)
//   • provider ayrıntıları (endpoint, designInstantUtc, lang …), meta açıklamaları, warnings, validation
//   • render yükündeki designInstantUtc ve sağlayıcı yorum metinleri
// Kalan yapısal aktivasyon (kapı.çizgi) BodyGraph'ın kendisidir; çizim verisi DEĞİŞTİRİLMEZ, yalnız taşınan alanlar seçilir.
// Doğum bilgisi YALNIZ izin kapsamındaysa ve yalnız künye biçiminde (koordinat / UTC anı YOK) eklenir.

import { buildChartSubjectInfo, todayCalendarDate, type HdChartSubjectInfo } from "@/lib/human-design/chart/chartSubjectInfo";

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Kısa etiket metni (tip / otorite / profil / anahtar söz): yalnız string, uzunluk sınırlı. */
const label = (v: unknown, max = 120): string | undefined => (typeof v === "string" && v.length <= max ? v : undefined);
const int = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;
const CENTER_RE = /^[A-Za-z][A-Za-z ]{1,30}$/;
const CODE_RE = /^[a-z0-9_-]{1,40}$/i;
const centerList = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && CENTER_RE.test(x));

/** İstemciye giden hesap görünümü — `HdComputedChart`'ın kişisel alan içermeyen alt kümesi. */
export type PrivEduChartView = {
  schemaVersion: string;
  meta: { engine: string; nodeType: string; calibrationStatus: string; disclaimer: string };
  activations: { body: string; side: string; gate: number; line: number }[];
  type: string;
  authority: string;
  profile: string;
  definition: { kind: string; componentCount?: number; definedCenters: string[] };
  centers: { defined: string[]; open: string[] };
  channels: { id: string; name: string; gates: [number, number]; centers: [string, string] }[];
  incarnationCross: { gates: [number, number, number, number]; angle?: string; angleCode?: string; name?: string; status: string };
  strategy?: string;
  signature?: string;
  notSelf?: string;
  provider?: { id: "roxyapi" };
  appCodes?: {
    type_code: string | null; authority_code: string | null; profile_code: string | null; definition_code: string | null;
    active_centers: string[]; open_centers: string[]; gates: number[]; channels: string[];
  };
};

/** `computed_result` → kişisel alansız görünüm. Yapı tanınmazsa null (sessiz tahmin yok). */
export function buildEduChartView(raw: unknown): PrivEduChartView | null {
  const r = obj(raw);
  if (!r) return null;
  const centers = obj(r.centers);
  const def = obj(r.definition);
  const cross = obj(r.incarnationCross);
  const type = label(r.type), authority = label(r.authority), profile = label(r.profile, 12);
  if (!centers || !def || !cross || !type || !authority || !profile) return null;
  const activations = arr(r.activations).flatMap((a) => {
    const x = obj(a);
    const body = label(x?.body, 20), side = label(x?.side, 20), gate = int(x?.gate, 1, 64), line = int(x?.line, 1, 6);
    return body && side && gate !== undefined && line !== undefined ? [{ body, side, gate, line }] : [];
  });
  const channels = arr(r.channels).flatMap((c) => {
    const x = obj(c);
    const g = arr(x?.gates), ce = arr(x?.centers);
    const id = label(x?.id, 10), name = label(x?.name);
    const g0 = int(g[0], 1, 64), g1 = int(g[1], 1, 64);
    const c0 = label(ce[0], 30), c1 = label(ce[1], 30);
    return id && name !== undefined && g0 !== undefined && g1 !== undefined && c0 && c1
      ? [{ id, name, gates: [g0, g1] as [number, number], centers: [c0, c1] as [string, string] }]
      : [];
  });
  const xg = arr(cross.gates).map((g) => int(g, 1, 64));
  if (xg.length !== 4 || xg.some((g) => g === undefined)) return null;
  const meta = obj(r.meta);
  const prov = obj(r.provider);
  const app = obj(r.appCodes);
  const view: PrivEduChartView = {
    schemaVersion: label(r.schemaVersion, 10) ?? "1.0",
    // Açıklama / motor sürümü metni taşınmaz; yalnız bileşenin okuduğu nodeType + kalibrasyon durumu.
    meta: { engine: "", nodeType: label(meta?.nodeType, 20) ?? "", calibrationStatus: label(meta?.calibrationStatus, 20) ?? "provider", disclaimer: "" },
    activations,
    type,
    authority,
    profile,
    definition: {
      kind: label(def.kind, 40) ?? "",
      ...(int(def.componentCount, 0, 9) !== undefined ? { componentCount: int(def.componentCount, 0, 9) } : {}),
      definedCenters: centerList(def.definedCenters),
    },
    centers: { defined: centerList(centers.defined), open: centerList(centers.open) },
    channels,
    incarnationCross: {
      gates: xg as [number, number, number, number],
      ...(label(cross.angle, 40) ? { angle: label(cross.angle, 40) } : {}),
      ...(label(cross.angleCode, 10) ? { angleCode: label(cross.angleCode, 10) } : {}),
      ...(label(cross.name, 160) ? { name: label(cross.name, 160) } : {}),
      status: label(cross.status, 20) ?? "provider",
    },
  };
  const strategy = label(r.strategy), signature = label(r.signature), notSelf = label(r.notSelf);
  if (strategy) view.strategy = strategy;
  if (signature) view.signature = signature;
  if (notSelf) view.notSelf = notSelf;
  if (prov?.id === "roxyapi") view.provider = { id: "roxyapi" };
  if (app) {
    const code = (v: unknown) => (typeof v === "string" && CODE_RE.test(v) ? v : null);
    const codes = (v: unknown) => arr(v).filter((x): x is string => typeof x === "string" && CODE_RE.test(x));
    view.appCodes = {
      type_code: code(app.type_code), authority_code: code(app.authority_code), profile_code: code(app.profile_code),
      definition_code: code(app.definition_code), active_centers: codes(app.active_centers), open_centers: codes(app.open_centers),
      gates: arr(app.gates).flatMap((g) => (int(g, 1, 64) !== undefined ? [g as number] : [])), channels: codes(app.channels),
    };
  }
  return view;
}

/** Sunucunun ürettiği render yükünden (buildRoxyRenderPayload) yalnız çizim alanları; Design UTC anı ÇIKARILIR. */
export function sanitizeRenderPayload(render: unknown): Record<string, unknown> | null {
  const r = obj(render);
  if (!r) return null;
  const cross = obj(r.incarnationCross);
  return {
    type: label(r.type), authority: label(r.authority), profile: label(r.profile, 12), definition: label(r.definition, 40),
    strategy: label(r.strategy), signature: label(r.signature), notSelf: label(r.notSelf),
    incarnationCross: cross ? { gates: arr(cross.gates).filter((g) => int(g, 1, 64) !== undefined), angle: label(cross.angle, 40), angleCode: label(cross.angleCode, 10), name: label(cross.name, 160) } : null,
    centers: arr(r.centers).map((c) => {
      const x = obj(c) ?? {};
      return { id: label(x.id, 30), name: label(x.name, 40), defined: x.defined === true, motor: x.motor === true, awareness: x.awareness === true,
        gates: arr(x.gates).filter((g) => int(g, 1, 64) !== undefined) };
    }),
    channels: arr(r.channels).map((c) => {
      const x = obj(c) ?? {};
      return { gateA: int(x.gateA, 1, 64), gateB: int(x.gateB, 1, 64), name: label(x.name), circuit: label(x.circuit, 40), centers: arr(x.centers).map((v) => label(v, 30)) };
    }),
    gates: arr(r.gates).map((g) => {
      const x = obj(g) ?? {};
      return { planet: label(x.planet, 20), side: label(x.side, 20), gate: int(x.gate, 1, 64), line: int(x.line, 1, 6), gateName: label(x.gateName) };
    }),
  };
}

/**
 * Künye (bilgi bloğu). Ad: takma ad veya (açık isim izniyle) güncel danışan adı. Doğum tarihi/saati/yeri/saat dilimi ve yaş
 * YALNIZ `includeBirth` iken; koordinat ve UTC anı hiçbir durumda gönderilmez (eğitim için gereksiz).
 */
export function buildEduSubject(
  displayName: string,
  includeBirth: boolean,
  birth: { date?: unknown; time?: unknown; place?: unknown; timezone?: unknown } | null,
  today = todayCalendarDate(),
): HdChartSubjectInfo {
  if (!includeBirth || !birth) {
    return { name: displayName || null, localDateTime: null, zoneLabel: null, utcDateTime: null, place: null, coordinates: null, age: null };
  }
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const full = buildChartSubjectInfo({ clientName: displayName, birthDate: s(birth.date), birthTime: s(birth.time), birthPlace: s(birth.place), timezone: s(birth.timezone) }, today);
  return { ...full, utcDateTime: null, coordinates: null };
}
