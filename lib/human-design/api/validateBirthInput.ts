// FAZ 5 / ADIM 2a — Human Design API. Katı doğum-girdisi doğrulama (SAF).
//
// Route/auth/DB YOK. Yalnız ham (unknown) girdiyi katı biçimde doğrular ve
// temiz bir HdBirthInput üretir (whitelist — arbitrary passthrough yok).

import type { HdBirthInput } from "../engine";

export type BirthInputErrorCode =
  | "INVALID_BODY"
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "INVALID_TIMEZONE"
  | "INVALID_LOCATION";

export type ValidateResult =
  | { ok: true; input: HdBirthInput }
  | { ok: false; code: BirthInputErrorCode; error: string };

const MIN_YEAR = 1800;
const MAX_YEAR = 2100;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Takvim geçerliliği: round-trip (Şubat 30 → ay taşar, eşleşmez).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, min] = s.split(":").map(Number);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

function isValidTimezone(tz: string): boolean {
  try {
    // Geçersiz IANA → RangeError.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Ham (unknown) girdiyi katı doğrular; temiz HdBirthInput veya hata döndürür. */
export function validateBirthInput(raw: unknown): ValidateResult {
  if (!isPlainObject(raw)) {
    return { ok: false, code: "INVALID_BODY", error: "İstek gövdesi geçerli bir nesne değil." };
  }

  const { date, time, timezone, location } = raw;

  if (typeof date !== "string" || !isValidDate(date)) {
    return {
      ok: false,
      code: "INVALID_DATE",
      error: `Geçersiz tarih. Beklenen YYYY-MM-DD (${MIN_YEAR}–${MAX_YEAR}).`,
    };
  }
  if (typeof time !== "string" || !isValidTime(time)) {
    return { ok: false, code: "INVALID_TIME", error: "Geçersiz saat. Beklenen HH:mm (00:00–23:59)." };
  }
  if (typeof timezone !== "string" || !isValidTimezone(timezone)) {
    return {
      ok: false,
      code: "INVALID_TIMEZONE",
      error: "Geçersiz IANA timezone (ör. Europe/Istanbul).",
    };
  }

  // location opsiyonel (engine yalnız timezone kullanır); yoksa {0,0}.
  let loc = { lat: 0, lon: 0 };
  if (location !== undefined) {
    if (!isPlainObject(location)) {
      return { ok: false, code: "INVALID_LOCATION", error: "location bir nesne olmalı." };
    }
    const { lat, lon } = location;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { ok: false, code: "INVALID_LOCATION", error: "lat, -90..90 aralığında bir sayı olmalı." };
    }
    if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return { ok: false, code: "INVALID_LOCATION", error: "lon, -180..180 aralığında bir sayı olmalı." };
    }
    loc = { lat, lon };
  }

  // Whitelist: yalnız 4 alan.
  return { ok: true, input: { date, time, timezone, location: loc } };
}
