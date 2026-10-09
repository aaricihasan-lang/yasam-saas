/**
 * HD AŞAMA 4B — Profesyonel Word/DOCX · DONMUŞ RAPOR SNAPSHOT KONTRATI v2 (hd-report-2)
 * ===================================================================================
 *
 * SAF çekirdek (DB/ağ/AI YOK). Kayıtlı haritadan (manuel ya da Roxy computed) rapor
 * oluşturulduğu anda DONDURULAN bir v2 snapshot üretir. DOCX bu snapshot'tan üretilir.
 *
 * NEDEN AYRI SÜRÜM (hd-report-1 genişletilmedi):
 *   • v1 içerik kaynağı admin'in YAYIMLADIĞI merkezî canonical içeriktir (hash/provenance
 *     sözleşmesi + fail-loud). v2'nin yorum kaynakları farklıdır (uzmanın kendi Bilgi
 *     Bankası + izinli Sistem Yorumu) ve teknik bölümleri (26 aktivasyon, haç, merkezler)
 *     v1 şemasında YOKTUR. Aynı şemaya karıştırmak "admin içeriği = uzman bilgisi"
 *     karışıklığı yaratırdı → AYRI şema, AYRI renderer. v1 raporlar AYNEN indirilir.
 *
 * KİLİTLİ KARARLAR:
 *   • Yorum iki AYRI kaynaktan gelir ve KARIŞMAZ: commentary.expert (uzmanın tenant'ına ait
 *     human_design_knowledge_records) ↔ commentary.system (provider_raw'dan whitelist DTO).
 *   • Admin merkezî canonical içeriği v2'ye GİRMEZ (uzman yorumu yerine geçmez).
 *   • Sistem Yorumu YALNIZ sunucunun doğruladığı yetki + seçim ile dondurulur.
 *   • Eksik/hatalı veri UYDURULMAZ: aktivasyonlar 13+13 doğrulanmazsa "invalid" işaretlenir.
 *   • UTC doğum anı rapora GİRMEZ (hesap verisi olarak kayıtta kalır).
 *   • chartImage.storagePath alanı v1 ile AYNI yerde tutulur → rapor silme / Danışan
 *     Yolculuğu kalıcı silme görsel temizliği (snapshot->chartImage->>storagePath) aynen çalışır.
 */

import { createHash } from "node:crypto";
import {
  hdAuthorityLabelFromCode,
  hdCenterLabelFromCode,
  hdChannelLabelFromCode,
  hdDefinitionLabelFromCode,
  hdGateLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HUMAN_DESIGN_CENTERS } from "@/lib/human-design/constants";
import { GATE_TECHNICAL_DATA } from "@/lib/human-design/gateTechnicalData";
import { HD_PLANET_ORDER, PLANET_LABEL_TR } from "@/lib/human-design/bodygraph/planetGlyphs";
import { hdCrossAngleLabel } from "@/lib/human-design/normalize/hdDisplayLabels";
import type { HdAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import type { PlanetName } from "@/lib/human-design/engine/types";
import type { SystemReadingDto } from "@/lib/human-design/providers/roxy/systemReading";
import { isHdReportSnapshot, type HdReportSnapshot } from "./reportSnapshot";
import type { HdCommentarySelection } from "./reportV2Shared";

export const HD_REPORT_V2_SCHEMA_VERSION = "hd-report-2" as const;
export const HD_REPORT_V2_VERSION = 2 as const;

export {
  HD_COMMENTARY_SELECTIONS,
  HD_REPORT_REDACTED_HEADER,
  parseCommentarySelection,
  type HdCommentarySelection,
} from "./reportV2Shared";

/**
 * Sistem Yorumu durumu (snapshot'ta donar):
 *   included      — yetki VAR + seçildi + kayıtlı veri VAR → DTO donduruldu
 *   not_selected  — yetki VAR ama uzman seçmedi
 *   not_permitted — oluşturma anında hd_system_reading yetkisi YOK (istek ne olursa olsun)
 *   unavailable   — yetki VAR + seçildi ama haritada kayıtlı sistem verisi yok (manuel/legacy)
 */
export type HdSystemReadingStatus = "included" | "not_selected" | "not_permitted" | "unavailable";

/** Uzman Bilgi Bankası kategorilerinin rapor sırası (Bilgi Bankası eşleşme paneliyle aynı). */
export const HD_EXPERT_CATEGORY_ORDER = [
  "Tipler",
  "Otoriteler",
  "Profiller",
  "Tanımlar",
  "Merkezler",
  "Kanallar",
  "Kapılar",
  "Stratejiler",
  "Genel Notlar",
] as const;

export type FrozenExpertEntry = {
  category: string;
  title: string;
  /** Eşleşme kodu (ör. kapi_56) — teknik iz için; uzman metni DEĞİL. */
  code: string;
  content: string;
};

export type FrozenActivation = { planet: PlanetName; gate: number; line: number };

export type FrozenActivations =
  | { status: "ok"; design: FrozenActivation[]; personality: FrozenActivation[] }
  /** Haritada aktivasyon verisi yok (manuel kayıt). */
  | { status: "unavailable" }
  /** Kayıtlı veri 13+13 doğrulamasından geçmedi → GÖSTERİLMEZ (uydurma yok). */
  | { status: "invalid" };

export type FrozenCenter = { code: string; label: string; defined: boolean };
export type FrozenChannel = { code: string; label: string; gates: [number, number] };
export type FrozenGateActivation = { side: "design" | "personality"; planet: PlanetName; line: number };
export type FrozenGate = {
  gate: number;
  label: string;
  center: string | null;
  /** Bu kapıyı tamamlanmış bir kanala bağlayan kanal kodu (yoksa null). */
  channel: string | null;
  activations: FrozenGateActivation[];
};

export type FrozenCross = {
  /** Sağlayıcının verdiği tam ad (ör. "Right Angle Cross of Laws 2") ya da açı etiketi. */
  name: string;
  /** "56/60 | 3/50" (Personality Güneş/Dünya | Design Güneş/Dünya). */
  gates: string;
  angle: string | null;
};

export type BodygraphStatus = "roxy_render" | "uploaded_image" | "missing";

export type HdReportSnapshotV2 = {
  schemaVersion: typeof HD_REPORT_V2_SCHEMA_VERSION;
  generatedAt: string;
  client: {
    name: string;
    birthDate: string | null;
    /** Yerel doğum saati (HH:mm). UTC anı rapora GİRMEZ. */
    birthTime: string | null;
    birthPlace: string | null;
    timezone: string | null;
  };
  chart: {
    chartId: string;
    source: "manual" | "computed";
    provider: "roxyapi" | null;
  };
  identity: {
    type: string | null;
    profile: string | null;
    authority: string | null;
    definition: string | null;
    cross: FrozenCross | null;
  };
  activations: FrozenActivations;
  centers: FrozenCenter[];
  channels: FrozenChannel[];
  gates: FrozenGate[];
  commentary: {
    /** İstemcinin istediği (bilgi amaçlı). */
    requested: HdCommentarySelection;
    expert: { included: boolean; entries: FrozenExpertEntry[] };
    system: { status: HdSystemReadingStatus; reading: SystemReadingDto | null };
  };
  bodygraph: {
    status: BodygraphStatus;
    width?: number;
    height?: number;
    sha256?: string;
  };
  /** v1 ile aynı konum: görsel temizliği bu yolu okur. */
  chartImage: { storagePath?: string; includedAtGeneration: boolean } | null;
};

// ── Girdi ────────────────────────────────────────────────────────────────────────
export type BuildSnapshotV2Input = {
  generatedAt: string;
  chartId: string;
  source: "manual" | "computed";
  provider: string | null;
  client: { name: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null; timezone: string | null };
  codes: HdAppChartCodes;
  /** computed_result (yalnız computed kayıtlarda); manuel → null. */
  computed: unknown;
  requested: HdCommentarySelection;
  /** SUNUCUDA doğrulanmış: human_design + hd_system_reading. */
  systemReadingPermitted: boolean;
  /** Seçim+yetki uygunsa sunucunun çıkardığı DTO; kayıtlı veri yoksa null. */
  systemReading: SystemReadingDto | null;
  expertRecords: ReadonlyArray<{ category?: unknown; title?: unknown; code?: unknown; content?: unknown; is_active?: unknown }>;
  bodygraph: HdReportSnapshotV2["bodygraph"];
  chartImage: HdReportSnapshotV2["chartImage"];
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "14:30:00" → "14:30" (yerel saat; saniye raporda gösterilmez). */
export function localTimeHm(t: string | null | undefined): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
}

const PLANET_SET = new Set<string>(HD_PLANET_ORDER);

/**
 * computed_result.activations → 13 Design + 13 Personality (HD_PLANET_ORDER sırasında).
 * Her taraf TAM 13 farklı gezegen, kapı 1..64, çizgi 1..6 olmalı; aksi halde "invalid"
 * (eksik/hatalı aktivasyon UYDURULMAZ, kısmi tablo GÖSTERİLMEZ).
 */
export function freezeActivations(computed: unknown): FrozenActivations {
  if (!isObj(computed) || !Array.isArray(computed.activations)) return { status: "unavailable" };
  const bySide: Record<"design" | "personality", Map<PlanetName, FrozenActivation>> = {
    design: new Map(),
    personality: new Map(),
  };
  for (const a of computed.activations) {
    if (!isObj(a)) return { status: "invalid" };
    const side = a.side === "design" || a.side === "personality" ? a.side : null;
    const body = typeof a.body === "string" && PLANET_SET.has(a.body) ? (a.body as PlanetName) : null;
    const gate = typeof a.gate === "number" && Number.isInteger(a.gate) && a.gate >= 1 && a.gate <= 64 ? a.gate : null;
    const line = typeof a.line === "number" && Number.isInteger(a.line) && a.line >= 1 && a.line <= 6 ? a.line : null;
    if (!side || !body || gate === null || line === null) return { status: "invalid" };
    if (bySide[side].has(body)) return { status: "invalid" };
    bySide[side].set(body, { planet: body, gate, line });
  }
  if (bySide.design.size !== HD_PLANET_ORDER.length || bySide.personality.size !== HD_PLANET_ORDER.length) {
    return { status: "invalid" };
  }
  const ordered = (m: Map<PlanetName, FrozenActivation>) => HD_PLANET_ORDER.map((p) => m.get(p) as FrozenActivation);
  return { status: "ok", design: ordered(bySide.design), personality: ordered(bySide.personality) };
}

/** computed_result.incarnationCross → donmuş haç (uygulamadaki bilgi paneliyle aynı etiketleme). */
export function freezeCross(computed: unknown): FrozenCross | null {
  if (!isObj(computed) || !isObj(computed.incarnationCross)) return null;
  const xc = computed.incarnationCross;
  const g = Array.isArray(xc.gates) ? xc.gates : [];
  if (g.length !== 4 || !g.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 64)) return null;
  const angleRaw = str(xc.angle);
  const angle = angleRaw ? hdCrossAngleLabel(angleRaw) : null;
  const name = str(xc.name) ?? (angle ? `${angle} (yalnız kapılar)` : null);
  if (!name) return null;
  return { name, gates: `${g[0]}/${g[1]} | ${g[2]}/${g[3]}`, angle };
}

function freezeExpert(records: BuildSnapshotV2Input["expertRecords"]): FrozenExpertEntry[] {
  const entries: FrozenExpertEntry[] = [];
  for (const r of records) {
    if (r.is_active === false) continue;
    const content = typeof r.content === "string" ? r.content.trim() : "";
    const title = str(r.title);
    const code = str(r.code);
    if (!content || !title || !code) continue; // boş kayıt atlanır (uydurma yok)
    entries.push({ category: str(r.category) ?? "Genel Notlar", title, code, content });
  }
  const rank = (c: string) => {
    const i = (HD_EXPERT_CATEGORY_ORDER as readonly string[]).indexOf(c);
    return i === -1 ? HD_EXPERT_CATEGORY_ORDER.length : i;
  };
  // Kararlı sıralama: kategori sırası; kategori içinde sunucunun verdiği sıra (sort_order) korunur.
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e.category) - rank(b.e.category) || a.i - b.i)
    .map((x) => x.e);
}

/** SAF: kayıtlı harita + doğrulanmış yetki/seçim → donmuş v2 snapshot. */
export function buildReportSnapshotV2(input: BuildSnapshotV2Input): HdReportSnapshotV2 {
  const { codes } = input;
  const activations = input.source === "computed" ? freezeActivations(input.computed) : { status: "unavailable" as const };

  const definedSet = new Set(codes.active_centers);
  const openSet = new Set(codes.open_centers);
  const centers: FrozenCenter[] = [];
  for (const c of HUMAN_DESIGN_CENTERS) {
    if (definedSet.has(c.code)) centers.push({ code: c.code, label: hdCenterLabelFromCode(c.code), defined: true });
    else if (openSet.has(c.code) || definedSet.size > 0) centers.push({ code: c.code, label: hdCenterLabelFromCode(c.code), defined: false });
  }

  const channels: FrozenChannel[] = [];
  for (const code of codes.channels) {
    const [a, b] = code.split("-").map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    channels.push({ code, label: hdChannelLabelFromCode(code), gates: [a, b] });
  }

  const gateActs = new Map<number, FrozenGateActivation[]>();
  if (activations.status === "ok") {
    for (const side of ["personality", "design"] as const) {
      for (const a of activations[side]) {
        const list = gateActs.get(a.gate) ?? [];
        list.push({ side, planet: a.planet, line: a.line });
        gateActs.set(a.gate, list);
      }
    }
  }
  const gates: FrozenGate[] = codes.gates.map((gate) => ({
    gate,
    label: hdGateLabelFromCode(gate),
    center: GATE_TECHNICAL_DATA[gate]?.merkez ?? null,
    channel: channels.find((c) => c.gates.includes(gate))?.code ?? null,
    activations: gateActs.get(gate) ?? [],
  }));

  const wantsExpert = input.requested === "expert" || input.requested === "both";
  const wantsSystem = input.requested === "system" || input.requested === "both";
  // Yetki YOKSA seçim ne olursa olsun Sistem Yorumu yok ve uzman bilgileri OTOMATİK dahil.
  const expertIncluded = input.systemReadingPermitted ? wantsExpert : true;
  let systemStatus: HdSystemReadingStatus;
  if (!input.systemReadingPermitted) systemStatus = "not_permitted";
  else if (!wantsSystem) systemStatus = "not_selected";
  else systemStatus = input.systemReading ? "included" : "unavailable";

  return {
    schemaVersion: HD_REPORT_V2_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    client: {
      name: input.client.name.trim() || "Danışan",
      birthDate: input.client.birthDate,
      birthTime: localTimeHm(input.client.birthTime),
      birthPlace: input.client.birthPlace,
      timezone: input.client.timezone,
    },
    chart: {
      chartId: input.chartId,
      source: input.source,
      provider: input.provider === "roxyapi" ? "roxyapi" : null,
    },
    identity: {
      type: codes.type_code ? hdTypeLabelFromCode(codes.type_code) : null,
      profile: codes.profile_code ? hdProfileLabelFromCode(codes.profile_code) : null,
      authority: codes.authority_code ? hdAuthorityLabelFromCode(codes.authority_code) : null,
      definition: codes.definition_code ? hdDefinitionLabelFromCode(codes.definition_code) : null,
      cross: input.source === "computed" ? freezeCross(input.computed) : null,
    },
    activations,
    centers,
    channels,
    gates,
    commentary: {
      requested: input.requested,
      expert: { included: expertIncluded, entries: expertIncluded ? freezeExpert(input.expertRecords) : [] },
      system: { status: systemStatus, reading: systemStatus === "included" ? input.systemReading : null },
    },
    bodygraph: input.bodygraph,
    chartImage: input.chartImage,
  };
}

// ── İndirme anı yetki filtresi (snapshot DB'de DEĞİŞMEZ; yalnız bu çıktı) ─────────────
export type DownloadView = {
  snapshot: HdReportSnapshotV2;
  /** Sistem Yorumu güncel yetki kapalı olduğu için bu çıktıdan çıkarıldı mı? */
  systemReadingRedacted: boolean;
};

/**
 * Donmuş snapshot'ın KOPYASI üzerinde çalışır (girdi mutasyona uğramaz). hd_system_reading
 * yetkisi indirme anında KAPALIYSA Sistem Yorumu bölümü çıktıdan çıkarılır; orijinal kayıt
 * korunur (yetki geri açılırsa aynı rapor yine tam iner). Yeni Roxy çağrısı YOK.
 */
export function applyDownloadPermissions(snapshot: HdReportSnapshotV2, systemReadingPermitted: boolean): DownloadView {
  const hasSystem = snapshot.commentary.system.status === "included" && !!snapshot.commentary.system.reading;
  if (!hasSystem || systemReadingPermitted) return { snapshot, systemReadingRedacted: false };
  return {
    snapshot: {
      ...snapshot,
      commentary: { ...snapshot.commentary, system: { status: snapshot.commentary.system.status, reading: null } },
    },
    systemReadingRedacted: true,
  };
}

// ── Şema doğrulama ─────────────────────────────────────────────────────────────────
export function isHdReportSnapshotV2(v: unknown): v is HdReportSnapshotV2 {
  if (!isObj(v)) return false;
  if (v.schemaVersion !== HD_REPORT_V2_SCHEMA_VERSION) return false;
  if (typeof v.generatedAt !== "string") return false;
  if (!isObj(v.client) || typeof v.client.name !== "string") return false;
  if (!isObj(v.chart) || typeof v.chart.chartId !== "string") return false;
  if (!isObj(v.identity)) return false;
  if (!isObj(v.activations) || typeof v.activations.status !== "string") return false;
  if (!Array.isArray(v.centers) || !Array.isArray(v.channels) || !Array.isArray(v.gates)) return false;
  if (!isObj(v.commentary) || !isObj(v.commentary.expert) || !isObj(v.commentary.system)) return false;
  if (!Array.isArray(v.commentary.expert.entries)) return false;
  if (!isObj(v.bodygraph) || typeof v.bodygraph.status !== "string") return false;
  return true;
}

/** Kayıtlı profesyonel rapor snapshot'ı: eski hd-report-1 ya da yeni hd-report-2. */
export type AnyHdReportSnapshot = HdReportSnapshot | HdReportSnapshotV2;

export function isAnyHdReportSnapshot(v: unknown): v is AnyHdReportSnapshot {
  return isHdReportSnapshotV2(v) || isHdReportSnapshot(v);
}

/** Snapshot içeriğinin kararlı SHA-256'sı (değişmezlik testleri / iz için). */
export function snapshotV2Digest(s: HdReportSnapshotV2): string {
  return createHash("sha256").update(JSON.stringify(s), "utf8").digest("hex");
}

/** Görünen gezegen adı (Türkçe). */
export function planetLabelTr(p: PlanetName): string {
  return PLANET_LABEL_TR[p] ?? p;
}
