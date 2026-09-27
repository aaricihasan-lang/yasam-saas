/**
 * Yaşam Hafızası™ — /api/yasam-hafizasi/health yanıtından DÜRÜST durum türetici (SAF).
 *
 * Client + server güvenli (import yok). Ana panel kartı ve çalışma alanı AYNI kuralı
 * kullanır; "İçerik hazır" gibi doğrulanmamış iddia GÖSTERİLMEZ.
 *
 * Öncelik:
 *   1. Yanıt yok / hata / 403            → "unavailable" ("—"; hata gibi bağırmaz)
 *   2. Flag'ler kapalı (yh_enabled && yh_hizli değil) → "coming_soon" ("Yakında")
 *   3. Sentetik tenant (ADMIN_LIBRARY)   → "out_of_scope" (mesleki indeks kapsamı dışında — hata DEĞİL)
 *   4. tenantRows > 0                    → "ready" ("N kayıt hazır")
 *   5. tenantRows = 0                    → "preparing" ("Hazırlanıyor")
 */

export type YhHealthPayload = {
  ok?: boolean;
  demo?: boolean;
  accessible?: boolean;
  tenantRows?: number;
  syntheticTenant?: boolean;
  flags?: Partial<Record<"yh_enabled" | "yh_hizli" | string, boolean>>;
  code?: string;
};

export type YhStatusKind = "loading" | "unavailable" | "coming_soon" | "out_of_scope" | "ready" | "preparing";

export type YhCardStatus = {
  kind: YhStatusKind;
  /** Ana panel kartındaki tek satırlık metin. */
  text: string;
  /** Hazır kayıt sayısı (yalnız "ready"). */
  rows: number | null;
};

export const YH_OUT_OF_SCOPE_TEXT = "Bu hesap mesleki indeks kapsamı dışında";

function formatCount(n: number): string {
  try {
    return n.toLocaleString("tr-TR");
  } catch {
    return String(n);
  }
}

/** SAF: health yanıtı → kart durumu. `undefined` → yükleniyor; `null` → erişilemedi. */
export function deriveYhCardStatus(payload: YhHealthPayload | null | undefined): YhCardStatus {
  if (payload === undefined) return { kind: "loading", text: "Yükleniyor…", rows: null };
  if (!payload || payload.ok !== true) return { kind: "unavailable", text: "—", rows: null };

  const flags = payload.flags ?? {};
  if (flags.yh_enabled !== true || flags.yh_hizli !== true) {
    return { kind: "coming_soon", text: "Yakında", rows: null };
  }
  if (payload.syntheticTenant === true) {
    return { kind: "out_of_scope", text: YH_OUT_OF_SCOPE_TEXT, rows: null };
  }
  if (payload.accessible === false) return { kind: "unavailable", text: "—", rows: null };
  const rows = typeof payload.tenantRows === "number" && Number.isFinite(payload.tenantRows) ? payload.tenantRows : 0;
  if (rows > 0) return { kind: "ready", text: `${formatCount(rows)} kayıt hazır`, rows };
  return { kind: "preparing", text: "Hazırlanıyor", rows: 0 };
}

/**
 * Mesleki Hafıza çalışma alanı başlangıç durumu:
 *   - "index-empty"  → tenant indeksinde henüz kayıt yok ("Mesleki hafızanız hazırlanıyor…")
 *   - "out-of-scope" → sentetik tenant (kapsam dışı mesajı; hata değil)
 *   - "disabled"     → flag'ler kapalı (mevcut "henüz aktif değil" kartı)
 *   - "ready"        → arama normal
 *   - "unknown"      → health okunamadı/yükleniyor (arama yine denenebilir; mevcut davranış)
 */
export type YhWorkspaceHealthState = "unknown" | "disabled" | "out-of-scope" | "index-empty" | "ready";

export function deriveYhWorkspaceState(payload: YhHealthPayload | null | undefined): YhWorkspaceHealthState {
  const card = deriveYhCardStatus(payload);
  switch (card.kind) {
    case "coming_soon":
      return "disabled";
    case "out_of_scope":
      return "out-of-scope";
    case "preparing":
      return "index-empty";
    case "ready":
      return "ready";
    default:
      return "unknown";
  }
}
