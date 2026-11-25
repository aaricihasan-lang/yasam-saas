/**
 * I18N-F1-R3 — liste kartı önizlemesinde gösterilecek metin var mı?
 * lib/bioenergy/*ListFetch `preview*Text` yardımcıları TÜM parçalar boş/boşluk olduğunda sabit "Önizleme yok."
 * döndürür; bu koşulun AYNISI (parts.filter(p => p?.trim()) boş) burada dil-bağımsız olarak sınanır ve ekran
 * `bioenergy.list.noPreview` metnini gösterir (TR değeri lib metniyle birebir). Lib dosyaları değişmedi.
 */
export function hasPreviewText(...parts: (string | null | undefined)[]): boolean {
  return parts.some((p) => !!p?.trim());
}
