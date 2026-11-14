/**
 * UZMAN PROFİLİ (F2) — rapor logosu seçimi: saf şema (bağımlılıksız; sunucu ve tarayıcı birlikte kullanır).
 *
 * Gövde: { source: "none" | "workspace" | "custom", assetId?: uuid, expectedVersion: number }
 *  - "custom"  → assetId ZORUNLU (uzmanın KENDİ, silinmemiş, kind='logo' görseli — sahiplik sunucuda ayrıca doğrulanır).
 *  - "none" / "workspace" → assetId gönderilmez (ya da null). "workspace" = uygulanan Kişisel Dijital Ofis tasarımındaki
 *    GÜNCEL logo (tasarım değişirse rapor da değişir; tasarımda logo yoksa rapor logosuz).
 * Bilinmeyen alan reddedilir. tenant / kullanıcı kimliği gövdeden ALINMAZ.
 */

export const LOGO_SOURCES = ["none", "workspace", "custom"] as const;
export type LogoSourceValue = (typeof LOGO_SOURCES)[number];
export type LogoSelection = { source: LogoSourceValue; assetId: string | null };

/** Uç durumu (GET / PUT yanıtı): istemcinin uyarı göstermesi için. Varlık sahipliği dışında bilgi taşımaz. */
export type LogoStatus =
  | "none" //            rapor logosu kapalı
  | "ok" //              seçilen logo kullanılabilir
  | "missing" //         özel logo silinmiş / artık kullanılamıyor → "Logo bulunamadı, yeniden seçin"
  | "workspace_empty" // çalışma alanı logosu seçili ama uygulanan tasarımda logo yok → rapor logosuz
  | "access_off"; //     Kişisel Dijital Ofis görsel erişimi kapalı → rapor logosuz

/** Yükleme kimliği biçimi (lib/workspace/schema UUID_RE ile aynı). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type LogoParse = { ok: true; value: LogoSelection; expectedVersion: number } | { ok: false; error: string; path: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseLogoSelection(body: unknown): LogoParse {
  if (!isRecord(body)) return { ok: false, error: "Geçersiz istek gövdesi.", path: "" };
  for (const k of Object.keys(body)) {
    if (k !== "source" && k !== "assetId" && k !== "expectedVersion") return { ok: false, error: "Bilinmeyen alan.", path: k };
  }
  const ev = body.expectedVersion;
  if (typeof ev !== "number" || !Number.isInteger(ev) || ev < 0 || ev > 2_000_000_000) {
    return { ok: false, error: "expectedVersion 0 veya pozitif tam sayı olmalı.", path: "expectedVersion" };
  }
  const source = body.source;
  if (typeof source !== "string" || !(LOGO_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, error: "Logo kaynağı none, workspace veya custom olmalı.", path: "source" };
  }
  const raw = body.assetId;
  if (source === "custom") {
    if (typeof raw !== "string" || !UUID_RE.test(raw)) return { ok: false, error: "Rapor logosu için bir logo seçin.", path: "assetId" };
    return { ok: true, value: { source, assetId: raw }, expectedVersion: ev };
  }
  if (raw !== undefined && raw !== null) return { ok: false, error: "Bu seçenekte logo kimliği gönderilmez.", path: "assetId" };
  return { ok: true, value: { source: source as LogoSourceValue, assetId: null }, expectedVersion: ev };
}
