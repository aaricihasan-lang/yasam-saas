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

/**
 * Kademeli açılış 3. adım (Owner'ın AYRI onayıyla): tam "true" ise bayrak açıkken bütün uzmanlar erişir.
 * Varsayılan kapalı → yalnız Owner + izin listesindeki uzmanlar.
 */
export function isWorkspaceRolloutAll(env: Env = process.env): boolean {
  return env.EXPERT_WORKSPACE_ROLLOUT_ALL === "true";
}
