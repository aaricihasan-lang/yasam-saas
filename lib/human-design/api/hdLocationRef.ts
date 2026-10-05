// HD — Roxy konum araması sonucunun İMZALI referansı (server-only).
//
// Roxy /location/search sonucunda kalıcı bir kimlik yoktur. Seçilen sonucun tz + koordinatını
// istemciye GÜVENMEDEN hesaplama ucuna taşımak için sunucu, sonucu HMAC ile imzalar:
//   "rx1.<base64url(JSON)>.<hmac>"
// Hesaplama ucu imzayı doğrular; istemci tz/koordinatı değiştiremez. Sır yalnız server env'dedir
// (HD_LOCATION_REF_SECRET → RATE_LIMIT_SECRET → SUPABASE_SERVICE_ROLE_KEY); hiçbiri yoksa özellik
// KAPALI (fail-closed; sabit/varsayılan sır yok).

import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidIanaTimeZone } from "./birthTimeResolution";
import type { HdBirthLocation } from "./hdBirthLocation";
import type { RoxyCity } from "../providers/roxy/location";

const PREFIX = "rx1.";

function secret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = (env.HD_LOCATION_REF_SECRET || env.RATE_LIMIT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return s ? s : null;
}

function mac(key: string, payload: string): string {
  return createHmac("sha256", `hd-location-ref:${key}`).update(payload).digest("hex").slice(0, 32);
}

function slug(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** Roxy şehrinden deterministik, kararlı konum kimliği + etiket. */
export function roxyCityToLocation(c: RoxyCity): HdBirthLocation {
  const region = c.province && c.province !== c.city ? `${c.province}, ` : "";
  return {
    id: `rx-${slug(c.iso2 || c.country)}-${slug(c.province || "x")}-${slug(c.city)}`.slice(0, 64),
    label: `${c.city}, ${region}${c.country}`,
    timezone: c.timezone,
    latitude: c.latitude,
    longitude: c.longitude,
  };
}

export function signLocationRef(loc: HdBirthLocation, env?: NodeJS.ProcessEnv): string | null {
  const key = secret(env);
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify([loc.id, loc.label, loc.timezone, loc.latitude, loc.longitude]), "utf8").toString("base64url");
  return `${PREFIX}${payload}.${mac(key, payload)}`;
}

export function isLocationRef(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(PREFIX);
}

/** İmzayı doğrular; geçersiz/oynanmış/sırsız → null. */
export function verifyLocationRef(ref: unknown, env?: NodeJS.ProcessEnv): HdBirthLocation | null {
  if (!isLocationRef(ref) || ref.length > 1024) return null;
  const key = secret(env);
  if (!key) return null;
  const body = ref.slice(PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  const expected = mac(key, payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length !== 5) return null;
  const [id, label, tz, lat, lon] = arr as unknown[];
  if (typeof id !== "string" || typeof label !== "string" || typeof tz !== "string") return null;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || !isValidIanaTimeZone(tz)) return null;
  return { id, label, timezone: tz, latitude: lat, longitude: lon };
}
