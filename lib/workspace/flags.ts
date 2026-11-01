/**
 * KİŞİSEL DİJİTAL OFİS — özellik bayrağı (sunucu env; NEXT_PUBLIC değil).
 *
 * Kapalıyken (varsayılan) /api/settings/workspace/* uçları 404 döner ve hiçbir okuma/yazma yapılmaz; ana sayfa mevcut
 * hâliyle çalışır. GERİ ALMA = bayrağı kapatmak (+ gerekirse kod geri alma). Veri silinmez.
 */
type Env = Record<string, string | undefined>;

export function isWorkspaceDesignEnabled(env: Env = process.env): boolean {
  return env.EXPERT_WORKSPACE_DESIGN_ENABLED === "true";
}
