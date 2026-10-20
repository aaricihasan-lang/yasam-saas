// ATL-P2-07 (2026-10-20): IANA standart saat öncesini bölgenin TEMSİLCİ şehrinin yerel ortalama saatiyle (LMT) modeller
// (ör. Europe/Berlin 1893-04-01 öncesi bütün Almanya için Berlin LMT +0:53:28; eski Alman şehirleri bugün Europe/Warsaw /
// Europe/Paris bölgesinde WMT / PMT). Doğum yeri temsilci şehirden uzaksa kayıt yerel saate göre tutulmuş olabilir → dakikalarca
// fark (München ~7 dk, Köln ~26 dk, Straßburg 1900 ~51 dk). Hesap DEĞİŞTİRİLMEZ (metodoloji kararı owner'da); yalnız açık uyarı.

/** Saklı ofset tarihsel ortalama saat (15 dk'nın katı değil) ve doğum yeri boylamının yerel ortalama saatinden > 60 sn farklı mı? */
export function representativeLmtNotice(r: { timeKnown?: unknown; utcOffsetSeconds?: unknown; longitude?: unknown } | null | undefined): { storedOffsetSeconds: number; localMeanOffsetSeconds: number; text: string } | null {
  if (!r || r.timeKnown !== true || typeof r.utcOffsetSeconds !== "number" || typeof r.longitude !== "number" || !Number.isFinite(r.longitude)) return null;
  const stored = r.utcOffsetSeconds;
  if (stored % 900 === 0) return null;
  const local = Math.round(r.longitude * 240);
  const diff = stored - local;
  if (Math.abs(diff) <= 60) return null;
  const fmt = (sec: number) => {
    const a = Math.abs(sec);
    const hm = `UTC${sec >= 0 ? "+" : "−"}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`;
    return a % 60 === 0 ? hm : `${hm}:${String(a % 60).padStart(2, "0")}`;
  };
  const minutes = Math.round(Math.abs(diff) / 60);
  return {
    storedOffsetSeconds: stored,
    localMeanOffsetSeconds: local,
    text: `Bu doğum tarihinde saat dilimi veritabanı bölgenin temsilci şehrinin yerel ortalama saatini kullanır (${fmt(stored)}); doğum yerinin boylamına göre yerel ortalama saat ${fmt(local)} (fark yaklaşık ${minutes} dk). O dönemde yerel saat uygulaması bölgeye göre değiştiğinden doğum kaydının hangi saate göre tutulduğunu doğrulayın; hesap kayıtlı ofsetle yapılır.`,
  };
}
