// HD-TZ (18.11.2026) — Roxy'ye DOĞRULANMIŞ UTC gönderimi + kayıtlı haritanın doğum anı (UTC) güncelliği. SAF.
//
// SORUN: Roxy'ye yerel saat + IANA adı gönderildiğinde sağlayıcı kendi (eski) tz verisiyle çeviriyordu; IANA 2026f ile
// değişen bölgelerde (Havana, Winnipeg, Casablanca …) doğum anı ±1 saat kayıyordu. Roxy'ye doğru UTC anı + "UTC" gönderilince
// dört uç (bodygraph, connection, penta, transit) doğru hesaplıyor (gece denetimi 18.11.2026; 1.222/1.222 aktivasyon).
//
// KURALLAR:
//   • Sağlayıcıya giden tarih/saat, sunucunun ortak IANA 2026f çekirdeğiyle çözdüğü UTC ANININ parçalarıdır (gün/ay/yıl
//     değişimi dahil); timezone "UTC". Koordinatlar DEĞİŞMEZ. Kayıtlarda ve arayüzde yerel doğum bilgisi aynen kalır.
//   • Kayıtlı harita (computed_result.timing.birthUtcIso) ile güncel çözüm aynı an değilse harita "bayat"tır: KENDİLİĞİNDEN
//     değişmez/silinmez, ama ondan yeni türetilmiş hesap (Dört Ok, ilişki, kişisel transit) yapılmaz ve önbellekten yeni
//     sonuç gibi dönmez.

import { resolveBirthLocalTime } from "./birthTimeResolution";

export const ROXY_UTC_TIMEZONE = "UTC" as const;

/** UTC anı → Roxy tarih/saat/saat dilimi parçaları (saniye hassasiyetli). Geçersiz an → null. */
export function roxyUtcParts(utcIso: string): { date: string; time: string; timezone: typeof ROXY_UTC_TIMEZONE } | null {
  const ms = Date.parse(utcIso);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(Math.floor(ms / 1000) * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19), timezone: ROXY_UTC_TIMEZONE };
}

/** Yerel doğum anı nesnesinin (koordinat/düğüm aynen) Roxy UTC kopyası. */
export function toRoxyUtcMoment<T extends { date: string; time: string; timezone: string }>(local: T, utcIso: string): T | null {
  const p = roxyUtcParts(utcIso);
  return p ? { ...local, date: p.date, time: p.time, timezone: p.timezone } : null;
}

/** Kayıtlı haritanın doğum anı (computed_result.timing.birthUtcIso); yoksa null. */
export function storedBirthUtcIso(computedResult: unknown): string | null {
  if (typeof computedResult !== "object" || computedResult === null) return null;
  const timing = (computedResult as { timing?: unknown }).timing;
  if (typeof timing !== "object" || timing === null) return null;
  const v = (timing as { birthUtcIso?: unknown }).birthUtcIso;
  return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
}

/** Kayıtlı haritanın doğum anı verilen UTC anıyla AYNI mı (milisaniye eşitliği; biçim farkı önemsiz). */
export function storedBirthUtcMatches(computedResult: unknown, utcIso: string): boolean {
  const s = storedBirthUtcIso(computedResult);
  return s !== null && Date.parse(s) === Date.parse(utcIso);
}

export type HdChartBirthUtcCheck =
  | { status: "current"; utcIso: string; offsetSeconds: number }
  | { status: "stale"; storedUtcIso: string; currentUtcIso: string }
  | { status: "unresolved"; reason: "gap" | "ambiguous" | "invalid" | "missing_stored" };

/** Kayıtlı harita (yerel girdi + saklı UTC) güncel IANA 2026f çözümüyle aynı doğum anını mı kullanıyor? */
export function checkChartBirthUtc(local: { date: string; time: string; timezone: string }, computedResult: unknown): HdChartBirthUtcCheck {
  const r = resolveBirthLocalTime(local.date, local.time, local.timezone);
  if (r.kind !== "ok") return { status: "unresolved", reason: r.kind };
  const stored = storedBirthUtcIso(computedResult);
  if (!stored) return { status: "unresolved", reason: "missing_stored" };
  if (Date.parse(stored) !== Date.parse(r.utcIso)) return { status: "stale", storedUtcIso: stored, currentUtcIso: r.utcIso };
  return { status: "current", utcIso: r.utcIso, offsetSeconds: r.offsetSeconds };
}

/** Bayat / çözülemeyen kayıtlı harita için kullanıcıya dönecek hata (yeni türetilmiş hesap YAPILMAZ). */
export function chartBirthUtcFailure(
  c: Exclude<HdChartBirthUtcCheck, { status: "current" }>,
  who?: string,
): { status: number; code: string; error: string } {
  const p = who ? `${who}: ` : "";
  if (c.status === "stale") {
    return {
      status: 409,
      code: "CHART_TIME_STALE",
      error: `${p}Bu Human Design analizi, saat dilimi verisi güncellenmeden önceki doğum anıyla hesaplanmış; güncel saat dilimi verisine göre doğum anı farklı. Yanlış sonuç üretmemek için bu analizden yeni hesap yapılmadı. Bireysel analizi yeniden oluşturun (eski analiz silinmez).`,
    };
  }
  if (c.reason === "gap") {
    return { status: 422, code: "BIRTH_TIME_GAP", error: `${p}Kayıtlı doğum saati, güncel saat dilimi verisine göre yaz saati geçişi nedeniyle hiç yaşanmamış görünüyor; hesap yapılmadı.` };
  }
  if (c.reason === "ambiguous") {
    return { status: 422, code: "BIRTH_TIME_AMBIGUOUS", error: `${p}Kayıtlı doğum saati, güncel saat dilimi verisine göre o gün iki kez yaşanmış (yaz saati geçişi); hangi anın kastedildiği kesin olmadığından hesap yapılmadı.` };
  }
  return { status: 422, code: "CHART_INCOMPLETE", error: `${p}Kayıtlı analizin doğum anı doğrulanamadı. Önce bireysel analizi yeniden oluşturun.` };
}
