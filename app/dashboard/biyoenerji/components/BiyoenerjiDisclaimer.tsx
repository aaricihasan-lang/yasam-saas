/**
 * BIO-006 — Sağlık/wellness bilgilendirme notu.
 *
 * Kasıtlı olarak DİKKAT ÇEKMEYEN: küçük punto (12px), okunur muted renk (slate-500, AA kontrast), normal ağırlık,
 * ikon/uyarı-kutusu YOK, kırmızı/sarı renk YOK. Premium tasarımla uyumlu ince dipnot.
 * Tek "ortak" konumdan (SectionShell footer + hub) beslenir; ekran ortasında tekrar
 * eden büyük uyarı OLUŞTURMAZ.
 */
export function BiyoenerjiDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      className={`px-1 text-[12px] font-medium leading-relaxed text-slate-500 ${className}`}
    >
      Biyoenerji ve bu bölümdeki tamamlayıcı/wellness içerikleri kişisel farkındalık ve
      destek amaçlıdır; tıbbi tanı veya tedavinin yerine geçmez.
    </p>
  );
}
