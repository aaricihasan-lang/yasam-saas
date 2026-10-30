// YENİ-P2-03 (2026-10-20): sonradan düzeltilen hesap kurallarından ÖNCE kaydedilmiş analizler için okuma anında "eski hesap
// sürümü" notu. Kayıt (snapshot) DEĞİŞMEZ, yeniden hesaplama YAPILMAZ; yalnız kayıttaki adaptör sürümü, ev sistemi ve doğum
// revizyonu (saat dilimi + saklı ofset) güncel kuralla karşılaştırılır. Saf modül (sunucu; ekran ve Word/PDF aynı listeyi kullanır).

import { resolveAstroBirthTime, type DstChoice } from "./birth/timeResolution";
import { TZ_BACKZONE_OVERLAY } from "./birth/tzBackzoneOverlay.generated";

export type LegacyMethodCode = "composite_angles" | "composite_whole_sign" | "whole_sign_sect" | "historical_timezone" | "upagraha_kala_vela";
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
