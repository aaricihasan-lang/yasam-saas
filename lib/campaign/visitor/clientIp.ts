/**
 * Gece operasyonu — kampanya için TEK güvenilir IP yardımcısı (YALNIZ SUNUCU).
 *
 * Kaynak: extractClientIp (Vercel: x-real-ip / x-vercel-forwarded-for — Vercel kenarı bunları istemciden gelen değerin
 * üzerine yazar; x-forwarded-for yalnız son çare). Burada yalnız DOĞRULANIR:
 *   - Sözdizimi geçersiz / "unknown" → null (ücretli teknik reddedilir; yerel teknik ortak "bilinmeyen" kovasıyla sınırlanır).
 *   - Köşeli parantez ve IPv6 bölge eki (%eth0) atılır.
 * Gruplama TEK yerde yapılır: lib/campaign/subject.ts normalizeIp (IPv4-eşlemeli IPv6 → IPv4; IPv6 → /64 öneki) — günlük
 * IP hakkı ve hız sınırı kovası aynı anahtarı kullanır (IPv6 son 64 biti döndürülerek hak çoğaltılamaz).
 * CGNAT / kurum NAT'ı: aynı IPv4'ü paylaşan çok kişi olabilir — IP hakkı Owner ayarıdır ve imzalı tarayıcı kimliği + bot
 * doğrulaması ile birlikte uygulanır. VPN: IP değişir; tarayıcı kimliği ve bot doğrulaması yine geçerli.
 */
import { isIP } from "node:net";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { normalizeIp } from "../subject";

assertServerOnly("lib/campaign/visitor/clientIp");

/** Ham değer → doğrulanmış IP (veya null). */
export function normalizeCampaignIp(raw: string | null | undefined): string | null {
  let v = String(raw ?? "").trim();
  if (v.startsWith("[") && v.includes("]")) v = v.slice(1, v.indexOf("]"));
  const zone = v.indexOf("%");
  if (zone >= 0) v = v.slice(0, zone);
  if (!v || v.length > 45 || !isIP(v)) return null;
  return normalizeIp(v) === "unknown" ? null : v.toLowerCase();
}

/** Hız sınırı / hak kovası anahtarı (subject.normalizeIp ile aynı gruplama). */
export function campaignIpKey(ip: string): string {
  return normalizeIp(ip);
}

export function campaignClientIp(headers: Headers): string | null {
  return normalizeCampaignIp(extractClientIp(headers));
}
