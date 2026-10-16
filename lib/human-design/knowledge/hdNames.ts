// HD kapı/kanal GÖRÜNEN AD kişiselleştirmesi — SAF çekirdek (DB/ağ yok; istemci + sunucu ortak).
//
// Model (migration YOK): uzmanın kendi Bilgi Bankası kaydı (human_design_knowledge_records) zaten
// tenant başına kod başına TEK satırdır (UNIQUE(tenant_id, code)). Kapılar/Kanallar kaydının `title`
// alanı o hesabın görünen adını taşır; biçim hazır etiketle aynıdır ("21 — Ad", "29-46 Ad").
//   • Eşleşme HER ZAMAN koddan (kapi_21, kanal_29_46) — görünen ada asla bakılmaz.
//   • Numara / kapı çifti koddan gelir; ad boşsa hazır ada (o da yoksa numaraya) güvenli dönülür.
//   • Hazır sözlük (constants.ts) DEĞİŞMEZ; kişisel ad yalnız ilgili tenant'ın kaydında durur.

import { HUMAN_DESIGN_CHANNELS, HUMAN_DESIGN_GATES } from "@/lib/human-design/constants";

export type HdNameOverrides = {
  /** Kapı numarası → kişisel ad (yalnız hazır addan farklı olanlar). */
  gates: Record<number, string>;
  /** "29-46" → kişisel ad (yalnız hazır addan farklı olanlar). */
  channels: Record<string, string>;
};

export const EMPTY_HD_NAME_OVERRIDES: HdNameOverrides = Object.freeze({ gates: {}, channels: {} }) as HdNameOverrides;

export const HD_GATE_CATEGORY = "Kapılar";
export const HD_CHANNEL_CATEGORY = "Kanallar";

const GATE_LABEL = new Map<number, string>(HUMAN_DESIGN_GATES.map((g) => [g.code, g.label]));
const CHANNEL_LABEL = new Map<string, string>(HUMAN_DESIGN_CHANNELS.map((c) => [c.code as string, c.label as string]));

// Önceki sürümlerin hazır adları (AŞAMA 2 öncesi). Bu adlarla kayıtlı başlıklar KİŞİSEL ad sayılmaz →
// güncel hazır ad görünür (uzman bunları hiç yazmadı; listeden seçmişti).
const LEGACY_GATE_NAMES: Record<number, string[]> = {
  10: ["Benlik sevgisi"],
  46: ["Beden sevgisi"],
  64: ["Şüphe kapısı"],
};
const LEGACY_CHANNEL_NAMES: Record<string, string[]> = {
  "2-14": ["Ritim Kanalı"],
  "5-15": ["Ritim Kanalı"],
  "10-34": ["Keşif Kanalı"],
  "29-46": ["Keşif Kanalı"],
};

const DASH = "[—–-]";

function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sameName(a: string, b: string): boolean {
  return cleanName(a).toLocaleLowerCase("tr-TR") === cleanName(b).toLocaleLowerCase("tr-TR");
}

export function isHdGateNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && GATE_LABEL.has(n);
}

export function isHdChannelCode(code: unknown): code is string {
  return typeof code === "string" && CHANNEL_LABEL.has(code);
}

/** "kapi_21" → 21 (yalnız resmi 1–64). */
export function parseHdGateKnowledgeCode(code: unknown): number | null {
  if (typeof code !== "string") return null;
  const m = /^kapi_(\d{1,2})$/.exec(code.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return isHdGateNumber(n) ? n : null;
}

/** "kanal_29_46" → "29-46" (yalnız resmi 36 kanal; sıra kanal kimliğindeki gibi). */
export function parseHdChannelKnowledgeCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const m = /^kanal_(\d{1,2})_(\d{1,2})$/.exec(code.trim());
  if (!m) return null;
  const c = `${Number(m[1])}-${Number(m[2])}`;
  return isHdChannelCode(c) ? c : null;
}

/** Hazır kapı adı (numarasız): 21 → "Haznedar kapısı". */
export function hdGateDefaultName(gate: number): string | null {
  const l = GATE_LABEL.get(gate);
  if (!l) return null;
  return cleanName(l.replace(new RegExp(`^\\s*${gate}\\s*${DASH}\\s*`), "")) || null;
}

/** Hazır kanal adı (kodsuz): "29-46" → "Keşif Kanalı (Discovery)". */
export function hdChannelDefaultName(code: string): string | null {
  const l = CHANNEL_LABEL.get(code);
  if (!l) return null;
  const [a, b] = code.split("-");
  return cleanName(l.replace(new RegExp(`^\\s*${a}\\s*${DASH}\\s*${b}\\s*`), "")) || null;
}

/**
 * Kayıt başlığından numarasız adı çıkarır. "21 — Aşk Kapısı", "21. Kapı — Aşk Kapısı",
 * "21 - Aşk Kapısı" ve önekli/öneksiz "Aşk Kapısı" biçimlerini tanır. Ad yoksa null.
 */
export function hdGateNameFromTitle(title: unknown): string | null {
  if (typeof title !== "string") return null;
  const stripped = title
    .replace(new RegExp(`^\\s*\\d{1,2}\\s*\\.?\\s*kap[ıiIİ](?=\\s|${DASH}|$)\\s*(?:${DASH}\\s*)?`, "i"), "")
    .replace(new RegExp(`^\\s*\\d{1,2}\\s*\\.?\\s*${DASH}\\s*`), "")
    .replace(new RegExp(`^\\s*\\d{1,2}\\s*$`), "");
  return cleanName(stripped) || null;
}

/** Kayıt başlığından kodsuz kanal adını çıkarır ("29-46 Keşif Kanalı" → "Keşif Kanalı"). */
export function hdChannelNameFromTitle(title: unknown): string | null {
  if (typeof title !== "string") return null;
  const stripped = title.replace(new RegExp(`^\\s*\\d{1,2}\\s*${DASH}\\s*\\d{1,2}\\s*(?:${DASH}\\s*)?`), "");
  return cleanName(stripped) || null;
}

function isDefaultGateName(gate: number, name: string): boolean {
  const def = hdGateDefaultName(gate);
  if (def && sameName(def, name)) return true;
  return (LEGACY_GATE_NAMES[gate] ?? []).some((l) => sameName(l, name));
}

function isDefaultChannelName(code: string, name: string): boolean {
  const def = hdChannelDefaultName(code);
  if (def && sameName(def, name)) return true;
  return (LEGACY_CHANNEL_NAMES[code] ?? []).some((l) => sameName(l, name));
}

/** Kayıt başlığı (hazır etiketle aynı biçim). Ad boşsa hazır etiket; o da yoksa "21. Kapı". */
export function composeHdGateTitle(gate: number, name: string | null | undefined): string {
  const n = cleanName(name ?? "");
  if (n) return `${gate} — ${n}`;
  return GATE_LABEL.get(gate) ?? `${gate}. Kapı`;
}

export function composeHdChannelTitle(code: string, name: string | null | undefined): string {
  const n = cleanName(name ?? "");
  if (n) return `${code} ${n}`;
  return CHANNEL_LABEL.get(code) ?? `${code} Kanalı`;
}

/** Görünen kapı adı (numarasız): kişisel → hazır → null. */
export function hdGateDisplayName(gate: number, ov: HdNameOverrides | null | undefined): string | null {
  return ov?.gates?.[gate] ?? hdGateDefaultName(gate);
}

/** Görünen kanal adı (kodsuz): kişisel → hazır → null. */
export function hdChannelDisplayName(code: string, ov: HdNameOverrides | null | undefined): string | null {
  return ov?.channels?.[code] ?? hdChannelDefaultName(code);
}

/** "21 — Aşk Kapısı" (ad yoksa "21. Kapı"). */
export function hdGateDisplayLabel(gate: number, ov: HdNameOverrides | null | undefined): string {
  const n = hdGateDisplayName(gate, ov);
  return n ? `${gate} — ${n}` : `${gate}. Kapı`;
}

/** "29-46 Aşk Kanalı" (bilinmeyen kod → kodun kendisi). */
export function hdChannelDisplayLabel(code: string, ov: HdNameOverrides | null | undefined): string {
  const n = hdChannelDisplayName(code, ov);
  return n ? `${code} ${n}` : code;
}

/**
 * Bilgi Bankası satırlarından (YALNIZ category/code/title) kişisel ad haritası. Aktif/pasif fark
 * etmez: ad, açıklamadan bağımsızdır (yalnız ad değiştirmek için açıklama gerekmez).
 * Geçersiz/resmi olmayan kodlar ve hazır adla aynı başlıklar YOK sayılır.
 */
export function buildHdNameOverrides(
  rows: ReadonlyArray<{ category?: unknown; code?: unknown; title?: unknown }>,
): HdNameOverrides {
  const out: HdNameOverrides = { gates: {}, channels: {} };
  for (const r of rows) {
    if (r.category === HD_GATE_CATEGORY) {
      const g = parseHdGateKnowledgeCode(r.code);
      const name = hdGateNameFromTitle(r.title);
      if (g !== null && name && !isDefaultGateName(g, name)) out.gates[g] = name;
    } else if (r.category === HD_CHANNEL_CATEGORY) {
      const c = parseHdChannelKnowledgeCode(r.code);
      const name = hdChannelNameFromTitle(r.title);
      if (c !== null && name && !isDefaultChannelName(c, name)) out.channels[c] = name;
    }
  }
  return out;
}

export type HdStructuredNameResult = { ok: true; title: string } | { ok: false; error: string };

/**
 * SUNUCU savunması: Kapılar/Kanallar kaydında kod resmi bir kapı/kanal olmalı (yeni kanal
 * uydurulamaz) ve başlık koddaki numarayla yeniden kurulur (numara/çift başlıktan değiştirilemez;
 * boş ad → hazır ad). Diğer kategoriler olduğu gibi geçer.
 */
export function normalizeHdStructuredTitle(category: unknown, code: unknown, title: unknown): HdStructuredNameResult {
  if (category === HD_GATE_CATEGORY) {
    const g = parseHdGateKnowledgeCode(code);
    if (g === null) return { ok: false, error: "Geçersiz kapı kodu (kapi_1 … kapi_64 bekleniyor)." };
    return { ok: true, title: composeHdGateTitle(g, hdGateNameFromTitle(title)) };
  }
  if (category === HD_CHANNEL_CATEGORY) {
    const c = parseHdChannelKnowledgeCode(code);
    if (c === null) return { ok: false, error: "Geçersiz kanal kodu (yalnız sistemdeki 36 kanal)." };
    return { ok: true, title: composeHdChannelTitle(c, hdChannelNameFromTitle(title)) };
  }
  return { ok: true, title: typeof title === "string" ? title : "" };
}
