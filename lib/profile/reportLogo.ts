/**
 * UZMAN PROFİLİ (F2) — rapor logosu çözücüsü (YALNIZ SUNUCU; service-role db). F3 rapor markalamasının logo bağlantı noktası.
 *
 *   const logo = await resolveReportLogo(db, { tenantId, userId });          // → { data: PNG Buffer, width, height } | null
 *   normalizeExpertBranding({ ..., logoPng: logo })                           // F3 (lib/docx/expertBranding)
 *
 * Kurallar:
 *  - tenant / kullanıcı YALNIZ oturumdan (verifyUserRequest) gelen sahiptir; profil satırındaki kimliğe (ör. yedekten geri
 *    yüklenmiş başka uzmanın uuid'si) GÜVENİLMEZ: görsel her okumada tenant + kullanıcı + silinmemiş + kind='logo' ile
 *    lib/workspace/assets üzerinden doğrulanır.
 *  - Rapor markalaması kapalıysa (report_branding_enabled = false, varsayılan) → null: rapor bugünküyle birebir aynı.
 *  - Kişisel Dijital Ofis görsel erişimi kapalıysa (bayrak / kademeli açılış) → null (rapor logosuz).
 *  - "workspace" = UYGULANAN tasarımdaki güncel logo (taslak değil; logonun ana sayfada gizli olması rapor kullanımını
 *    etkilemez). Tasarımda logo yoksa → null.
 *  - HER hata (DB, Storage, bozuk görsel, zaman aşımı) → null; rapor ASLA çökmez. Günlük yalnız sabit aşama kodu yazar
 *    (kimlik / dosya adı / içerik yok).
 *  - Önbellek YOK (kullanıcılar arası paylaşılan hiçbir durum tutulmaz). Aynı rapor üretiminde tekrar okumamak için
 *    çağıran reportLogoLoader(...) ile istek ömürlü tek seferlik yükleyici kullanır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { findOwnAsset, readAssetVariant } from "@/lib/workspace/assets";
import { workspaceAccess } from "@/lib/workspace/access";
import { getDesign } from "@/lib/workspace/service";
import type { LogoStatus } from "./logoSchema";
import { webpToReportPng, type ReportLogo } from "./reportLogoPng";
import { getProfile, type Owner, type ProfileState } from "./service";

assertServerOnly("lib/profile/reportLogo");

export type { ReportLogo };
export const REPORT_LOGO_TIMEOUT_MS = 8000;

type Pick =
  | { kind: "none" | "access_off" | "workspace_empty" | "error" }
  | { kind: "asset"; assetId: string };

function warn(stage: string): void {
  console.warn(`[report-logo] rapor logosuz devam ediyor: ${stage}`);
}

/** Seçimden hangi görselin kullanılacağını bulur (sahiplik henüz DOĞRULANMAMIŞTIR; çağıran doğrular). */
async function pickAsset(db: SupabaseClient, o: Owner, state: ProfileState): Promise<{ pick: Pick; access: boolean; workspaceLogoAssetId: string | null }> {
  let access = false;
  try {
    const a = await workspaceAccess(db, o.userId, o.tenantId);
    if (a.reason === "error") return { pick: { kind: "error" }, access: false, workspaceLogoAssetId: null };
    access = a.allowed;
  } catch {
    return { pick: { kind: "error" }, access: false, workspaceLogoAssetId: null };
  }
  let workspaceLogoAssetId: string | null = null;
  if (access && state.logoSource !== "custom") {
    const d = await getDesign(db, o);
    if (!d.ok) return { pick: { kind: "error" }, access, workspaceLogoAssetId: null };
    workspaceLogoAssetId = d.state.applied?.logo.assetId ?? null;
  }
  if (state.logoSource === "none") return { pick: { kind: "none" }, access, workspaceLogoAssetId };
  if (!access) return { pick: { kind: "access_off" }, access, workspaceLogoAssetId };
  if (state.logoSource === "custom") {
    return state.logoAssetId ? { pick: { kind: "asset", assetId: state.logoAssetId }, access, workspaceLogoAssetId } : { pick: { kind: "error" }, access, workspaceLogoAssetId };
  }
  return workspaceLogoAssetId
    ? { pick: { kind: "asset", assetId: workspaceLogoAssetId }, access, workspaceLogoAssetId }
    : { pick: { kind: "workspace_empty" }, access, workspaceLogoAssetId };
}

async function resolveUnbounded(db: SupabaseClient, o: Owner, profile?: ProfileState): Promise<ReportLogo | null> {
  let state = profile;
  if (!state) {
    const p = await getProfile(db, o);
    if (!p.ok) { warn("profile"); return null; }
    state = p.state;
  }
  if (!state.reportBrandingEnabled || state.logoSource === "none") return null;
  const { pick } = await pickAsset(db, o, state);
  if (pick.kind === "error") { warn("access_or_design"); return null; }
  if (pick.kind !== "asset") return null;
  const v = await readAssetVariant(db, o, pick.assetId, "desktop", { kind: "logo" });
  if (!v.ok) { warn(v.status === 404 ? "asset_missing" : "asset_read"); return null; }
  const png = await webpToReportPng(v.bytes);
  if (!png.ok) { warn(`convert_${png.reason}`); return null; }
  return png.logo;
}

/**
 * Raporun uzman logosu (PNG) — ya da null (logosuz rapor). Asla fırlatmaz.
 * `opts.profile`: çağıran profili zaten okuduysa (aynı istekte, aynı sahip için getProfile sonucu) yeniden okunmaz.
 */
export async function resolveReportLogo(db: SupabaseClient, owner: Owner, opts: { profile?: ProfileState; timeoutMs?: number } = {}): Promise<ReportLogo | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => { warn("timeout"); resolve(null); }, opts.timeoutMs ?? REPORT_LOGO_TIMEOUT_MS);
  });
  try {
    return await Promise.race([resolveUnbounded(db, owner, opts.profile).catch(() => { warn("unexpected"); return null; }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * İstek ömürlü tek seferlik yükleyici: aynı rapor üretiminde kaç kez çağrılırsa çağrılsın görsel bir kez okunur / dönüştürülür.
 * Modül düzeyinde saklanmaz → kullanıcılar ve istekler arasında paylaşılmaz.
 */
export function reportLogoLoader(db: SupabaseClient, owner: Owner, opts: { profile?: ProfileState; timeoutMs?: number } = {}): () => Promise<ReportLogo | null> {
  let p: Promise<ReportLogo | null> | null = null;
  return () => (p ??= resolveReportLogo(db, owner, opts));
}

export type LogoDescription = {
  status: LogoStatus;
  /** Kişisel Dijital Ofis görsel erişimi (logo seçenekleri yalnız açıkken gösterilir). */
  access: boolean;
  /** Uygulanan tasarımdaki logo (yalnız erişim açıkken; önizleme mevcut güvenli görsel ucundan blob ile alınır). */
  workspaceLogoAssetId: string | null;
  /** Erişim kontrolü / DB geçici hatası. */
  error: boolean;
};

/** Profilim ekranı için seçim durumu (dosya okunmaz / dönüştürülmez; yalnız sahiplik + tür denetlenir). */
export async function describeReportLogo(db: SupabaseClient, o: Owner, state: ProfileState): Promise<LogoDescription> {
  const { pick, access, workspaceLogoAssetId } = await pickAsset(db, o, state);
  if (pick.kind === "error") return { status: state.logoSource === "none" ? "none" : "missing", access, workspaceLogoAssetId, error: true };
  if (pick.kind !== "asset") return { status: pick.kind, access, workspaceLogoAssetId, error: false };
  const a = await findOwnAsset(db, o, pick.assetId);
  if (!a.ok) return { status: "missing", access, workspaceLogoAssetId, error: true };
  return { status: a.asset && a.asset.kind === "logo" ? "ok" : "missing", access, workspaceLogoAssetId, error: false };
}
