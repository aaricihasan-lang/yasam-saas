/**
 * Gece operasyonu — kampanya ziyaretçi sayfası için YOL KAPSAMLI CSP eki (SAF; proxy.ts'ten çağrılır).
 *
 * Cloudflare Turnstile betiği ve iframe'i YALNIZ /ucretsiz-analiz dokümanında izinli: script-src ve frame-src
 * direktiflerine https://challenges.cloudflare.com eklenir. Diğer tüm yolların politikası BYTE-EŞİT kalır.
 * Nonce modunda ('strict-dynamic') betik zaten nonce'lu etiketle yüklenir; host eki 'off' modu ve iframe içindir.
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const CAMPAIGN_VISITOR_PATH = "/ucretsiz-analiz";

export function isCampaignVisitorPath(pathname: string): boolean {
  return pathname === CAMPAIGN_VISITOR_PATH || pathname === `${CAMPAIGN_VISITOR_PATH}/`;
}

/** Politikadaki script-src ve frame-src direktiflerine Turnstile kökenini ekler (yoksa direktifi oluşturmaz). */
export function withTurnstileCsp(policy: string): string {
  return policy
    .split(";")
    .map((d) => {
      const t = d.trim();
      const name = t.split(/\s+/)[0];
      if ((name === "script-src" || name === "frame-src") && !t.split(/\s+/).includes(TURNSTILE_ORIGIN)) return `${d.replace(/\s+$/, "")} ${TURNSTILE_ORIGIN}`;
      return d;
    })
    .join(";");
}
