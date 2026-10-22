/**
 * Satış Geçmişi — "Satışı İptal Et" / "Listeden Sil" ayrımı: birim harness'ı (DB yok, ağ yok).
 *
 * Çalıştır: npx tsx scripts/urun-stok/sales-visibility.harness.ts
 */
import {
  CANCEL_CONFIRM_MESSAGE,
  HIDE_CONFIRM_MESSAGE,
  confirmNotes,
  describeVisibilityOutcome,
  isMissingVisibilityColumn,
  netSalesSummary,
  planCancel,
  planHide,
  planUnhide,
  type HistoryRecordLike,
} from "@/lib/urun-stok/salesVisibility";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};
const rec = (o: Partial<HistoryRecordLike> & { name: string }): HistoryRecordLike => ({
  timestamp: "21.10.2026 10:00", total_cost: 50, sale_price: 100, saleId: o.name.toLowerCase(), status: "completed", hiddenAt: null, ...o,
});

console.log("\n[Finans] Net toplamlar");
const A = rec({ name: "A" });
const B = rec({ name: "B", status: "cancelled" });
const C = rec({ name: "C", hiddenAt: "2026-10-21T10:00:00Z" });
const D = rec({ name: "D", status: "cancelled", hiddenAt: "2026-10-21T10:00:00Z" });
const sum = netSalesSummary([A, B, C, D]);
ok(sum.netSale === 200 && sum.netCost === 100 && sum.netProfit === 100, "net = yalnız tamamlanan (A + gizli C); iptal B, D hariç");
ok(sum.completed === 2 && sum.cancelled === 2 && sum.hidden === 2, "sayımlar: tamamlanan 2, iptal 2, listeden silinen 2");
const oldWay = [A, B, C, D].reduce((s, r) => s + r.sale_price, 0);
ok(oldWay === 400 && sum.netSale === 200, "ESKİ hesap iptalleri de topluyordu (400) → yeni net 200 (hata yeniden üretildi + düzeldi)");
ok(netSalesSummary([C]).netSale === 100, "listeden silinmiş ama iptal edilmemiş satış finansal toplamda KALIR");

console.log("\n[İptal uygunluğu]");
let p = planCancel([A, B, C], false);
ok(p.eligible.length === 2 && p.eligible.includes(A) && p.eligible.includes(C), "aktif (gizli olsa da) satışlar iptal edilebilir");
ok(p.ineligible.length === 1 && p.ineligible[0].rec === B && /zaten iptal/.test(p.ineligible[0].reason), "iptal edilmiş satış yeniden iptal edilemez");
ok(planCancel([B, D], false).eligible.length === 0, "yalnız iptal edilmişler seçiliyse uygun kayıt yok");
ok(planCancel([rec({ name: "X", saleId: undefined })], false).eligible.length === 0, "gerçek hesapta satış kimliği olmayan kayıt işlenmez");
ok(planCancel([rec({ name: "X", saleId: undefined })], true).eligible.length === 1, "demo yerel kayıt (kimliksiz) önizlemede işlenir");

console.log("\n[Listeden silme / geri alma uygunluğu]");
p = planHide([A, B, C], false);
ok(p.eligible.length === 2 && p.eligible.includes(A) && p.eligible.includes(B), "aktif VE iptal edilmiş satış listeden silinebilir");
ok(p.ineligible.length === 1 && p.ineligible[0].rec === C, "zaten listeden silinmiş olan tekrar işlenmez");
p = planUnhide([A, C, D]);
ok(p.eligible.length === 2 && p.eligible.includes(C) && p.eligible.includes(D) && p.ineligible[0].rec === A, "geri alma yalnız listeden silinmişlere");

console.log("\n[Onay metinleri ve notlar]");
ok(CANCEL_CONFIRM_MESSAGE.includes("iptal edilecek") && CANCEL_CONFIRM_MESSAGE.includes("geri eklenecek"), "iptal onay metni (owner metni)");
ok(HIDE_CONFIRM_MESSAGE.includes("Stok miktarları değişmeyecek") && HIDE_CONFIRM_MESSAGE.includes("iptal edilmeyecek"), "listeden silme onay metni (owner metni)");
const multi = rec({ name: "M", otherCategoryItems: 2 });
let notes = confirmNotes(planCancel([multi, B], false));
ok(/başka kategorilerden ürün/.test(notes) && /TAMAMINA/.test(notes), "çok kategorili satış: işlemin satışın tamamına uygulanacağı yazıyor");
ok(/İşleme alınmayacak 1 kayıt/.test(notes) && /zaten iptal edilmiş/.test(notes), "karışık seçimde uygun olmayan kayıt adıyla gösteriliyor");
notes = confirmNotes(planHide([A], false));
ok(notes === "", "tek kategori + hepsi uygun → ek not yok");

console.log("\n[Migration yokken hata tespiti]");
ok(isMissingVisibilityColumn({ code: "42703", message: "column inventory_sales.hidden_at does not exist" }), "SELECT 42703 hidden_at");
ok(isMissingVisibilityColumn({ code: "PGRST204", message: "Could not find the 'hidden_at' column of 'inventory_sales' in the schema cache" }), "UPDATE PGRST204 hidden_at");
ok(!isMissingVisibilityColumn({ code: "42703", message: "column inventory_sales.foo does not exist" }), "başka kolon hatası gizlenmez");
ok(!isMissingVisibilityColumn({ code: "23505", message: "duplicate" }) && !isMissingVisibilityColumn(null), "ilgisiz hatalar gizlenmez");

console.log("\n[Sonuç mesajları]");
let m = describeVisibilityOutcome("hide", { ok: true, changed: 2, unchanged: 0, notFound: 0 }, 0);
ok(/2 satış görünür listeden kaldırıldı/.test(m) && /Stok ve satış durumu değişmedi/.test(m), `gizleme: "${m}"`);
m = describeVisibilityOutcome("hide", { ok: true, changed: 0, unchanged: 1, notFound: 1 }, 0);
ok(/zaten bu durumdaydı/.test(m) && /1 satış bulunamadı/.test(m), `tekrar + bulunamayan: "${m}"`);
m = describeVisibilityOutcome("unhide", { ok: true, changed: 1 }, 0);
ok(/yeniden listeye alındı/.test(m) && /Stok ve satış durumu değişmedi/.test(m), `geri alma: "${m}"`);
m = describeVisibilityOutcome("hide", { ok: false, error: "Listeden silme özelliği veritabanı güncellemesinden sonra etkinleşecek." }, 0);
ok(/veritabanı güncellemesinden sonra/.test(m), "migration yokken açık mesaj");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
