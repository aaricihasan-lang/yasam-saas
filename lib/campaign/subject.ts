/**
 * KAMPANYA MERKEZİ — ziyaretçi kimliği özetleri ve Türkiye takvim günü (YALNIZ SUNUCU).
 *
 * Ham IP / tarayıcı kimliği HİÇBİR YERDE saklanmaz. DB'ye yalnız HMAC-SHA256 (64 hex) gider:
 *   HMAC(gizli, "km1|<tür>|<Türkiye günü>|<normalize değer>") → gün değişince aynı IP farklı özete dönüşür (günlük döner).
 * Gizli anahtar: CAMPAIGN_SUBJECT_SECRET (≥ 32 karakter); yoksa RATE_LIMIT_SECRET (≥ 32). İkisi de yoksa NULL döner
 * ve kota servisi rezervasyonu REDDEDER (fail-closed). Service-role anahtarı bu amaçla kullanılmaz.
 *
 * IPv6: aynı abonenin adres değiştirmesine karşı /64 önekine indirgenir. IPv4 olduğu gibi kullanılır
 * (mobil operatör CGNAT'ı nedeniyle IP sınırı tek başına koruma değildir; tarayıcı kimliği ve genel tavanlar birlikte işler).
 */
import { createHmac } from "node:crypto";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";

assertServerOnly("lib/campaign/subject");

const TR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" });

/** Europe/Istanbul takvim günü (YYYY-MM-DD) — SQL campaign__day ile aynı tanım. */
export function turkeyDay(at: Date): string {
  return TR_DAY.format(at);
}

export function subjectSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of ["CAMPAIGN_SUBJECT_SECRET", "RATE_LIMIT_SECRET"] as const) {
    const v = (env[name] ?? "").trim();
    if (v.length >= 32) return v;
  }
  return null;
}

/** IP'yi normalize eder: IPv4 aynen, IPv6 → ilk 4 grup (/64), IPv4-eşlemeli IPv6 → IPv4; bilinmeyen → "unknown". */
export function normalizeIp(raw: string | null | undefined): string {
  let ip = String(raw ?? "").trim().toLowerCase();
  if (!ip || ip === "unknown") return "unknown";
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
  if (!/^[0-9a-f:]+$/.test(ip) || !ip.includes(":")) return "unknown";
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  if (full.length !== 8) return "unknown";
  return `${full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export function subjectHash(kind: "ip" | "browser", value: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`km1|${kind}|${day}|${value}`).digest("hex");
}
