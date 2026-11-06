// D4 (06.11.2026) — Ev / Ofis Sayısı giriş doğrulaması (SAF; yalnız sunum/doğrulama).
// Kaynak yöntem DEĞİŞMEZ: Apartman No + Daire No → toplam → sadeleştirme (lib/numeroloji/place).
// Önceden alan, yazılan her rakam dışı karakteri SESSİZCE siliyordu ("12/3" → 123, "27B" → 27, "A-302" → 302)
// ve hesap adımları bu sayıyı kullanıcının girdisi gibi gösteriyordu. Kitapta harfli / bölü / tireli numara için
// kural yoktur → yeni formül icat EDİLMEZ: hesap yine yalnız rakamlarla yapılır, ama dönüşüm açıkça gösterilir.

/**
 * Kitapta numara uzunluğu için sınır YOK; bu yalnız TEKNİK doğruluk sınırıdır: iki 15 haneli sayının toplamı
 * JavaScript'in tam sayı aralığında (Number.MAX_SAFE_INTEGER ≈ 9×10^15) kalır. 16+ hanede toplam/sadeleştirme
 * hassasiyet kaybıyla yanlış kök, 22+ hanede NaN üretirdi.
 */
export const PLACE_NUMBER_MAX_DIGITS = 15;

export type PlaceNumberInput =
  | { status: "empty" }
  | { status: "noDigits"; raw: string }
  | { status: "tooLong"; raw: string }
  | { status: "zero"; raw: string }
  | { status: "ok"; raw: string; value: number; altered: boolean; ignored: string[] };

export function parsePlaceNumberInput(input: string): PlaceNumberInput {
  const raw = input.trim();
  if (!raw) return { status: "empty" };
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { status: "noDigits", raw };
  if (digits.replace(/^0+/, "").length > PLACE_NUMBER_MAX_DIGITS) return { status: "tooLong", raw };
  const value = Number(digits);
  if (!(value > 0)) return { status: "zero", raw };
  const ignored = [...new Set(raw.replace(/[\d\s]/g, "").split(""))];
  return { status: "ok", raw, value, altered: raw !== digits, ignored };
}

/** Kullanıcıya gösterilecek doğrulama mesajı (geçerli ve değiştirilmemiş girişte null). */
export function placeInputMessage(label: string, p: PlaceNumberInput): { tone: "error" | "info"; text: string } | null {
  switch (p.status) {
    case "noDigits":
      return { tone: "error", text: `${label} en az bir rakam içermeli.` };
    case "tooLong":
      return { tone: "error", text: `${label} en çok ${PLACE_NUMBER_MAX_DIGITS} haneli olabilir.` };
    case "zero":
      return { tone: "error", text: `${label} 0'dan büyük olmalı.` };
    case "ok":
      if (!p.altered) return null;
      return {
        tone: "info",
        text: `“${p.raw}” → ${p.value}: ${p.ignored.length ? p.ignored.map((c) => `“${c}”`).join(", ") : "boşluklar"} hesaba katılmaz, yalnız rakamlar kullanılır.`,
      };
    default:
      return null;
  }
}

/** İşyeri adındaki rakam grupları (harf tablosunda yer almaz; hesaba katılmaz). */
export function businessNameDigitGroups(name: string): string[] {
  return name.match(/\d+/g) ?? [];
}
