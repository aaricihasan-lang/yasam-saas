// Gökyüzü Atlası — PROFESYONEL EFEMERİS: sağlayıcı (sunucu tarafı hesaplama altyapısı) GÖVDE + İZDÜŞÜM (SAF; ağ çağrısı YOK).
//
// Uç: POST /astrology/planets — tek an, 14 cisim; gün başına 1 çağrı (00:00 UT). Gövde HD transit istemcisiyle aynı biçim
// ({ date, time, timezone: 0, latitude: 0, longitude: 0, nodeType }) — gözlemci konumu boylamı etkilemez (geosantrik).
// Saat ölçeği (sağlayıcı belgesi + 2026-10-24 kabul ölçümü): 1972–2030 arası girilen saat UTC, dışında UT1 kabul edilir. UTC ile UT1
// farkı < 0,9 s (Ay'da < 0,5″) → satır etiketi "00:00 UT" doğru kalır.
// Aylık uç (/astrology/planets/monthly) 12:00 UTC'dir (2026-10-31 ölçümü: 620 değerde 12:00 UT'ye ≤0,21″, 00:00'a 7°'ye kadar) ve
// yalnız boylam/retro verir → 00:00 UT tablosu için KULLANILMAZ; yalnız açıkça "12:00 UTC" etiketli görünüm için uygundur.
// Sağlayıcı hızı ±1 GÜN merkezi farktır (2026-10-31 ölçümü: 5 ondalıkta birebir) → anlık hız olarak kullanılmaz (accuracy.ts).

import type { EphemerisBody } from "./types";

export const PROVIDER_PLANETS_ENDPOINT = "/astrology/planets";
export const PROVIDER_ADAPTER_VERSION = "pro-ephemeris-planets-1";
/** Sağlayıcı belgesindeki tarih aralığı 1550-01-02 – 2650-01-22; efemeris yerel ΔT tablosuyla aynı 1600–2600'e sınırlanır. */
export const PROVIDER_MIN_YEAR = 1600;
export const PROVIDER_MAX_YEAR = 2600;
/** Bir istekte en çok kaç gün (= çağrı) — maliyet sınırı. */
export const PROVIDER_MAX_DAYS_PER_REQUEST = 31;

export type ProviderNodeType = "true" | "mean";
export type ProviderPlanetsBody = { date: string; time: "00:00:00"; timezone: 0; latitude: 0; longitude: 0; nodeType: ProviderNodeType };

export function providerDailyBody(date: string, nodeType: ProviderNodeType): ProviderPlanetsBody {
  return { date, time: "00:00:00", timezone: 0, latitude: 0, longitude: 0, nodeType };
}

const NAME: Readonly<Record<string, EphemerisBody | "south_node">> = {
  Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn",
  Uranus: "uranus", Neptune: "neptune", Pluto: "pluto", "North Node": "true_node", "South Node": "south_node",
};

export type ProviderPositions = Partial<Record<EphemerisBody, { lon: number; lat: number }>>;

/**
 * Yanıt → yalnız sayısal boylam/enlem. Kuzey düğüm, istenen düğüm türünün kimliğine (`true_node` / `mean_node`) yazılır.
 * Doğrulama: 10 gezegen + düğüm zorunlu; sonlu sayı; boylam [0,360); |enlem| ≤ 90; güney düğüm = kuzey + 180 (±1″).
 * Chiron / Lilith / metin alanları atılır.
 */
export function projectProviderPlanets(raw: unknown, nodeType: ProviderNodeType): { ok: true; positions: ProviderPositions } | { ok: false; error: string } {
  const list = (raw as { planets?: unknown } | null)?.planets;
  if (!Array.isArray(list)) return { ok: false, error: "planets dizisi yok" };
  const out: ProviderPositions = {};
  let south: number | null = null;
  for (const p of list) {
    const name = typeof (p as { name?: unknown })?.name === "string" ? NAME[(p as { name: string }).name] : undefined;
    if (!name) continue;
    const lon = (p as { longitude?: unknown }).longitude;
    const lat = (p as { latitude?: unknown }).latitude;
    if (typeof lon !== "number" || !Number.isFinite(lon) || lon < 0 || lon >= 360) return { ok: false, error: `${name}: boylam geçersiz` };
    if (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90) return { ok: false, error: `${name}: enlem geçersiz` };
    if (name === "south_node") {
      south = lon;
      continue;
    }
    const id: EphemerisBody = name === "true_node" ? (nodeType === "true" ? "true_node" : "mean_node") : name;
    out[id] = { lon, lat };
  }
  const nodeId: EphemerisBody = nodeType === "true" ? "true_node" : "mean_node";
  for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", nodeId] as const) {
    if (!out[b]) return { ok: false, error: `${b} eksik` };
  }
  if (south !== null) {
    const d = Math.abs(((((south - out[nodeId]!.lon - 180) % 360) + 540) % 360) - 180);
    if (d > 1 / 3600) return { ok: false, error: "düğüm karşıtlığı tutarsız" };
  }
  return { ok: true, positions: out };
}

/** Tarih aralığı için gereken sağlayıcı çağrısı (gün sayısı; önbellek isabeti hariç). */
export function providerCallEstimate(startDate: string, endDate: string): number {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Basit sınırlı LRU (süreç belleği; kalıcı önbellek / migration YOK). */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V): void {
    if (this.m.has(k)) this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  get size() {
    return this.m.size;
  }
}
