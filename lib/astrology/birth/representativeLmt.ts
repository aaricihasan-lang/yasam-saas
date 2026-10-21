// ATL-P2-07 (2026-10-20): IANA standart saat öncesini bölgenin TEMSİLCİ şehrinin yerel ortalama saatiyle (LMT) modeller
// (ör. Europe/Berlin 1893-04-01 öncesi bütün Almanya için Berlin LMT +0:53:28; eski Alman şehirleri bugün Europe/Warsaw /
// Europe/Paris bölgesinde WMT / PMT). Doğum yeri temsilci şehirden uzaksa kayıt yerel saate göre tutulmuş olabilir → dakikalarca
// fark (München ~7 dk, Köln ~26 dk). Hesap DEĞİŞTİRİLMEZ (metodoloji kararı owner'da); yalnız açık uyarı.
//
// ATL-P2-07 metin düzeltmesi (2026-10-21): 1893-04-01 (RGBl. 1893 S. 93) → devir arası KESİN Alman yönetimindeki şehirlerde
// (germanLegalTime.ts) o dönemin yasal saati yerel ortalama saat DEĞİL, Orta Avrupa Saati (1916–1918 / 1940–1944 yazları
// Orta Avrupa Yaz Saati) idi → uyarı bu durumda yasal saati söyler ve saklı ofset yasal saatten farklıysa (15 dk katı olsa da,
// ör. Straßburg 1912 UTC+00:00, Breslau 1920 UTC+02:00) gösterilir. Hesap yine DEĞİŞMEZ. 1893 öncesi metin aynen korunur.

import { resolveAstroBirthTime, type DstChoice } from "./timeResolution";
import { germanLegalTimeLocation, inGermanLegalTimeWindow, GERMAN_LEGAL_TIME_START_UTC_MS } from "./germanLegalTime";

type NoticeInput = {
  timeKnown?: unknown;
  utcOffsetSeconds?: unknown;
  longitude?: unknown;
  birthDate?: unknown;
  birthTime?: unknown;
  locationId?: unknown;
  timezone?: unknown;
  dstChoice?: unknown;
};

export type RepresentativeLmtNotice = { storedOffsetSeconds: number; localMeanOffsetSeconds: number; legalOffsetSeconds?: number; text: string };

const fmt = (sec: number) => {
  const a = Math.abs(sec);
  const hm = `UTC${sec >= 0 ? "+" : "−"}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`;
  return a % 60 === 0 ? hm : `${hm}:${String(a % 60).padStart(2, "0")}`;
};

/**
 * Doğum anında konum KESİN Alman yönetimindeyse o anın Alman yasal saati ofseti (Europe/Berlin kuralları), değilse null.
 * Doğum anı Alman yasal saatiyle yorumlanır (kayıt o saatle tutulmuş olmalıdır).
 */
export function germanLegalOffsetAt(r: NoticeInput): number | null {
  const loc = germanLegalTimeLocation(r.locationId, r.timezone);
  if (!loc || typeof r.birthDate !== "string" || typeof r.birthTime !== "string") return null;
  const choice: DstChoice = r.dstChoice === "earlier" || r.dstChoice === "later" ? r.dstChoice : "auto";
  const res = resolveAstroBirthTime(r.birthDate, r.birthTime, "Europe/Berlin", choice);
  let utcMs: number;
  let legal: number;
  if (res.kind === "ok") {
    utcMs = Date.parse(res.utcIso);
    legal = res.offsetSeconds;
    // Berlin'in kendi LMT→MEZ geçişi 1893-03-31T23:06:32Z; yasa 23:00:00Z'de (1 Nisan 00:00 MEZ) yürürlükte → bu 6,5 dk MEZ.
    if (legal !== 3600 && legal !== 7200) {
      const asMez = Date.parse(`${r.birthDate}T${r.birthTime.length === 5 ? `${r.birthTime}:00` : r.birthTime}Z`) - 3_600_000;
      if (asMez < GERMAN_LEGAL_TIME_START_UTC_MS) return null;
      utcMs = asMez;
      legal = 3600;
    }
  } else if (res.kind === "gap") {
    // Yalnız 1893-04-01 00:00–00:06:31 (Berlin LMT→MEZ boşluğu) yasal olarak MEZ'dir; diğer boşluklar yasal saatte de yoktur.
    if (r.birthDate !== "1893-04-01") return null;
    utcMs = Date.parse(`${r.birthDate}T${r.birthTime.length === 5 ? `${r.birthTime}:00` : r.birthTime}Z`) - 3_600_000;
    legal = 3600;
  } else {
    return null;
  }
  return inGermanLegalTimeWindow(loc.cls, utcMs) ? legal : null;
}

/** Saklı ofset tarihsel ortalama saat (15 dk'nın katı değil) ve doğum yeri boylamının yerel ortalama saatinden > 60 sn farklı mı? */
export function representativeLmtNotice(r: NoticeInput | null | undefined): RepresentativeLmtNotice | null {
  if (!r || r.timeKnown !== true || typeof r.utcOffsetSeconds !== "number" || typeof r.longitude !== "number" || !Number.isFinite(r.longitude)) return null;
  const stored = r.utcOffsetSeconds;
  const local = Math.round(r.longitude * 240);
  const legal = germanLegalOffsetAt(r);
  if (legal !== null) {
    if (stored === legal) return null;
    const minutes = Math.round(Math.abs(stored - legal) / 60);
    const zone = legal === 7200 ? "Orta Avrupa Yaz Saati" : "Orta Avrupa Saati";
    return {
      storedOffsetSeconds: stored,
      localMeanOffsetSeconds: local,
      legalOffsetSeconds: legal,
      text: `Bu doğum tarihinde doğum yeri Alman yönetimindeydi; 1 Nisan 1893'ten itibaren yasal saat yerel ortalama saat değil, Orta Avrupa Saati'ydi (bu an için ${zone}, ${fmt(legal)}). Saat dilimi veritabanı bu tarih için doğum yerinin bugünkü bölgesinin o dönemki saatini kullanır (${fmt(stored)}; fark yaklaşık ${minutes} dk). Doğum kaydının yasal saate göre tutulduğunu doğrulayın; hesap kayıtlı ofsetle yapılır.`,
    };
  }
  if (stored % 900 === 0) return null;
  const diff = stored - local;
  if (Math.abs(diff) <= 60) return null;
  const minutes = Math.round(Math.abs(diff) / 60);
  return {
    storedOffsetSeconds: stored,
    localMeanOffsetSeconds: local,
    text: `Bu doğum tarihinde saat dilimi veritabanı bölgenin temsilci şehrinin yerel ortalama saatini kullanır (${fmt(stored)}); doğum yerinin boylamına göre yerel ortalama saat ${fmt(local)} (fark yaklaşık ${minutes} dk). O dönemde yerel saat uygulaması bölgeye göre değiştiğinden doğum kaydının hangi saate göre tutulduğunu doğrulayın; hesap kayıtlı ofsetle yapılır.`,
  };
}
