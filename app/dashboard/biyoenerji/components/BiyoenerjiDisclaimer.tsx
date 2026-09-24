/**
 * BIO-006 — Sağlık/wellness bilgilendirme notu.
 *
 * Kasıtlı olarak DİKKAT ÇEKMEYEN: küçük punto, muted/secondary renk, normal ağırlık,
 * ikon/uyarı-kutusu YOK, kırmızı/sarı renk YOK. Premium tasarımla uyumlu ince dipnot.
 * Tek "ortak" konumdan (SectionShell footer + hub) beslenir; ekran ortasında tekrar
 * eden büyük uyarı OLUŞTURMAZ.
 */
export function BiyoenerjiDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      className={`px-1 text-[11px] font-medium leading-relaxed text-slate-400 ${className}`}
    >
      Biyoenerji ve bu bölümdeki tamamlayıcı/wellness içerikleri kişisel farkındalık ve
      destek amaçlıdır; tıbbi tanı veya tedavinin yerine geçmez.
    </p>
  );
}
