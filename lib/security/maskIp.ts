/**
 * IP MASKELEME — yönetici arayüzüne ham IP gönderilmez (owner kararı, Usage360 nihai kapanış).
 *
 * Kurallar:
 *   * IPv4            185.12.34.56          → "185.12.xxx.xxx"
 *   * IPv4-mapped v6  ::ffff:185.12.34.56   → "185.12.xxx.xxx"
 *   * IPv6            2a02:4780:1:2::5      → "2a02:4780:xxxx::" (ilk iki hextet; zone id atılır)
 *   * Liste (XFF)     "1.2.3.4, 5.6.7.8"    → yalnız ilk adres maskelenir
 *   * boş / null      → null (UI "—" gösterir)
 *   * tanınmayan biçim → "gizli" (ham değer hiçbir koşulda geri dönmez)
 *
 * Saf fonksiyon; sunucu route'larında satırlar istemciye gönderilmeden ÖNCE uygulanır.
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET_RE = /^[0-9a-f]{1,4}$/i;

export const MASKED_UNKNOWN = "gizli";

function maskV4(v: string): string | null {
  const m = IPV4_RE.exec(v);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return `${parts[0]}.${parts[1]}.xxx.xxx`;
}

function maskV6(v: string): string | null {
  if (!v.includes(":")) return null;
  const lower = v.toLowerCase();
  // IPv4-mapped / gömülü IPv4 (::ffff:a.b.c.d)
  const lastColon = lower.lastIndexOf(":");
  const tail = lower.slice(lastColon + 1);
  if (tail.includes(".")) {
    const head = lower.slice(0, lastColon);
    if (!/^[0-9a-f:]*$/.test(head)) return null;
    return maskV4(tail);
  }
  const doubles = lower.split("::").length - 1;
  if (doubles > 1) return null;
  const [left, right = ""] = lower.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const all = [...leftParts, ...rightParts];
  if (all.length === 0 && doubles === 1) return "::";
  if (!all.every((h) => HEXTET_RE.test(h))) return null;
  if (doubles === 0 && all.length !== 8) return null;
  if (doubles === 1 && all.length > 7) return null;
  const groups = doubles === 1
    ? [...leftParts, ...Array(8 - all.length).fill("0"), ...rightParts]
    : all;
  const norm = (h: string) => h.replace(/^0+(?=.)/, "");
  return `${norm(groups[0])}:${norm(groups[1])}:xxxx::`;
}

export function maskIp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let first = raw.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  // [v6]:port ve v4:port biçimleri
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(first);
  if (bracket) first = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(first)) first = first.slice(0, first.lastIndexOf(":"));
  const pct = first.indexOf("%");
  if (pct >= 0) first = first.slice(0, pct);
  return maskV4(first) ?? maskV6(first) ?? MASKED_UNKNOWN;
}

/** Satırlardaki `ip_address` alanını maskeler (diğer alanlar aynen kalır). */
export function maskIpRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => ("ip_address" in r ? { ...r, ip_address: maskIp(r.ip_address) } : r));
}
