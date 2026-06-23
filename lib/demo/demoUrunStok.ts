// Demo fixture — yalnızca is_demo_account=true hesabında devreye girer, DB'ye yazılmaz.

import type { InvItem } from "@/lib/urun-stok/dogaltasStockLogic";
import type { OilItem } from "@/lib/urun-stok/oilStockLogic";
import type { SoapCreamItem } from "@/lib/urun-stok/soapCreamStockLogic";
import type { AccessoryItem } from "@/lib/urun-stok/accessoryStockLogic";
import type { GeneralSaleRecord } from "@/lib/urun-stok/generalSalesLogic";

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const DEMO_URUN_STOK_SEEDED_KEY = "yasam_demo_urun_stok_seeded_v1";

const STORAGE_KEYS = {
  dogaltas: "dogaltas_inventory_v1",
  oil: "oil_inventory_v1",
  soap_cream: "soap_cream_inventory_v1",
  accessory: "accessory_inventory_v1",
  other: "other_inventory_v1",
  dogaltasSales: "dogaltas_sales_history_v1",
  oilSales: "oil_sales_history_v1",
  soapCreamSales: "soap_cream_sales_history_v1",
  accessorySales: "accessory_sales_history_v1",
  otherSales: "other_sales_history_v1",
  generalSales: "general_sales_history_v1",
};

// ─── Doğaltaş Envanteri (22 ürün) ────────────────────────────────────────────

export const DEMO_DOGALTAS_INV: InvItem[] = [
  { name: "AMETİST", type: "8 MM DİZİ", adet: 15, dizi_icerik: 0, dizi_price: 1425, adet_price: 95, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1425, unit_cost_try: 95 },
  { name: "PEMBE KUVARS", type: "8 MM DİZİ", adet: 12, dizi_icerik: 0, dizi_price: 900, adet_price: 75, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 900, unit_cost_try: 75 },
  { name: "KAPLAN GÖZÜ", type: "8 MM DİZİ", adet: 18, dizi_icerik: 0, dizi_price: 1440, adet_price: 80, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1440, unit_cost_try: 80 },
  { name: "AKİK", type: "8 MM DİZİ", adet: 20, dizi_icerik: 0, dizi_price: 1400, adet_price: 70, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1400, unit_cost_try: 70 },
  { name: "HEMATİT", type: "6 MM DİZİ", adet: 10, dizi_icerik: 0, dizi_price: 750, adet_price: 75, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 750, unit_cost_try: 75 },
  { name: "LAZURİT (LAPİS)", type: "6 MM DİZİ", adet: 8, dizi_icerik: 0, dizi_price: 1200, adet_price: 150, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1200, unit_cost_try: 150 },
  { name: "AY TAŞI", type: "8 MM DİZİ", adet: 10, dizi_icerik: 0, dizi_price: 1100, adet_price: 110, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1100, unit_cost_try: 110 },
  { name: "TÜRKUAZ", type: "6 MM DİZİ", adet: 7, dizi_icerik: 0, dizi_price: 1050, adet_price: 150, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1050, unit_cost_try: 150 },
  { name: "YEŞİM (JADE)", type: "8 MM DİZİ", adet: 9, dizi_icerik: 0, dizi_price: 1035, adet_price: 115, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1035, unit_cost_try: 115 },
  { name: "RODONİT", type: "8 MM DİZİ", adet: 11, dizi_icerik: 0, dizi_price: 990, adet_price: 90, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 990, unit_cost_try: 90 },
  { name: "KARNEOL", type: "8 MM DİZİ", adet: 14, dizi_icerik: 0, dizi_price: 1120, adet_price: 80, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 1120, unit_cost_try: 80 },
  { name: "SODALİT", type: "6 MM DİZİ", adet: 13, dizi_icerik: 0, dizi_price: 975, adet_price: 75, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 975, unit_cost_try: 75 },
  { name: "OBSİDYEN", type: "KÜTLE", adet: 30, dizi_icerik: 0, dizi_price: 0, adet_price: 45, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 45 },
  { name: "SİTRİN", type: "KÜTLE", adet: 25, dizi_icerik: 0, dizi_price: 0, adet_price: 65, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 65 },
  { name: "LABRADORİT", type: "KÜTLE", adet: 20, dizi_icerik: 0, dizi_price: 0, adet_price: 85, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 85 },
  { name: "SİYAH TURMALİN", type: "KÜTLE", adet: 35, dizi_icerik: 0, dizi_price: 0, adet_price: 55, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 55 },
  { name: "PİRİT", type: "KÜTLE", adet: 22, dizi_icerik: 0, dizi_price: 0, adet_price: 75, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 75 },
  { name: "FLORİT", type: "KÜTLE", adet: 18, dizi_icerik: 0, dizi_price: 0, adet_price: 95, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 95 },
  { name: "MALAKİT", type: "KÜTLE", adet: 12, dizi_icerik: 0, dizi_price: 0, adet_price: 120, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 120 },
  { name: "KRİSTAL KUVARS", type: "KÜTLE", adet: 28, dizi_icerik: 0, dizi_price: 0, adet_price: 40, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 40 },
  { name: "AMETİST", type: "4 MM DİZİ", adet: 8, dizi_icerik: 0, dizi_price: 560, adet_price: 70, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 560, unit_cost_try: 70 },
  { name: "KAPLAN GÖZÜ", type: "10 MM DİZİ", adet: 6, dizi_icerik: 0, dizi_price: 660, adet_price: 110, photos: [], dizi_price_usd: 0, dizi_price_eur: 0, usd_rate: 0, eur_rate: 0, total_cost_try: 660, unit_cost_try: 110 },
];

// ─── Yağ Envanteri (22 ürün) ──────────────────────────────────────────────────

export const DEMO_OIL_INV: OilItem[] = [
  { id: "demo-oil-0",  name: "LAVANTA UÇU YAĞI",          oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 1500, baseUnit: "ml",  costPerBase: 3.5,  salePerBase: 7,    profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-1",  name: "ÇAY AĞACI UÇU YAĞI",        oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 1000, baseUnit: "ml",  costPerBase: 4.5,  salePerBase: 9,    profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-2",  name: "OKALİPTÜS UÇU YAĞI",        oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 800,  baseUnit: "ml",  costPerBase: 4,    salePerBase: 8,    profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-3",  name: "PORTAKAL UÇU YAĞI",          oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 2000, baseUnit: "ml",  costPerBase: 2.8,  salePerBase: 5.6,  profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-4",  name: "BİBERİYE UÇU YAĞI",          oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 600,  baseUnit: "ml",  costPerBase: 5,    salePerBase: 10,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-5",  name: "NANE UÇU YAĞI",               oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 500,  baseUnit: "ml",  costPerBase: 5.5,  salePerBase: 11,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-6",  name: "PAÇULİ UÇU YAĞI",            oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 300,  baseUnit: "ml",  costPerBase: 8,    salePerBase: 16,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-7",  name: "BERGAMOT UÇU YAĞI",           oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 400,  baseUnit: "ml",  costPerBase: 6,    salePerBase: 12,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-8",  name: "SEDİR UÇU YAĞI",              oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 400,  baseUnit: "ml",  costPerBase: 5.5,  salePerBase: 11,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-9",  name: "FRANK GÜNLÜK UÇU YAĞI",       oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 200,  baseUnit: "ml",  costPerBase: 12,   salePerBase: 24,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-10", name: "JOJOBA SABİT YAĞI",            oilType: "Sabit Yağ",     measureType: "ML / Litre",  stockBase: 2000, baseUnit: "ml",  costPerBase: 2,    salePerBase: 3.5,  profitPct: 75,  bottleVolume: "50 ml", bottleVolumeCustom: "", packageType: "sprey şişe",      photos: [], note: "" },
  { id: "demo-oil-11", name: "ARGAN SABİT YAĞI",             oilType: "Sabit Yağ",     measureType: "ML / Litre",  stockBase: 1000, baseUnit: "ml",  costPerBase: 3.5,  salePerBase: 7,    profitPct: 100, bottleVolume: "50 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-12", name: "HİNDİSTAN CEVİZİ SABİT YAĞI", oilType: "Sabit Yağ",     measureType: "Gram / KG",   stockBase: 2000, baseUnit: "gram",costPerBase: 0.06, salePerBase: 0.12, profitPct: 100, bottleVolume: "özel",  bottleVolumeCustom: "", packageType: "kavanoz",          photos: [], note: "" },
  { id: "demo-oil-13", name: "KANTARON MASERASYON YAĞI",     oilType: "Maserasyon Yağı",measureType: "ML / Litre", stockBase: 500,  baseUnit: "ml",  costPerBase: 6,    salePerBase: 12,   profitPct: 100, bottleVolume: "50 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-14", name: "PAPATYA MASERASYON YAĞI",      oilType: "Maserasyon Yağı",measureType: "ML / Litre", stockBase: 300,  baseUnit: "ml",  costPerBase: 8,    salePerBase: 16,   profitPct: 100, bottleVolume: "50 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-15", name: "LAVANTA KARIŞIM YAĞI",         oilType: "Karışım Yağ",   measureType: "ML / Litre",  stockBase: 200,  baseUnit: "ml",  costPerBase: 9,    salePerBase: 18,   profitPct: 100, bottleVolume: "30 ml", bottleVolumeCustom: "", packageType: "roll-on",          photos: [], note: "" },
  { id: "demo-oil-16", name: "RAHATLATıcı KARIŞIM",          oilType: "Karışım Yağ",   measureType: "Adet",        stockBase: 15,   baseUnit: "adet",costPerBase: 75,   salePerBase: 150,  profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "roll-on",          photos: [], note: "" },
  { id: "demo-oil-17", name: "ENERJİ KARIŞIMI",               oilType: "Karışım Yağ",   measureType: "Adet",        stockBase: 12,   baseUnit: "adet",costPerBase: 85,   salePerBase: 170,  profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "roll-on",          photos: [], note: "" },
  { id: "demo-oil-18", name: "SÜTLEĞEN MASERASYON YAĞI",     oilType: "Maserasyon Yağı",measureType: "ML / Litre", stockBase: 250,  baseUnit: "ml",  costPerBase: 7,    salePerBase: 14,   profitPct: 100, bottleVolume: "50 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-19", name: "SANDAL AĞACI UÇU YAĞI",        oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 150,  baseUnit: "ml",  costPerBase: 15,   salePerBase: 30,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-20", name: "YLANG YLANG UÇU YAĞI",         oilType: "Uçucu Yağ",     measureType: "ML / Litre",  stockBase: 250,  baseUnit: "ml",  costPerBase: 10,   salePerBase: 20,   profitPct: 100, bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "damlalıklı şişe", photos: [], note: "" },
  { id: "demo-oil-21", name: "BİTKİSEL BAZAJ YAĞI",          oilType: "Sabit Yağ",     measureType: "ML / Litre",  stockBase: 3000, baseUnit: "ml",  costPerBase: 1.5,  salePerBase: 3,    profitPct: 100, bottleVolume: "100 ml",bottleVolumeCustom: "", packageType: "dökme",           photos: [], note: "" },
];

// ─── Sabun / Krem Envanteri (22 ürün) ────────────────────────────────────────

export const DEMO_SOAP_CREAM_INV: SoapCreamItem[] = [
  { id: "demo-sc-0",  name: "LAVANTA SABUNU",          productGroup: "Doğal Sabun", measureType: "Adet",       stockBase: 50,   baseUnit: "adet", costPerBase: 15,   salePerBase: 35,   profitPct: 133, packagingType: "kalıp",        netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC001", photos: [], note: "" },
  { id: "demo-sc-1",  name: "KEÇİ SÜTLÜ SABUN",        productGroup: "Doğal Sabun", measureType: "Adet",       stockBase: 40,   baseUnit: "adet", costPerBase: 18,   salePerBase: 40,   profitPct: 122, packagingType: "kalıp",        netAmount: "110",  expiryDate: "2026-12-31", lotNo: "SC002", photos: [], note: "" },
  { id: "demo-sc-2",  name: "ZEYTİNYAĞLI SABUN",       productGroup: "Doğal Sabun", measureType: "Adet",       stockBase: 35,   baseUnit: "adet", costPerBase: 12,   salePerBase: 28,   profitPct: 133, packagingType: "kalıp",        netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC003", photos: [], note: "" },
  { id: "demo-sc-3",  name: "KİL SABUNU",               productGroup: "Doğal Sabun", measureType: "Gram / KG",  stockBase: 3000, baseUnit: "gram", costPerBase: 0.08, salePerBase: 0.18, profitPct: 125, packagingType: "kalıp",        netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC004", photos: [], note: "" },
  { id: "demo-sc-4",  name: "AKTİF KÖMÜR SABUNU",       productGroup: "Doğal Sabun", measureType: "Adet",       stockBase: 25,   baseUnit: "adet", costPerBase: 20,   salePerBase: 45,   profitPct: 125, packagingType: "kalıp",        netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC005", photos: [], note: "" },
  { id: "demo-sc-5",  name: "GÜL KREMİ",                productGroup: "Krem",        measureType: "Gram / KG",  stockBase: 2000, baseUnit: "gram", costPerBase: 0.12, salePerBase: 0.28, profitPct: 133, packagingType: "kavanoz",      netAmount: "50",   expiryDate: "2026-09-30", lotNo: "SC006", photos: [], note: "" },
  { id: "demo-sc-6",  name: "AYNISEFA KREMİ",           productGroup: "Krem",        measureType: "Gram / KG",  stockBase: 1500, baseUnit: "gram", costPerBase: 0.10, salePerBase: 0.22, profitPct: 120, packagingType: "kavanoz",      netAmount: "50",   expiryDate: "2026-09-30", lotNo: "SC007", photos: [], note: "" },
  { id: "demo-sc-7",  name: "ARGAN EL KREMİ",           productGroup: "Krem",        measureType: "Adet",       stockBase: 20,   baseUnit: "adet", costPerBase: 35,   salePerBase: 80,   profitPct: 129, packagingType: "tüp",          netAmount: "75",   expiryDate: "2026-09-30", lotNo: "SC008", photos: [], note: "" },
  { id: "demo-sc-8",  name: "SHEA YAĞLI VÜCUT KREMİ",   productGroup: "Krem",        measureType: "Gram / KG",  stockBase: 1000, baseUnit: "gram", costPerBase: 0.15, salePerBase: 0.35, profitPct: 133, packagingType: "kavanoz",      netAmount: "200",  expiryDate: "2026-09-30", lotNo: "SC009", photos: [], note: "" },
  { id: "demo-sc-9",  name: "LAVANTA LOSYONU",           productGroup: "Losyon",      measureType: "ML / Litre", stockBase: 2000, baseUnit: "ml",   costPerBase: 0.09, salePerBase: 0.20, profitPct: 122, packagingType: "pompalı şişe", netAmount: "200",  expiryDate: "2026-09-30", lotNo: "SC010", photos: [], note: "" },
  { id: "demo-sc-10", name: "PORTAKAL ÇİÇEĞİ LOSYONU",  productGroup: "Losyon",      measureType: "ML / Litre", stockBase: 1000, baseUnit: "ml",   costPerBase: 0.12, salePerBase: 0.28, profitPct: 133, packagingType: "pompalı şişe", netAmount: "200",  expiryDate: "2026-09-30", lotNo: "SC011", photos: [], note: "" },
  { id: "demo-sc-11", name: "DOĞAL DUDAK BALMI",         productGroup: "Balm",        measureType: "Adet",       stockBase: 30,   baseUnit: "adet", costPerBase: 12,   salePerBase: 28,   profitPct: 133, packagingType: "kutu",         netAmount: "5",    expiryDate: "2027-03-31", lotNo: "SC012", photos: [], note: "" },
  { id: "demo-sc-12", name: "NANE DUDAK BALMI",          productGroup: "Balm",        measureType: "Adet",       stockBase: 25,   baseUnit: "adet", costPerBase: 14,   salePerBase: 30,   profitPct: 114, packagingType: "kutu",         netAmount: "5",    expiryDate: "2027-03-31", lotNo: "SC013", photos: [], note: "" },
  { id: "demo-sc-13", name: "C VİTAMİNİ SERUMU",         productGroup: "Serum",       measureType: "ML / Litre", stockBase: 500,  baseUnit: "ml",   costPerBase: 0.25, salePerBase: 0.55, profitPct: 120, packagingType: "damlalıklı şişe", netAmount: "30", expiryDate: "2026-06-30", lotNo: "SC014", photos: [], note: "" },
  { id: "demo-sc-14", name: "HYALÜRONİK ASİT SERUMU",    productGroup: "Serum",       measureType: "Adet",       stockBase: 15,   baseUnit: "adet", costPerBase: 65,   salePerBase: 145,  profitPct: 123, packagingType: "damlalıklı şişe", netAmount: "30", expiryDate: "2026-06-30", lotNo: "SC015", photos: [], note: "" },
  { id: "demo-sc-15", name: "LAVANTA ŞAMPUANI",          productGroup: "Şampuan",     measureType: "ML / Litre", stockBase: 2000, baseUnit: "ml",   costPerBase: 0.08, salePerBase: 0.18, profitPct: 125, packagingType: "pompalı şişe", netAmount: "250",  expiryDate: "2026-12-31", lotNo: "SC016", photos: [], note: "" },
  { id: "demo-sc-16", name: "KERATİN ŞAMPUANI",          productGroup: "Şampuan",     measureType: "Adet",       stockBase: 10,   baseUnit: "adet", costPerBase: 55,   salePerBase: 120,  profitPct: 118, packagingType: "şişe",         netAmount: "400",  expiryDate: "2026-12-31", lotNo: "SC017", photos: [], note: "" },
  { id: "demo-sc-17", name: "KİL MASKESİ",               productGroup: "Maske",       measureType: "Gram / KG",  stockBase: 1000, baseUnit: "gram", costPerBase: 0.15, salePerBase: 0.32, profitPct: 113, packagingType: "kavanoz",      netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC018", photos: [], note: "" },
  { id: "demo-sc-18", name: "KÖMÜR MASKESİ",             productGroup: "Maske",       measureType: "Gram / KG",  stockBase: 500,  baseUnit: "gram", costPerBase: 0.20, salePerBase: 0.45, profitPct: 125, packagingType: "kavanoz",      netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC019", photos: [], note: "" },
  { id: "demo-sc-19", name: "GÜL SUYLU TONİK",           productGroup: "Diğer",       measureType: "ML / Litre", stockBase: 1500, baseUnit: "ml",   costPerBase: 0.07, salePerBase: 0.16, profitPct: 129, packagingType: "sprey şişe",   netAmount: "150",  expiryDate: "2026-09-30", lotNo: "SC020", photos: [], note: "" },
  { id: "demo-sc-20", name: "ZEYTINYAĞLI EL KREMİ",      productGroup: "Krem",        measureType: "Gram / KG",  stockBase: 800,  baseUnit: "gram", costPerBase: 0.10, salePerBase: 0.22, profitPct: 120, packagingType: "tüp",          netAmount: "75",   expiryDate: "2026-09-30", lotNo: "SC021", photos: [], note: "" },
  { id: "demo-sc-21", name: "NİM AĞACI SABUNU",          productGroup: "Doğal Sabun", measureType: "Adet",       stockBase: 20,   baseUnit: "adet", costPerBase: 16,   salePerBase: 36,   profitPct: 125, packagingType: "kalıp",        netAmount: "100",  expiryDate: "2026-12-31", lotNo: "SC022", photos: [], note: "" },
];

// ─── Aksesuar / Tespih / Takı Envanteri (22 ürün) ────────────────────────────

export const DEMO_ACCESSORY_INV: AccessoryItem[] = [
  { id: "demo-acc-0",  name: "AMETİST TESPİH",            productGroup: "Tespih",    productModel: "99'lu",  material: "doğal taş", color: "mor",        sizeKind: "tespih tane sayısı", sizeDetail: "99", stockQty: 10, costPerUnit: 180, salePerUnit: 380, profitPct: 111, barcode: "", photos: [], note: "" },
  { id: "demo-acc-1",  name: "ONİKS TESPİH",               productGroup: "Tespih",    productModel: "99'lu",  material: "doğal taş", color: "siyah",      sizeKind: "tespih tane sayısı", sizeDetail: "99", stockQty: 8,  costPerUnit: 150, salePerUnit: 320, profitPct: 113, barcode: "", photos: [], note: "" },
  { id: "demo-acc-2",  name: "AKİK TESPİH",                productGroup: "Tespih",    productModel: "33'lü",  material: "doğal taş", color: "turuncu",    sizeKind: "tespih tane sayısı", sizeDetail: "33", stockQty: 12, costPerUnit: 130, salePerUnit: 270, profitPct: 108, barcode: "", photos: [], note: "" },
  { id: "demo-acc-3",  name: "SANDAL AĞACI TESPİH",        productGroup: "Tespih",    productModel: "33'lü",  material: "ahşap",     color: "kahve",      sizeKind: "tespih tane sayısı", sizeDetail: "33", stockQty: 15, costPerUnit: 85,  salePerUnit: 180, profitPct: 112, barcode: "", photos: [], note: "" },
  { id: "demo-acc-4",  name: "PEMBE KUVARS BİLEKLİK",      productGroup: "Bileklik",  productModel: "elastik",material: "doğal taş", color: "pembe",      sizeKind: "bileklik cm",        sizeDetail: "16-18 cm", stockQty: 20, costPerUnit: 55, salePerUnit: 120, profitPct: 118, barcode: "", photos: [], note: "" },
  { id: "demo-acc-5",  name: "LAZURİT BİLEKLİK",           productGroup: "Bileklik",  productModel: "elastik",material: "doğal taş", color: "mavi",       sizeKind: "bileklik cm",        sizeDetail: "16-18 cm", stockQty: 15, costPerUnit: 65, salePerUnit: 140, profitPct: 115, barcode: "", photos: [], note: "" },
  { id: "demo-acc-6",  name: "KAPLAN GÖZÜ BİLEKLİK",       productGroup: "Bileklik",  productModel: "elastik",material: "doğal taş", color: "sarı-kahve", sizeKind: "bileklik cm",        sizeDetail: "16-18 cm", stockQty: 18, costPerUnit: 60, salePerUnit: 130, profitPct: 117, barcode: "", photos: [], note: "" },
  { id: "demo-acc-7",  name: "AKİK BİLEKLİK",              productGroup: "Bileklik",  productModel: "elastik",material: "doğal taş", color: "turuncu",    sizeKind: "bileklik cm",        sizeDetail: "16-18 cm", stockQty: 22, costPerUnit: 45, salePerUnit: 100, profitPct: 122, barcode: "", photos: [], note: "" },
  { id: "demo-acc-8",  name: "KARNEOL BİLEKLİK",           productGroup: "Bileklik",  productModel: "elastik",material: "doğal taş", color: "kırmızı",    sizeKind: "bileklik cm",        sizeDetail: "16-18 cm", stockQty: 15, costPerUnit: 58, salePerUnit: 125, profitPct: 116, barcode: "", photos: [], note: "" },
  { id: "demo-acc-9",  name: "AMETİST KOLYE",               productGroup: "Kolye",     productModel: "sarkıt", material: "doğal taş", color: "mor",        sizeKind: "kolye cm",           sizeDetail: "45 cm",    stockQty: 12, costPerUnit: 95, salePerUnit: 200, profitPct: 111, barcode: "", photos: [], note: "" },
  { id: "demo-acc-10", name: "HEMATİT KOLYE UCU",           productGroup: "Kolye",     productModel: "damla",  material: "doğal taş", color: "gri-siyah",  sizeKind: "kolye cm",           sizeDetail: "45 cm",    stockQty: 25, costPerUnit: 35, salePerUnit: 75,  profitPct: 114, barcode: "", photos: [], note: "" },
  { id: "demo-acc-11", name: "AY TAŞI KOLYE",               productGroup: "Kolye",     productModel: "oval",   material: "doğal taş", color: "beyaz-krem", sizeKind: "kolye cm",           sizeDetail: "45 cm",    stockQty: 10, costPerUnit: 120, salePerUnit: 250, profitPct: 108, barcode: "", photos: [], note: "" },
  { id: "demo-acc-12", name: "FLORİT KOLYE",                productGroup: "Kolye",     productModel: "oval",   material: "doğal taş", color: "mor-yeşil",  sizeKind: "kolye cm",           sizeDetail: "45 cm",    stockQty: 12, costPerUnit: 88, salePerUnit: 185, profitPct: 110, barcode: "", photos: [], note: "" },
  { id: "demo-acc-13", name: "AY TAŞI KÜPE",                productGroup: "Küpe",      productModel: "damla",  material: "doğal taş", color: "beyaz-krem", sizeKind: "standart",           sizeDetail: "—",        stockQty: 14, costPerUnit: 70, salePerUnit: 150, profitPct: 114, barcode: "", photos: [], note: "" },
  { id: "demo-acc-14", name: "OBSİDYEN KÜPE",               productGroup: "Küpe",      productModel: "topuk",  material: "doğal taş", color: "siyah",      sizeKind: "standart",           sizeDetail: "—",        stockQty: 10, costPerUnit: 75, salePerUnit: 160, profitPct: 113, barcode: "", photos: [], note: "" },
  { id: "demo-acc-15", name: "TÜRKUAZ KÜPE",                productGroup: "Küpe",      productModel: "damla",  material: "doğal taş", color: "turkuaz",    sizeKind: "standart",           sizeDetail: "—",        stockQty: 8,  costPerUnit: 90, salePerUnit: 190, profitPct: 111, barcode: "", photos: [], note: "" },
  { id: "demo-acc-16", name: "DOĞALTAŞ ANAHTARLIK",         productGroup: "Anahtarlık",productModel: "yuvarlak",material:"doğal taş",  color: "karışık",    sizeKind: "standart",           sizeDetail: "—",        stockQty: 30, costPerUnit: 25, salePerUnit: 55,  profitPct: 120, barcode: "", photos: [], note: "" },
  { id: "demo-acc-17", name: "GÜMÜŞ AMETİST YÜZÜK",        productGroup: "Yüzük",     productModel: "kaba",   material: "gümüş",     color: "mor-gümüş",  sizeKind: "yüzük ölçüsü",       sizeDetail: "8-12",     stockQty: 8,  costPerUnit: 180, salePerUnit: 380, profitPct: 111, barcode: "", photos: [], note: "" },
  { id: "demo-acc-18", name: "BİLEKLİK + KOLYE SET",        productGroup: "Takı Seti", productModel: "karma",  material: "karışık",   color: "karışık",    sizeKind: "standart",           sizeDetail: "—",        stockQty: 6,  costPerUnit: 145, salePerUnit: 300, profitPct: 107, barcode: "", photos: [], note: "" },
  { id: "demo-acc-19", name: "LAZURİT KOLYE UCU",           productGroup: "Kolye",     productModel: "damla",  material: "doğal taş", color: "mavi",       sizeKind: "kolye cm",           sizeDetail: "45 cm",    stockQty: 20, costPerUnit: 40, salePerUnit: 85,  profitPct: 113, barcode: "", photos: [], note: "" },
  { id: "demo-acc-20", name: "HEMATİT ÇOKLU BİLEKLİK",     productGroup: "Bileklik",  productModel: "sarmal", material: "doğal taş", color: "gri-siyah",  sizeKind: "bileklik cm",        sizeDetail: "16-18 cm", stockQty: 10, costPerUnit: 80, salePerUnit: 170, profitPct: 113, barcode: "", photos: [], note: "" },
  { id: "demo-acc-21", name: "KRİSTAL KUVARS KOLYE",        productGroup: "Kolye",     productModel: "nokta",  material: "doğal taş", color: "şeffaf",     sizeKind: "kolye cm",           sizeDetail: "45 cm",    stockQty: 14, costPerUnit: 70, salePerUnit: 150, profitPct: 114, barcode: "", photos: [], note: "" },
];

// ─── Satış Geçmişi (GeneralSaleRecord — 22 kayıt) ────────────────────────────
// Kayıtlar general_sales_history_v1 anahtarına yazılır; satis-gecmisi sayfası okur.

function ts(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(10 + (daysAgo % 8), (daysAgo * 7) % 60, 0, 0);
  return d.toISOString();
}

export const DEMO_GENERAL_SALES: GeneralSaleRecord[] = [
  {
    name: "Eylül Karaca",
    timestamp: ts(2),
    total_cost: 190, sale_price: 400, profit_pct: 111,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "ametist|8 mm di̇zi̇", productName: "AMETİST", productSubtitle: "8 MM DİZİ", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 190, lineSale: 400 },
    ],
  },
  {
    name: "Kaan Ersoy",
    timestamp: ts(4),
    total_cost: 135, sale_price: 285, profit_pct: 111,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-4", productName: "PEMBE KUVARS BİLEKLİK", productSubtitle: "Bileklik · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 55, lineSale: 120 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-0", productName: "LAVANTA UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 10, saleUnit: "ml", saleBaseQty: 10, lineCost: 35, lineSale: 70 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-0", productName: "LAVANTA SABUNU", productSubtitle: "Doğal Sabun", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 15, lineSale: 35 },
    ],
  },
  {
    name: "Merve Duman",
    timestamp: ts(7),
    total_cost: 130, sale_price: 280, profit_pct: 115,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "pembe kuvars|8 mm di̇zi̇", productName: "PEMBE KUVARS", productSubtitle: "8 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 75, lineSale: 160 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-5", productName: "GÜL KREMİ", productSubtitle: "Krem · gram", saleQty: 50, saleUnit: "gram", saleBaseQty: 50, lineCost: 6, lineSale: 14 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-13", productName: "AY TAŞI KÜPE", productSubtitle: "Küpe · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 70, lineSale: 150 },
    ],
  },
  {
    name: "Deniz Akbulut",
    timestamp: ts(10),
    total_cost: 255, sale_price: 540, profit_pct: 112,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-0", productName: "AMETİST TESPİH", productSubtitle: "Tespih · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 180, lineSale: 380 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-13", productName: "KANTARON MASERASYON YAĞI", productSubtitle: "Maserasyon Yağı · ml", saleQty: 10, saleUnit: "ml", saleBaseQty: 10, lineCost: 60, lineSale: 120 },
    ],
  },
  {
    name: "Cem Aydıner",
    timestamp: ts(14),
    total_cost: 120, sale_price: 255, profit_pct: 113,
    photos: [],
    lines: [
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-1", productName: "KEÇİ SÜTLÜ SABUN", productSubtitle: "Doğal Sabun", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 36, lineSale: 80 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-11", productName: "DOĞAL DUDAK BALMI", productSubtitle: "Balm", saleQty: 3, saleUnit: "adet", saleBaseQty: 3, lineCost: 36, lineSale: 84 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-15", productName: "LAVANTA KARIŞIM YAĞI", productSubtitle: "Karışım Yağ · ml", saleQty: 5, saleUnit: "ml", saleBaseQty: 5, lineCost: 45, lineSale: 90 },
    ],
  },
  {
    name: "Gökçe Tunalı",
    timestamp: ts(18),
    total_cost: 165, sale_price: 350, profit_pct: 112,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "hematit|6 mm di̇zi̇", productName: "HEMATİT", productSubtitle: "6 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 75, lineSale: 160 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-6", productName: "KAPLAN GÖZÜ BİLEKLİK", productSubtitle: "Bileklik · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 60, lineSale: 130 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-17", productName: "KİL MASKESİ", productSubtitle: "Maske · gram", saleQty: 100, saleUnit: "gram", saleBaseQty: 100, lineCost: 15, lineSale: 32 },
    ],
  },
  {
    name: "Baran Yıldırım",
    timestamp: ts(21),
    total_cost: 330, sale_price: 700, profit_pct: 112,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "lazüri̇t (lapi̇s)|6 mm di̇zi̇", productName: "LAZURİT (LAPİS)", productSubtitle: "6 MM DİZİ", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 300, lineSale: 640 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-0", productName: "LAVANTA SABUNU", productSubtitle: "Doğal Sabun", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 30, lineSale: 70 },
    ],
  },
  {
    name: "Aslı Köksal",
    timestamp: ts(25),
    total_cost: 195, sale_price: 415, profit_pct: 113,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-9", productName: "AMETİST KOLYE", productSubtitle: "Kolye · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 95, lineSale: 200 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-10", productName: "JOJOBA SABİT YAĞI", productSubtitle: "Sabit Yağ · ml", saleQty: 50, saleUnit: "ml", saleBaseQty: 50, lineCost: 100, lineSale: 175 },
    ],
  },
  {
    name: "Selim Durmaz",
    timestamp: ts(28),
    total_cost: 85, sale_price: 180, profit_pct: 112,
    photos: [],
    lines: [
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-16", productName: "RAHATLATıcı KARIŞIM", productSubtitle: "Karışım Yağ · adet", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 75, lineSale: 150 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-12", productName: "NANE DUDAK BALMI", productSubtitle: "Balm", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 14, lineSale: 30 },
    ],
  },
  {
    name: "Derya Sarıtaş",
    timestamp: ts(32),
    total_cost: 220, sale_price: 465, profit_pct: 111,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "ay taşı|8 mm di̇zi̇", productName: "AY TAŞI", productSubtitle: "8 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 110, lineSale: 230 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-14", productName: "OBSİDYEN KÜPE", productSubtitle: "Küpe · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 75, lineSale: 160 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-13", productName: "C VİTAMİNİ SERUMU", productSubtitle: "Serum · ml", saleQty: 30, saleUnit: "ml", saleBaseQty: 30, lineCost: 7.5, lineSale: 16.5 },
    ],
  },
  {
    name: "Yusuf Çelik",
    timestamp: ts(35),
    total_cost: 395, sale_price: 840, profit_pct: 113,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-1", productName: "ONİKS TESPİH", productSubtitle: "Tespih · doğal taş", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 300, lineSale: 640 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-7", productName: "ARGAN EL KREMİ", productSubtitle: "Krem", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 70, lineSale: 160 },
    ],
  },
  {
    name: "Selin Öztürk",
    timestamp: ts(39),
    total_cost: 105, sale_price: 225, profit_pct: 114,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "kaplan gözü|8 mm di̇zi̇", productName: "KAPLAN GÖZÜ", productSubtitle: "8 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 80, lineSale: 170 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-5", productName: "NANE UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 5, saleUnit: "ml", saleBaseQty: 5, lineCost: 27.5, lineSale: 55 },
    ],
  },
  {
    name: "Mert Güneş",
    timestamp: ts(42),
    total_cost: 345, sale_price: 730, profit_pct: 112,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-2", productName: "AKİK TESPİH", productSubtitle: "Tespih · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 130, lineSale: 270 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-18", productName: "BİLEKLİK + KOLYE SET", productSubtitle: "Takı Seti · karışık", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 145, lineSale: 300 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-19", productName: "GÜL SUYLU TONİK", productSubtitle: "Diğer · ml", saleQty: 150, saleUnit: "ml", saleBaseQty: 150, lineCost: 10.5, lineSale: 24 },
    ],
  },
  {
    name: "Cansu Yaman",
    timestamp: ts(46),
    total_cost: 200, sale_price: 430, profit_pct: 115,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "aki̇k|8 mm di̇zi̇", productName: "AKİK", productSubtitle: "8 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 70, lineSale: 150 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-14", productName: "HYALÜRONİK ASİT SERUMU", productSubtitle: "Serum", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 65, lineSale: 145 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-11", productName: "ARGAN SABİT YAĞI", productSubtitle: "Sabit Yağ · ml", saleQty: 30, saleUnit: "ml", saleBaseQty: 30, lineCost: 105, lineSale: 210 },
    ],
  },
  {
    name: "Emre Koçak",
    timestamp: ts(50),
    total_cost: 240, sale_price: 510, profit_pct: 113,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-11", productName: "AY TAŞI KOLYE", productSubtitle: "Kolye · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 120, lineSale: 250 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-3", productName: "KİL SABUNU", productSubtitle: "Doğal Sabun · gram", saleQty: 100, saleUnit: "gram", saleBaseQty: 100, lineCost: 8, lineSale: 18 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-6", productName: "PAÇULİ UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 7, saleUnit: "ml", saleBaseQty: 7, lineCost: 56, lineSale: 112 },
    ],
  },
  {
    name: "Zeynep Arslan",
    timestamp: ts(55),
    total_cost: 175, sale_price: 375, profit_pct: 114,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "rodoni̇t|8 mm di̇zi̇", productName: "RODONİT", productSubtitle: "8 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 90, lineSale: 190 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-16", productName: "DOĞALTAŞ ANAHTARLIK", productSubtitle: "Anahtarlık · doğal taş", saleQty: 3, saleUnit: "adet", saleBaseQty: 3, lineCost: 75, lineSale: 165 },
    ],
  },
  {
    name: "Ozan Kılıç",
    timestamp: ts(60),
    total_cost: 315, sale_price: 665, profit_pct: 111,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "türkuaz|6 mm di̇zi̇", productName: "TÜRKUAZ", productSubtitle: "6 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 150, lineSale: 315 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-15", productName: "TÜRKUAZ KÜPE", productSubtitle: "Küpe · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 90, lineSale: 190 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-14", productName: "PAPATYA MASERASYON YAĞI", productSubtitle: "Maserasyon Yağı · ml", saleQty: 10, saleUnit: "ml", saleBaseQty: 10, lineCost: 80, lineSale: 160 },
    ],
  },
  {
    name: "Tuğba Şahin",
    timestamp: ts(65),
    total_cost: 160, sale_price: 340, profit_pct: 113,
    photos: [],
    lines: [
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-17", productName: "ENERJİ KARIŞIMI", productSubtitle: "Karışım Yağ · adet", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 85, lineSale: 170 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-15", productName: "LAVANTA ŞAMPUANI", productSubtitle: "Şampuan · ml", saleQty: 250, saleUnit: "ml", saleBaseQty: 250, lineCost: 20, lineSale: 45 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-6", productName: "AYNISEFA KREMİ", productSubtitle: "Krem · gram", saleQty: 50, saleUnit: "gram", saleBaseQty: 50, lineCost: 5, lineSale: 11 },
    ],
  },
  {
    name: "Kerem Bulut",
    timestamp: ts(70),
    total_cost: 545, sale_price: 1160, profit_pct: 113,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-17", productName: "GÜMÜŞ AMETİST YÜZÜK", productSubtitle: "Yüzük · gümüş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 180, lineSale: 380 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-9", productName: "AMETİST KOLYE", productSubtitle: "Kolye · doğal taş", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 95, lineSale: 200 },
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "ametist|8 mm di̇zi̇", productName: "AMETİST", productSubtitle: "8 MM DİZİ", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 190, lineSale: 400 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-8", productName: "SEDİR UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 10, saleUnit: "ml", saleBaseQty: 10, lineCost: 55, lineSale: 110 },
    ],
  },
  {
    name: "Naz Demir",
    timestamp: ts(75),
    total_cost: 235, sale_price: 500, profit_pct: 113,
    photos: [],
    lines: [
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "yeşi̇m (jade)|8 mm di̇zi̇", productName: "YEŞİM (JADE)", productSubtitle: "8 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 115, lineSale: 240 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-8", productName: "SHEA YAĞLI VÜCUT KREMİ", productSubtitle: "Krem · gram", saleQty: 200, saleUnit: "gram", saleBaseQty: 200, lineCost: 30, lineSale: 70 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-7", productName: "BERGAMOT UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 15, saleUnit: "ml", saleBaseQty: 15, lineCost: 90, lineSale: 180 },
    ],
  },
  {
    name: "Derya Sarıtaş (2. seans)",
    timestamp: ts(80),
    total_cost: 420, sale_price: 890, profit_pct: 112,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-3", productName: "SANDAL AĞACI TESPİH", productSubtitle: "Tespih · ahşap", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 170, lineSale: 360 },
      { category: "dogaltas", sourceKey: "dogaltas_inventory_v1", productId: "sodali̇t|6 mm di̇zi̇", productName: "SODALİT", productSubtitle: "6 MM DİZİ", saleQty: 1, saleUnit: "adet", saleBaseQty: 1, lineCost: 75, lineSale: 160 },
      { category: "soap_cream", sourceKey: "soap_cream_inventory_v1", productId: "demo-sc-10", productName: "PORTAKAL ÇİÇEĞİ LOSYONU", productSubtitle: "Losyon · ml", saleQty: 200, saleUnit: "ml", saleBaseQty: 200, lineCost: 24, lineSale: 56 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-3", productName: "PORTAKAL UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 10, saleUnit: "ml", saleBaseQty: 10, lineCost: 28, lineSale: 56 },
    ],
  },
  {
    name: "Gökçe Tunalı (set sipariş)",
    timestamp: ts(88),
    total_cost: 290, sale_price: 620, profit_pct: 114,
    photos: [],
    lines: [
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-5", productName: "LAZURİT BİLEKLİK", productSubtitle: "Bileklik · doğal taş", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 130, lineSale: 280 },
      { category: "accessory", sourceKey: "accessory_inventory_v1", productId: "demo-acc-19", productName: "LAZURİT KOLYE UCU", productSubtitle: "Kolye · doğal taş", saleQty: 2, saleUnit: "adet", saleBaseQty: 2, lineCost: 80, lineSale: 170 },
      { category: "oil", sourceKey: "oil_inventory_v1", productId: "demo-oil-9", productName: "FRANK GÜNLÜK UÇU YAĞI", productSubtitle: "Uçucu Yağ · ml", saleQty: 7, saleUnit: "ml", saleBaseQty: 7, lineCost: 84, lineSale: 168 },
    ],
  },
];

// ─── Seed / Clear ──────────────────────────────────────────────────────────────

export function isDemoUrunStokSeeded(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_URUN_STOK_SEEDED_KEY) === "1";
}

/** Demo envanteri ve satış geçmişini localStorage'a yazar. Sadece demo hesapta çağrılır. */
export function seedDemoUrunStok(): void {
  if (typeof window === "undefined") return;
  if (isDemoUrunStokSeeded()) return;

  try {
    localStorage.setItem(STORAGE_KEYS.dogaltas,     JSON.stringify(DEMO_DOGALTAS_INV));
    localStorage.setItem(STORAGE_KEYS.oil,          JSON.stringify(DEMO_OIL_INV));
    localStorage.setItem(STORAGE_KEYS.soap_cream,   JSON.stringify(DEMO_SOAP_CREAM_INV));
    localStorage.setItem(STORAGE_KEYS.accessory,    JSON.stringify(DEMO_ACCESSORY_INV));
    localStorage.setItem(STORAGE_KEYS.generalSales, JSON.stringify(DEMO_GENERAL_SALES));
    localStorage.setItem(DEMO_URUN_STOK_SEEDED_KEY, "1");
  } catch {
    // localStorage doluysa sessizce geç
  }
}

/** Demo verilerini localStorage'dan temizler (logout'ta çağrılır). */
export function clearDemoUrunStok(): void {
  if (typeof window === "undefined") return;
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(DEMO_URUN_STOK_SEEDED_KEY);
}
