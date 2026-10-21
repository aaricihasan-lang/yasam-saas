/**
 * salePricing.ts — satış satırı fiyatının İSTEMCİ AYNASI (STK-02).
 *
 * Kaydedilen tutarı sunucu belirler: inventory_sale_create_atomic
 * (supabase/migrations/20270123000000_inventory_sales.sql, "fiyat" bloğu):
 *   1) markup_pct GÖNDERİLDİYSE → birim satış = round(maliyet × (1 + markup/100), 4)
 *   2) gönderilmediyse ve ürünün satış fiyatı > 0 → birim satış = satış fiyatı
 *   3) aksi halde → birim satış = maliyet (kâr 0)
 *   satır maliyeti = round(maliyet × miktar, 2); satır satışı = round(birim satış × miktar, 2)
 *
 * Hata: sayfa kâr %0/boş iken ekranda (2)'yi gösterip markup_pct = 0 GÖNDERİYORDU → sunucu (1)'i
 * uygulayıp satışı MALİYETTEN kaydediyordu. Kural: markup yalnız > 0 ise gönderilir; ekran tutarı
 * aynı kuralla hesaplanır → ekrandaki tutar = kaydedilen tutar.
 */

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  // PostgreSQL numeric round() yarımda sıfırdan uzağa yuvarlar; pozitif değerlerde Math.round ile aynı.
  // Kayan nokta artığını (1.005 → 1.00499…) bastırmak için küçük düzeltme.
  return Math.round((n + Number.EPSILON * Math.abs(n)) * f) / f;
}

export const round2 = (n: number) => roundTo(n, 2);
export const round4 = (n: number) => roundTo(n, 4);

export type SaleLinePrice = {
  unitSale: number;
  lineCost: number;
  lineSale: number;
  /** Sunucuya gönderilecek markup; null → GÖNDERME (sunucu ürünün satış fiyatını kullanır). */
  markupToSend: number | null;
  /** Ekranda gösterilecek etkin kâr % (bilgi amaçlı). */
  effectivePct: number;
};

export function saleLinePrice(input: {
  unitCost: number;
  defaultUnitSale: number;
  quantity: number;
  markupPct: number | null | undefined;
}): SaleLinePrice {
  const unitCost = Number.isFinite(input.unitCost) && input.unitCost > 0 ? input.unitCost : 0;
  const defaultSale =
    Number.isFinite(input.defaultUnitSale) && input.defaultUnitSale > 0 ? input.defaultUnitSale : 0;
  const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
  const m = input.markupPct;
  const hasMarkup = typeof m === "number" && Number.isFinite(m) && m > 0;

  let unitSale: number;
  if (hasMarkup) unitSale = round4(unitCost * (1 + (m as number) / 100));
  else if (defaultSale > 0) unitSale = defaultSale;
  else unitSale = unitCost;

  const lineCost = round2(unitCost * qty);
  const lineSale = round2(unitSale * qty);
  const effectivePct = hasMarkup
    ? (m as number)
    : unitCost > 0
      ? round4((unitSale / unitCost - 1) * 100)
      : 0;
  return { unitSale, lineCost, lineSale, markupToSend: hasMarkup ? (m as number) : null, effectivePct };
}
