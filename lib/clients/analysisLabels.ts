/**
 * Danışan analiz tipleri için tek merkezi kullanıcı etiketi.
 *
 * Ham enum değerleri ("chakra" / "planet") hiçbir arayüzde, Word/PDF
 * raporunda veya timeline'da doğrudan gösterilmemelidir. Tüm gösterim
 * katmanları bu fonksiyonu kullanır ki etiketler tutarlı kalsın.
 *
 * Bilinmeyen / boş bir tip gelirse ham değeri sızdırmak yerine güvenli
 * "Analiz" geri dönüşü verilir.
 */
export function analysisTypeLabel(type: string | null | undefined): string {
  if (type === "chakra") return "Çakra Analizi";
  if (type === "planet") return "Çakra-Gezegen Analizi";
  return "Analiz";
}
