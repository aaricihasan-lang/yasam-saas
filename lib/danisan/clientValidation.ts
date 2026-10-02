/**
 * Danışan yazma doğrulaması (POST /api/clients, PATCH /api/clients/[id]) — saf, ortak.
 *
 * DY satış öncesi kapanış (VALIDATION-SERVER): istemci istek gövdesi manipüle edilse bile
 * bozuk danışan kaydı DB'ye yazılmaz.
 *  - İZİN LİSTESİ: yalnız UI'ın yazdığı alanlar (ad, soyad, telefon, dogum, gorusme, kan,
 *    mizac). Diğer anahtarlar (tenant_id, id, user_id, legacy kolonlar, bilinmeyen kolonlar,
 *    burc) yok sayılır — burç sunucuda doğumdan türetilir.
 *  - ad/soyad: oluşturmada zorunlu; güncellemede gönderildiyse boş olamaz.
 *  - dogum: gerçek takvim tarihi (YYYY-MM-DD) ve bugünden (İstanbul) sonra değil.
 *  - gorusme: gerçek takvim tarihi (mevcut ürün aralığı 1900–2100).
 *  - kan / mizac: kanonik değerler (UI seçenekleri ile birebir).
 * Boş string / null → alan temizlenir (null) — ad/soyad hariç.
 */
import { isValidBirthDate, isValidIsoDate } from "./dateValidation";

export const CLIENT_WRITABLE_FIELDS = ["ad", "soyad", "telefon", "dogum", "gorusme", "kan", "mizac"] as const;
export type ClientWritableField = (typeof CLIENT_WRITABLE_FIELDS)[number];

export const KAN_VALUES = ["A Rh+", "A Rh-", "B Rh+", "B Rh-", "AB Rh+", "AB Rh-", "0 Rh+", "0 Rh-"] as const;
export const MIZAC_VALUES = ["safra", "sovdavi", "dem", "balgam"] as const;
export const NAME_MAX_LENGTH = 120;
export const PHONE_MAX_LENGTH = 40;

export const CLIENT_VALIDATION_MESSAGES = {
  nameRequired: "Ad ve soyad gerekli.",
  nameTooLong: `Ad ve soyad en fazla ${NAME_MAX_LENGTH} karakter olabilir.`,
  phoneInvalid: `Telefon en fazla ${PHONE_MAX_LENGTH} karakter olabilir.`,
  birthInvalid: "Doğum tarihi geçerli bir takvim tarihi olmalı (GG.AA.YYYY) ve bugünden sonra olamaz.",
  meetingInvalid: "Görüşme tarihi geçerli bir takvim tarihi olmalı (GG.AA.YYYY).",
  kanInvalid: "Geçersiz kan grubu.",
  mizacInvalid: "Geçersiz mizaç.",
  noFields: "Güncellenecek alan yok.",
} as const;

export type ClientValidationResult =
  | { ok: true; fields: Partial<Record<ClientWritableField, string | null>> }
  | { ok: false; code: string; field: string; error: string };

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function fail(code: string, field: string, error: string): ClientValidationResult {
  return { ok: false, code, field, error };
}

/**
 * @param mode     "create" → ad/soyad zorunlu; "patch" → yalnız gönderilen alanlar.
 * @param todayIso İstanbul bugünü "YYYY-MM-DD" (doğum üst sınırı).
 */
export function validateClientWrite(
  body: Record<string, unknown> | null | undefined,
  mode: "create" | "patch",
  todayIso: string,
): ClientValidationResult {
  const src = body ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(src, k);
  const fields: Partial<Record<ClientWritableField, string | null>> = {};

  for (const k of ["ad", "soyad"] as const) {
    if (!has(k)) {
      if (mode === "create") return fail("NAME_REQUIRED", k, CLIENT_VALIDATION_MESSAGES.nameRequired);
      continue;
    }
    const v = src[k];
    if (typeof v !== "string" || !v.trim() || CONTROL_RE.test(v)) {
      return fail("NAME_REQUIRED", k, CLIENT_VALIDATION_MESSAGES.nameRequired);
    }
    if (v.trim().length > NAME_MAX_LENGTH) return fail("NAME_TOO_LONG", k, CLIENT_VALIDATION_MESSAGES.nameTooLong);
    fields[k] = v.trim();
  }

  const optionalText = (k: ClientWritableField): string | null | undefined => {
    if (!has(k)) return undefined;
    const v = src[k];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return "\u0000"; // tip dışı → aşağıda reddedilir
    const s = v.trim();
    return s === "" ? null : s;
  };

  const tel = optionalText("telefon");
  if (tel !== undefined) {
    if (tel !== null && (tel.length > PHONE_MAX_LENGTH || CONTROL_RE.test(tel))) {
      return fail("INVALID_PHONE", "telefon", CLIENT_VALIDATION_MESSAGES.phoneInvalid);
    }
    fields.telefon = tel;
  }

  const dogum = optionalText("dogum");
  if (dogum !== undefined) {
    if (dogum !== null && !isValidBirthDate(dogum, todayIso)) {
      return fail("INVALID_DATE", "dogum", CLIENT_VALIDATION_MESSAGES.birthInvalid);
    }
    fields.dogum = dogum;
  }

  const gorusme = optionalText("gorusme");
  if (gorusme !== undefined) {
    if (gorusme !== null && !isValidIsoDate(gorusme)) {
      return fail("INVALID_DATE", "gorusme", CLIENT_VALIDATION_MESSAGES.meetingInvalid);
    }
    fields.gorusme = gorusme;
  }

  const kan = optionalText("kan");
  if (kan !== undefined) {
    if (kan !== null && !(KAN_VALUES as readonly string[]).includes(kan)) {
      return fail("INVALID_FIELD", "kan", CLIENT_VALIDATION_MESSAGES.kanInvalid);
    }
    fields.kan = kan;
  }

  const mizac = optionalText("mizac");
  if (mizac !== undefined) {
    if (mizac !== null && !(MIZAC_VALUES as readonly string[]).includes(mizac)) {
      return fail("INVALID_FIELD", "mizac", CLIENT_VALIDATION_MESSAGES.mizacInvalid);
    }
    fields.mizac = mizac;
  }

  if (mode === "patch" && Object.keys(fields).length === 0) {
    return fail("NO_FIELDS", "body", CLIENT_VALIDATION_MESSAGES.noFields);
  }
  return { ok: true, fields };
}
