// Astroloji — doğum profili girdisi doğrulama + çözümleme (SAF; konum çözücü enjekte edilir).
//
// İstemci yalnız KİMLİK + yerel değerleri gönderir; IANA tz + koordinat SUNUCUDA konum kimliğinden
// çözülür (istemcinin tz/koordinatına güvenilmez). UTC anı ve ofset sunucuda hesaplanır.
// Saat bilinmiyorsa: birth_time NULL, time_accuracy 'unknown'; UTC/ofset yerel 12:00 için
// hesaplanır (sağlayıcı sözleşmesi: "Use 12:00:00 if unknown") ve görünümde saat-bağımlı
// değerler (evler, yükselen, MC, ev yerleşimleri) gösterilmez.

import {
  normalizeTime,
  isValidIsoDate,
  resolveAstroBirthTime,
  type DstChoice,
} from "./timeResolution";

export const TIME_ACCURACY_VALUES = ["exact_record", "family_memory", "approximate", "rectified", "unknown"] as const;
export type TimeAccuracy = (typeof TIME_ACCURACY_VALUES)[number];

export const TIME_ACCURACY_LABELS: Record<TimeAccuracy, string> = {
  exact_record: "Resmî kayıt (kesin)",
  family_memory: "Aile / hatıra beyanı",
  approximate: "Yaklaşık",
  rectified: "Rektifiye edilmiş",
  unknown: "Bilinmiyor",
};

export type ResolvedLocation = { id: string; label: string; timezone: string; latitude: number; longitude: number };
export type LocationResolver = (id: unknown) => ResolvedLocation | null;

export type BirthDataInput = {
  birthDate: string;
  birthTime: string | null; // HH:mm:ss (saat biliniyorsa)
  timeKnown: boolean;
  timeAccuracy: TimeAccuracy;
  location: ResolvedLocation;
  dstChoice: DstChoice;
  utcOffsetSeconds: number;
  birthUtcIso: string;
};

export type BirthDataError = {
  status: 400 | 422;
  code: string;
  error: string;
  dstOptions?: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[];
};

// Kabul edilen yıl aralığı 1550–2100 (sabit). Alt sınır sağlayıcı efemeris aralığından (1550–2650) gelir; üst sınır
// sabit 2100'dür — "bugün+1 yıl" gibi göreli bir doğum üst sınırı UYGULANMAZ, gelecek tarihli kayıt kabul edilir
// (YENİ-P3-04: yalnız yorum düzeltildi; sınırın daraltılması owner kararıdır).
const MIN_YEAR = 1550;
const MAX_YEAR = 2100;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

export function parseBirthData(
  body: Record<string, unknown>,
  resolveLocation: LocationResolver,
): { ok: true; value: BirthDataInput } | { ok: false; err: BirthDataError } {
  const birthDate = str(body.birthDate, 10);
  if (!birthDate || !isValidIsoDate(birthDate)) {
    return { ok: false, err: { status: 400, code: "INVALID_BIRTH_DATE", error: "Doğum tarihi YYYY-AA-GG biçiminde olmalıdır." } };
  }
  const year = Number(birthDate.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return { ok: false, err: { status: 422, code: "BIRTH_DATE_RANGE", error: `Doğum tarihi ${MIN_YEAR}–${MAX_YEAR} aralığında olmalıdır.` } };
  }

  if (typeof body.timeKnown !== "boolean") {
    return { ok: false, err: { status: 400, code: "INVALID_TIME_KNOWN", error: "Doğum saatinin bilinip bilinmediği belirtilmelidir." } };
  }
  const timeKnown = body.timeKnown;
  let birthTime: string | null = null;
  if (timeKnown) {
    const raw = str(body.birthTime, 8);
    birthTime = raw ? normalizeTime(raw) : null;
    if (!birthTime) {
      return { ok: false, err: { status: 400, code: "INVALID_BIRTH_TIME", error: "Doğum saati SS:DD biçiminde olmalıdır." } };
    }
  }

  const accRaw = typeof body.timeAccuracy === "string" ? body.timeAccuracy : timeKnown ? "" : "unknown";
  if (!(TIME_ACCURACY_VALUES as readonly string[]).includes(accRaw)) {
    return { ok: false, err: { status: 400, code: "INVALID_TIME_ACCURACY", error: "Saat doğruluğu seçilmelidir." } };
  }
  const timeAccuracy = accRaw as TimeAccuracy;
  if (!timeKnown && timeAccuracy !== "unknown") {
    return { ok: false, err: { status: 400, code: "INVALID_TIME_ACCURACY", error: "Saat bilinmiyorsa doğruluk 'Bilinmiyor' olmalıdır." } };
  }
  if (timeKnown && timeAccuracy === "unknown") {
    return { ok: false, err: { status: 400, code: "INVALID_TIME_ACCURACY", error: "Saat girildiyse doğruluk seviyesi 'Bilinmiyor' olamaz." } };
  }

  const dstRaw = body.dstChoice ?? "auto";
  if (dstRaw !== "auto" && dstRaw !== "earlier" && dstRaw !== "later") {
    return { ok: false, err: { status: 400, code: "INVALID_DST_CHOICE", error: "Geçersiz yaz saati seçimi." } };
  }
  const dstChoice = dstRaw as DstChoice;

  const location = resolveLocation(body.locationId);
  if (!location) {
    return { ok: false, err: { status: 422, code: "LOCATION_REQUIRED", error: "Doğum yeri listeden seçilmelidir. Saat dilimi bilinmeden hesaplama yapılmaz." } };
  }

  const t = resolveAstroBirthTime(birthDate, birthTime ?? "12:00:00", location.timezone, dstChoice, location.id);
  if (t.kind === "invalid") {
    return { ok: false, err: { status: 400, code: "INVALID_BIRTH_DATA", error: "Doğum tarihi/saati geçersiz." } };
  }
  if (t.kind === "gap") {
    return {
      ok: false,
      err: {
        status: 422,
        code: "BIRTH_TIME_NONEXISTENT",
        error: "Bu yerel saat, saat dilimi veya yaz saati değişikliği nedeniyle o gün hiç yaşanmamıştır. Lütfen doğum saatini kontrol edin.",
      },
    };
  }
  if (t.kind === "ambiguous") {
    return {
      ok: false,
      err: {
        status: 422,
        code: "BIRTH_TIME_AMBIGUOUS",
        error: "Bu yerel saat, saat dilimi veya yaz saati değişikliği nedeniyle iki kez yaşanmıştır. Hangi anın kastedildiğini seçin.",
        dstOptions: t.options,
      },
    };
  }

  return {
    ok: true,
    value: {
      birthDate,
      birthTime,
      timeKnown,
      timeAccuracy,
      location,
      dstChoice,
      utcOffsetSeconds: t.offsetSeconds,
      birthUtcIso: t.utcIso,
    },
  };
}

export function parseProfileLabel(v: unknown): string | null {
  return str(v, 120);
}

export function parseChangeNote(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return str(v, 500);
}
