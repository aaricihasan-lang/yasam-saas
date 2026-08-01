/**
 * Faz 1 / P3 — Oturum limiti yönetimi (admin tarafı).
 *
 * Limit DÜŞÜRME davranışı: admin bir limiti mevcut aktif oturum sayısının altına
 * indirirse, fazla oturumlar DETERMİNİSTİK biçimde (EN ESKİ ÖNCE) kapatılır — ancak
 * yalnız ADMIN AÇIK ONAY verdiğinde (confirmExcessRevocation). Bu dosya hangi
 * oturumların kapatılacağını hesaplayan SAF fonksiyonu içerir (harness'lenebilir);
 * gerçek revoke + audit route katmanında yapılır.
 *
 * Birleşik algoritma (deterministik):
 *   1) Önce her cihaz türü için per-device fazlalık (en eski önce) işaretlenir.
 *   2) Kalanlar arasında toplam limit hâlâ aşılıyorsa en eskiler işaretlenir.
 * Sıralama: created_at ASC, ardından id ASC (kararlı).
 * Semantik: -1 sınırsız · 0 hepsi kapanır (yasak) · N en fazla N kalır.
 */
import {
  normalizeLimit,
  UNLIMITED,
  DEVICE_TYPES,
  type DeviceType,
} from "@/lib/auth/sessionLimits";

export type ActiveSessionRow = {
  id: string;
  platform: string | null;
  created_at: string;
};

export type SessionLimits = {
  total: number;
  desktop: number;
  mobile: number;
  tablet: number;
  unknown: number;
};

export type ExcessRevokePlan = {
  toRevoke: string[];
  total: number;
  byDevice: Record<DeviceType, number>;
};

function deviceOf(platform: string | null): DeviceType {
  const v = String(platform ?? "desktop");
  return (DEVICE_TYPES as readonly string[]).includes(v) ? (v as DeviceType) : "desktop";
}

/**
 * Yeni limitler altında kapatılması gereken fazla oturumları hesaplar (saf,
 * deterministik). Aktif oturum listesi + hedef limitler verilir; kapatılacak
 * session id'leri (en eski önce) döner.
 */
export function computeExcessSessionsToRevoke(
  active: ActiveSessionRow[],
  limits: SessionLimits,
): ExcessRevokePlan {
  const sorted = [...active].sort((a, b) => {
    const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (t !== 0) return t;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const revoke = new Set<string>();
  const byDevice: Record<DeviceType, number> = {
    desktop: 0,
    mobile: 0,
    tablet: 0,
    unknown: 0,
  };

  // 1) Per-device fazlalık (en eski önce; lim=0 → hepsi, -1 → atla).
  for (const dt of DEVICE_TYPES) {
    const lim = normalizeLimit(limits[dt]);
    if (lim === UNLIMITED) continue;
    const ofType = sorted.filter((s) => deviceOf(s.platform) === dt);
    const excess = Math.max(0, ofType.length - lim);
    for (let i = 0; i < excess; i++) {
      revoke.add(ofType[i].id);
      byDevice[dt] += 1;
    }
  }

  // 2) Toplam fazlalık (kalanlar arasında en eski önce).
  const totalLim = normalizeLimit(limits.total);
  if (totalLim !== UNLIMITED) {
    const remaining = sorted.filter((s) => !revoke.has(s.id));
    const excessTotal = Math.max(0, remaining.length - totalLim);
    for (let i = 0; i < excessTotal; i++) revoke.add(remaining[i].id);
  }

  const toRevoke = sorted.filter((s) => revoke.has(s.id)).map((s) => s.id);
  return { toRevoke, total: toRevoke.length, byDevice };
}
