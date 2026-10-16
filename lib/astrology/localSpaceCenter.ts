// Astroloji — Local Space MERKEZ ↔ otomatik yorum tutarlılığı (SAF; ekran + Word + PDF ortak).
//
// Kök neden (2026-10-16 doğrulandı): sağlayıcının /astrology/local-space ucunda TEK konum alanı vardır ve gönderilen
// konumu "doğum yeri" sayar. Yaşam bu alana seçilen merkezi (veya merkez seçilmediyse doğum yerini) gönderir; yanıt
// aynı koordinatı birthDetails olarak geri yansıtır (adaptör uyuşmazlığı reddeder) ve azimutlar O noktadan hesaplanır
// (astronomy-engine ile bağımsız doğrulandı). Yorum cümleleri ise sabit kalıptır: "<Cisim> hattınız, doğum yerinizden
// <yön> yönünü gösterir." → merkez doğum yerinden farklıysa ifade yanlış yere atıf yapar; yön ve anlam doğrudur.
//
// Çözüm: kayıtlı snapshot DEĞİŞMEZ. Yalnız sunumda, merkez doğum yerinden farklıysa kalıptaki yer atfı "seçilen
// merkezden (<ad>)" olarak gösterilir ve bunu AÇIKÇA söyleyen ayrı bir teknik not eklenir (sessiz değişiklik yok).

export type LocalSpaceCenter = {
  /** Kullanıcıya görünen merkez adı (seçilen konum etiketi; yoksa null). */
  label: string | null;
  latitude: number;
  longitude: number;
  /** true → merkez doğum yeriyle aynı (sağlayıcı kalıbı doğrudur, metin aynen gösterilir). */
  isBirthPlace: boolean;
};

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => typeof v === "object" && v !== null && !Array.isArray(v);
const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Sağlayıcı adaptörünün referans karşılaştırmasıyla aynı tolerans (~100 m). */
const SAME_PLACE_DEG = 1e-3;

/**
 * Hesaplamanın GERÇEK merkezi = teknik verideki reference (sağlayıcının hesapladığı nokta). Doğum yeri bilinmiyorsa
 * merkez, açık bir referans seçimi varsa doğum yeri DIŞI sayılır; aksi hâlde doğum yeri sayılır (metin aynen kalır).
 */
export function localSpaceCenter(technical: unknown, options: unknown, birth: { lat: number; lon: number } | null): LocalSpaceCenter | null {
  const ref = isObj(technical) && isObj(technical.reference) ? technical.reference : null;
  const la = fin(ref?.latitude);
  const lo = fin(ref?.longitude);
  if (la === null || lo === null) return null;
  const opts = isObj(options) ? options : {};
  const refOpt = isObj(opts.reference) ? opts.reference : null;
  const label = refOpt && typeof refOpt.label === "string" && refOpt.label.trim() ? refOpt.label.trim() : null;
  const isBirthPlace =
    birth && Number.isFinite(birth.lat) && Number.isFinite(birth.lon)
      ? Math.abs(la - birth.lat) <= SAME_PLACE_DEG && Math.abs(lo - birth.lon) <= SAME_PLACE_DEG
      : !(typeof opts.referenceLocationId === "string" && opts.referenceLocationId !== "");
  return { label, latitude: la, longitude: lo, isBirthPlace };
}

// "doğum yerinizden" / "doğum yerinden" (cümle başı büyük harf dahil). Yalnız bu yer atfı değişir.
const BIRTHPLACE_FROM = /([Dd])oğum yeri(?:niz)?den/g;

/** Merkez doğum yerinden farklıysa yorum kalıbındaki yer atfını seçilen merkeze bağlar; aksi hâlde metin AYNEN. */
export function localSpaceText(text: string, center: LocalSpaceCenter | null): string {
  if (!center || center.isBirthPlace) return text;
  const name = center.label ? ` (${center.label})` : "";
  return text.replace(BIRTHPLACE_FROM, (_m, d: string) => `${d === "D" ? "S" : "s"}eçilen merkezden${name}`);
}

const coordText = (la: number, lo: number) =>
  `${Math.abs(la).toLocaleString("tr-TR", { maximumFractionDigits: 4 })}° ${la >= 0 ? "K" : "G"}, ${Math.abs(lo).toLocaleString("tr-TR", { maximumFractionDigits: 4 })}° ${lo >= 0 ? "D" : "B"}`;

/** Ayrı teknik açıklama (yorumdan ayrı; yalnız merkez doğum yerinden farklıysa). */
export function localSpaceCenterNote(center: LocalSpaceCenter | null): string | null {
  if (!center || center.isBirthPlace) return null;
  const where = center.label ? `${center.label} (${coordText(center.latitude, center.longitude)})` : coordText(center.latitude, center.longitude);
  return (
    `Hesaplama merkezi: ${where} — doğum yeri değil. Yönler doğum anında bu seçilen merkezden hesaplanmıştır. ` +
    `Otomatik yorumun sabit “doğum yerinizden” kalıbı bu analizde seçilen merkezi ifade ettiği için metinlerde “seçilen merkezden” olarak gösterilmiştir; yön ve anlam değiştirilmemiştir.`
  );
}
