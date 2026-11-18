// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Yerel doğum zamanı -> UTC dönüşümü.
//
// HD-TZ (18.11.2026): ofset ortak IANA 2026f çekirdeğinden (lib/time/tzdb + 1970 öncesi backzone) — HD doğum anı çözümüyle
// (api/birthTimeResolution) AYNI kaynak ve AYNI politika. Eski Intl iki-geçişli yöntem DST boşluğunda saati sessizce kabul
// ediyor, çakışmada tutarsız seçim yapıyor ve LMT ofsetinin saniyesini dakikaya yuvarlıyordu; artık:
//   • boşluk (hiç yaşanmamış yerel saat) ve çakışma (iki kez yaşanmış saat) → hata (sessiz seçim YOK),
//   • geçersiz tarih / saat / saat dilimi → hata,
//   • tarihsel ofset saniye hassasiyetli.

import type { HdBirthInput } from "./types";
import { resolveBirthLocalTime } from "../api/birthTimeResolution";

/** Yerel saat o saat diliminde hiç yaşanmamış ya da iki kez yaşanmış: hesap yapılmaz. */
export class HdLocalTimeError extends Error {
  constructor(
    readonly kind: "gap" | "ambiguous" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "HdLocalTimeError";
  }
}

/**
 * Yerel doğum tarih/saatini (HH:mm veya HH:mm:ss), verilen IANA timezone'a göre UTC'ye çevirir.
 * Boşluk, çakışma ve geçersiz girdi HdLocalTimeError fırlatır (sessiz seçim yapılmaz).
 */
export function localDateTimeToUtc(input: HdBirthInput): Date {
  const r = resolveBirthLocalTime(input.date, input.time, input.timezone);
  if (r.kind === "ok") return new Date(r.utcIso);
  if (r.kind === "gap") throw new HdLocalTimeError("gap", `Yerel saat hiç yaşanmamış (yaz saati boşluğu): "${input.date} ${input.time}"`);
  if (r.kind === "ambiguous") throw new HdLocalTimeError("ambiguous", `Yerel saat iki kez yaşanmış (yaz saati çakışması): "${input.date} ${input.time}"`);
  throw new HdLocalTimeError("invalid", `Geçersiz tarih/saat/saat dilimi: "${input.date} ${input.time}"`);
}
