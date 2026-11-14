// YENİ-P2-03 (2026-10-20): sonradan düzeltilen hesap kurallarından ÖNCE kaydedilmiş analizler için okuma anında "eski hesap
// sürümü" notu. Kayıt (snapshot) DEĞİŞMEZ, yeniden hesaplama YAPILMAZ; yalnız kayıttaki adaptör sürümü, ev sistemi ve doğum
// revizyonu (saat dilimi + saklı ofset) güncel kuralla karşılaştırılır. Saf modül (sunucu; ekran ve Word/PDF aynı listeyi kullanır).

import { resolveAstroBirthTime, type DstChoice } from "./birth/timeResolution";
import { TZ_BACKZONE_OVERLAY } from "./birth/tzBackzoneOverlay.generated";

export type LegacyMethodCode = "composite_angles" | "composite_whole_sign" | "whole_sign_sect" | "historical_timezone" | "upagraha_kala_vela" | "upagraha_mandi" | "dashakoot_rasi" | "kp_horary_day_lord";
export type LegacyMethodNote = { code: LegacyMethodCode; text: string };

type RevisionLike = { birthDate?: unknown; birthTime?: unknown; timeKnown?: unknown; timezone?: unknown; dstChoice?: unknown; utcOffsetSeconds?: unknown } | null | undefined;

const WHOLE_SIGN_SECT_LEGACY = new Set(["astro-roxy-natal-1", "astro-roxy-solar-return-1", "astro-roxy-lunar-return-1"]);

function fmtOffset(sec: number): string {
  const a = Math.abs(sec);
  const hm = `UTC${sec >= 0 ? "+" : "−"}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`;
  return a % 60 === 0 ? hm : `${hm}:${String(a % 60).padStart(2, "0")}`;
}

/** Revizyonun saklı ofseti, güncel tarihsel saat dilimi tablosuyla (ATL-P1-01 / #471) çözülen ofsetten farklı mı? */
export function staleTimezoneOffset(r: RevisionLike): { stored: number; current: number } | null {
  if (!r || r.timeKnown !== true || typeof r.timezone !== "string" || !TZ_BACKZONE_OVERLAY[r.timezone]) return null;
  if (typeof r.birthDate !== "string" || typeof r.birthTime !== "string" || typeof r.utcOffsetSeconds !== "number") return null;
  const choice = r.dstChoice === "earlier" || r.dstChoice === "later" ? (r.dstChoice as DstChoice) : "auto";
  const res = resolveAstroBirthTime(r.birthDate, r.birthTime, r.timezone, choice);
  if (res.kind !== "ok") return null;
  return res.offsetSeconds !== r.utcOffsetSeconds ? { stored: r.utcOffsetSeconds, current: res.offsetSeconds } : null;
}

/** Yeni analiz ekranı (güncel revizyon) uyarı metni. */
export function staleTimezoneText(tz: { stored: number; current: number }): string {
  return `Tarihsel saat dilimi tablosu güncellendi: bu doğum için kayıtlı ofset ${fmtOffset(tz.stored)}, güncel tabloya göre ${fmtOffset(tz.current)}. Yanlış sonuç üretilmemesi için bu revizyonla yeni hesaplama yapılmaz; doğum bilgilerini doğrulayıp yeniden kaydedin (yeni revizyon). Kayıtlı eski analizler değişmez.`;
}

/**
 * Owner kararı (2026-10-21): saklı ofseti güncel tarihsel saat dilimi kuralıyla KESİN çelişen revizyonla yeni hesaplama
 * başlatılmaz (planlama aşamasında; önbellek sorgusu ve sağlayıcı çağrısından ÖNCE). Belirsiz (gap/ambiguous), saati bilinmeyen,
 * tablo dışı ve eşit ofsetli revizyonlar ENGELLENMEZ (staleTimezoneOffset null döner).
 */
export const STALE_TIMEZONE_BLOCK_CODE = "TIMEZONE_REVISION_STALE";
export function staleTimezoneBlockText(techniqueLabel: string, who: "danışanın" | "karşı tarafın", revisionNo: number, tz: { stored: number; current: number }): string {
  return `${techniqueLabel}: ${who} doğum profili revizyonu (rev ${revisionNo}) güncel tarihsel saat dilimi kuralına göre yanlış ofsetle kaydedilmiş (kayıtlı ${fmtOffset(tz.stored)}, doğrusu ${fmtOffset(tz.current)}). Yanlış sonuç üretilmemesi için hesaplama başlatılmadı. Doğum bilgilerini doğrulayıp profili yeniden kaydedin (yeni revizyon); kayıtlı eski analizler değişmez.`;
}

export function legacyMethodNotes(input: { technique: string; adapterVersion: unknown; houseSystem: unknown; revisions: { who: string; revision: RevisionLike }[] }): LegacyMethodNote[] {
  const out: LegacyMethodNote[] = [];
  const av = typeof input.adapterVersion === "string" ? input.adapterVersion : "";
  if (input.technique === "western.composite" && av === "astro-roxy-composite-1")
    out.push({ code: "composite_angles", text: "Kompozit ASC / MC ve ev kuralı bu kayıttan sonra düzeltildi (bazı çiftlerde ASC ve evler 180° ters olabiliyordu)." });
  if (input.technique === "western.composite" && input.houseSystem === "whole-sign" && av !== "astro-roxy-composite-ws-3")
    out.push({ code: "composite_whole_sign", text: "Bütün-burç kompozit ev başlangıçları bu kayıttan sonra düzeltildi (evler burç ortasından başlayabiliyor, bazı gezegenler bir ev kayık görünebiliyordu)." });
  if (input.houseSystem === "whole-sign" && WHOLE_SIGN_SECT_LEGACY.has(av))
    out.push({ code: "whole_sign_sect", text: "Bütün-burç gündüz/gece (sect) ve Şans Noktası kuralı bu kayıttan sonra düzeltildi." });
  // ATL-B01 (30.10.2026): -1 sürümlü upagraha kayıtlarında 4 zaman tabanlı nokta servisin sırasıyla (yöneticisiz parça Satürn'den hemen sonra).
  if (input.technique === "vedic.upagraha" && av === "astro-roxy-vedic-upagraha-1")
    out.push({ code: "upagraha_kala_vela", text: "Kala, Mrityu, Ardhaprahara ve Yamaghantaka bu kayıttan sonra BPHS sırasıyla (yöneticisiz parça sonda) yeniden tanımlandı; bu kayıtta haftanın gününe ve gündüz/gece doğumuna göre bu dört noktadan bazıları gün ya da gece süresinin 1/8'i kadar sonraki parçanın başlangıcını gösterebilir (boylamda çoğunlukla 20° civarı). Gulika, Mandi ve Güneş türevli beş nokta değişmedi." });
  // ATL-B01 F1 (07.11.2026): -1 ve -2 sürümlü upagraha kayıtlarında Mandi eski hesap kuralıyla (klasik ghati tablosu anından 1/8 önce).
  if (input.technique === "vedic.upagraha" && (av === "astro-roxy-vedic-upagraha-1" || av === "astro-roxy-vedic-upagraha-2"))
    out.push({ code: "upagraha_mandi", text: "Mandi bu kayıttan sonra Uttara Kalamrita (şl. 7) ve Phaladeepika (25. bölüm) ghati tablosundaki anın kendisi olarak hesaplanıyor; bu kayıttaki Mandi, eski hesap kuralıyla o andan gün ya da gece süresinin 1/8'i önce yükselen derecedir. Değer kayıt anındaki gibidir, değiştirilmedi; klasik Mandi için yeniden hesaplayıp yeni kayıt oluşturun." });
  // ATL-B02 (07.11.2026): -1 sürümlü On Porutham kayıtlarında Rasi servisin kuralıyla (6., 8., 12. sayım karşılanmaz).
  if (input.technique === "vedic.dashakoot" && av === "astro-roxy-vedic-dashakoot-1")
    out.push({ code: "dashakoot_rasi", text: "Rasi kriteri bu kayıttan sonra Kalaprakasika (Bölüm XIII, s. 73–74) kuralıyla hesaplanıyor: gelinden damada 2.–6. sayım karşılanmaz (2. sayımda damadın burcu çift burçsa ve 6. sayımda kaynağın listelediği altı burç çiftinde karşılanır), 7. ve 8.–12. sayım karşılanır, aynı burç belirsizdir. Bu kayıttaki Rasi sonucu, toplam ve servis değerlendirmesi hesap servisinin kuralıyladır (6., 8. ve 12. sayım karşılanmaz, diğerleri karşılanır). Değerler kayıt anındaki gibidir, değiştirilmedi; yeni yöntem için yeniden hesaplayıp yeni kayıt oluşturun." });
  // ATL-B03 (14.11.2026): -1 sürümlü KP horary kayıtlarında soru anı sağlayıcıya UTC (saat dilimi 0) olarak gönderilmişti.
  if (input.technique === "kp.horary" && av === "astro-roxy-kp-horary-1")
    out.push({ code: "kp_horary_day_lord", text: "Ruling planets'ın gün lordu bu kayıttan sonra değerlendirme yerinin yerel gününe (gün doğumu kuralı) göre hesaplanıyor; bu kayıtta soru anı hesaplama hizmetine UTC olarak gönderilmişti. Yerel tarih UTC tarihinden farklıysa ya da an yerel gün doğumuna yakınsa bu kayıttaki gün lordu ve ruling planets kümesi farklı olabilir. Gezegen konumları, ev başlangıçları, Lagna ve significator'lar aynı andır, değişmez. Değerler kayıt anındaki gibidir, değiştirilmedi; güncel kural için yeniden hesaplayıp yeni kayıt oluşturun." });
  for (const { who, revision } of input.revisions) {
    const tz = staleTimezoneOffset(revision);
    if (tz)
      out.push({
        code: "historical_timezone",
        text: `Tarihsel saat dilimi tablosu bu kayıttan sonra güncellendi: ${who} doğum anı için kayıttaki ofset ${fmtOffset(tz.stored)}, güncel tabloya göre ${fmtOffset(tz.current)}. Güncel ofsetle hesap için doğum bilgileri yeniden kaydedilmelidir (yeni revizyon).`,
      });
  }
  return out;
}

export { LEGACY_METHOD_LEAD } from "./legacyMethodText";
