/**
 * Satış Öncesi Hata #3 — satış raporu eksiksizliği: İSTEMCİ harness'ı (DB yok, ağ yok, production'a SIFIR temas).
 *
 * Gerçek yükleyicileri (lib/urun-stok/salesHistoryDb: loadDbReportLines, loadDbCategorySales) ve gerçek
 * rapor mantığını (summarizeSales, topSelling, filterReportLines, compareLinesNewestFirst) sahte bir
 * /api/urun-stok/sales sunucusuyla (imleçli sayfalama + hata enjeksiyonu) çalıştırır.
 *
 *   - 2.001+ satış, 1.000+ kalem satırı, 5 kategori, yıl sınırını geçen tarihler → eksiksiz, doğru toplam
 *   - gerçek ISO tarih sıralaması (yerel "gg.aa.yyyy" metin sıralamasının yanlışlığı kanıtlanır)
 *   - ara sayfada hata → complete:false + açık uyarı (eksik toplam kesin sonuç DEĞİL)
 *   - tekrar eden kayıt (sayfa sınırında aynı kalem) → iki kez sayılmaz
 *   - sunucu kalem-sayısı tutarsızlığı / imleç kaybı → complete:false
 *
 * Çalıştır: npx tsx scripts/urun-stok/sales-report-completeness.harness.ts
 */
import { loadDbCategorySales, loadDbReportLines, salesLoadIssue, SALES_PAGE_SIZE } from "@/lib/urun-stok/salesHistoryDb";
import { compareLinesNewestFirst, filterReportLines, summarizeSales, topSelling, type ReportSaleLine } from "@/lib/urun-stok/salesReportsLogic";

let pass = 0;
let fail = 0;
const ok = (c: unknown, m: string) => {
  if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); }
};

// ───────── sahte tarayıcı oturumu ─────────
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const g = globalThis as unknown as Record<string, unknown>;
const storage = new MemStorage();
g.window = globalThis;
g.localStorage = storage;
storage.setItem("yasam_user", JSON.stringify({ id: "u-test", role: "expert", tenant_id: "11111111-1111-1111-1111-111111111111" }));
storage.setItem("yasam_session_token", "test-token");

// ───────── sahte veri ─────────
const CATS = ["dogaltas", "oil", "soap_cream", "accessory", "other"] as const;
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
type Sale = { id: string; source: string; status: "completed" | "cancelled"; note: string; sold_at: string; total_cost: number; total_sale: number; total_profit: number; item_count: number; cancelled_at: null; hidden_at: null };
type Item = { id: string; sale_id: string; inventory_type: string; inventory_id: string; product_name_snapshot: string; product_subtitle_snapshot: string; unit: string; quantity: number; unit_cost_snapshot: number; unit_sale_price_snapshot: number; markup_pct: number; currency_snapshot: string; line_cost_total: number; line_sale_total: number; line_profit: number; created_at: string };

let SALES: Sale[] = [];
let ITEMS: Item[] = [];
function seed(nSales: number, itemsFor: (i: number) => number, opts: { cancelledEvery?: number } = {}) {
  SALES = []; ITEMS = [];
  let itemSeq = 1;
  const base = Date.UTC(2025, 11, 31, 22, 0, 0); // 31.12.2025 → yıl sınırını geçer
  for (let i = 0; i < nSales; i++) {
    const soldAt = new Date(base + i * 37 * 60_000).toISOString(); // her satış 37 dk sonra
    const id = uuid(i + 1);
    const n = itemsFor(i);
    const status = opts.cancelledEvery && i % opts.cancelledEvery === 0 ? "cancelled" : "completed";
    let tc = 0, ts = 0;
    for (let k = 0; k < n; k++) {
      const cat = CATS[(i + k) % CATS.length];
      const qty = 1 + ((i + k) % 3);
      const cost = 10 + (k % 4), sale = 25 + (i % 7);
      ITEMS.push({ id: uuid(1_000_000 + itemSeq++), sale_id: id, inventory_type: cat, inventory_id: uuid(5_000_000 + k), product_name_snapshot: `Ürün ${cat}-${(i + k) % 9}`, product_subtitle_snapshot: "", unit: "adet", quantity: qty, unit_cost_snapshot: cost, unit_sale_price_snapshot: sale, markup_pct: 0, currency_snapshot: "TRY", line_cost_total: cost * qty, line_sale_total: sale * qty, line_profit: (sale - cost) * qty, created_at: soldAt });
      tc += cost * qty; ts += sale * qty;
    }
    SALES.push({ id, source: "central", status, note: "", sold_at: soldAt, total_cost: tc, total_sale: ts, total_profit: ts - tc, item_count: n, cancelled_at: null, hidden_at: null });
  }
}

// ───────── sahte sunucu (gerçek sunucunun imleç sözleşmesi) + hata enjeksiyonu ─────────
type Fault = { failAtCall?: number; duplicateBoundary?: boolean; mismatchSaleAtCall?: number; dropCursorAtCall?: number };
let fault: Fault = {};
let calls = 0;
const desc = <T extends { id: string }>(arr: T[], key: (x: T) => string) => [...arr].sort((a, b) => (key(a) === key(b) ? (a.id < b.id ? 1 : -1) : key(a) < key(b) ? 1 : -1));
function afterCursor<T extends { id: string }>(arr: T[], key: (x: T) => string, cursor: string | null): T[] {
  if (!cursor) return arr;
  const i = cursor.lastIndexOf("|");
  const ts = cursor.slice(0, i), id = cursor.slice(i + 1);
  return arr.filter((x) => key(x) < ts || (key(x) === ts && x.id < id));
}
g.fetch = async (path: string) => {
  calls++;
  if (fault.failAtCall === calls) return new Response(JSON.stringify({ ok: false, error: "Satış geçmişi okunamadı." }), { status: 500 });
  const u = new URL(path, "http://x");
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 50), 200);
  const cursor = u.searchParams.get("cursor");
  const status = u.searchParams.get("status");
  const invType = u.searchParams.get("inventory_type");
  let body: Record<string, unknown>;
  if (invType) {
    const all = desc(ITEMS.filter((it) => it.inventory_type === invType), (x) => x.created_at);
    const rest = afterCursor(all, (x) => x.created_at, cursor);
    let page = rest.slice(0, limit);
    const hasMore = rest.length > limit;
    const last = page[page.length - 1];
    if (fault.duplicateBoundary && cursor) page = [all[all.indexOf(rest[0]) - 1], ...page]; // önceki sayfanın son kalemi tekrar
    const ids = new Set(page.map((p) => p.sale_id));
    body = { ok: true, items: page, sales: SALES.filter((s) => ids.has(s.id)), hasMore, nextCursor: hasMore ? `${last.created_at}|${last.id}` : null, itemCountMismatch: [] };
  } else {
    const all = desc(SALES.filter((s) => !status || s.status === status), (x) => x.sold_at);
    const rest = afterCursor(all, (x) => x.sold_at, cursor);
    const page = rest.slice(0, limit);
    const hasMore = rest.length > limit;
    const ids = new Set(page.map((s) => s.id));
    let items = ITEMS.filter((it) => ids.has(it.sale_id));
    if (fault.duplicateBoundary && cursor) items = [...items, ...items.slice(0, 3)];
    const mismatch = fault.mismatchSaleAtCall === calls ? [page[0].id] : [];
    const last = page[page.length - 1];
    let next: string | null = hasMore ? `${last.sold_at}|${last.id}` : null;
    if (fault.dropCursorAtCall === calls) next = null;
    body = { ok: true, sales: page, items, hasMore, nextCursor: next, itemCountMismatch: mismatch };
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
};
const reset = (f: Fault = {}) => { fault = f; calls = 0; };
const expected = () => {
  const done = new Set(SALES.filter((s) => s.status === "completed").map((s) => s.id));
  const its = ITEMS.filter((it) => done.has(it.sale_id));
  return { lines: its.length, revenue: its.reduce((a, i) => a + i.line_sale_total, 0), cost: its.reduce((a, i) => a + i.line_cost_total, 0) };
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

async function main() {
  console.log("[1] 2.001 satış + 1.000+ kalem, 5 kategori, yıl sınırı — eksiksiz rapor");
  seed(2001, (i) => (i < 300 ? 4 : 1), { cancelledEvery: 50 }); // ilk 300 satış 4 kalem → bir sayfada 800, toplam 2.901 kalem
  reset();
  let r = await loadDbReportLines();
  const ex = expected();
  ok(ex.lines > 2000 && ITEMS.length > 1000, `veri seti: ${SALES.length} satış, ${ITEMS.length} kalem (${ex.lines} tamamlanmış kalem)`);
  ok(r.complete && r.error === null && salesLoadIssue(r) === null, "yükleme TAMAM (complete:true, uyarı yok)");
  ok(r.lines.length === ex.lines, `2.000 sınırı yok: ${r.lines.length} satır = beklenen ${ex.lines}`);
  ok(calls === Math.ceil(SALES.filter((s) => s.status === "completed").length / SALES_PAGE_SIZE), `imleçle sonuna kadar okundu (${calls} sayfa)`);
  const sum = summarizeSales(filterReportLines(r.lines, { q: "", category: "all", period: "all" }));
  ok(near(sum.totalRevenue, ex.revenue) && near(sum.totalCost, ex.cost), `toplam ciro ${sum.totalRevenue} / maliyet ${sum.totalCost} = bağımsız hesap`);
  ok(new Set(r.lines.map((l) => l.id)).size === r.lines.length, "her kalem tek kez (tekrar yok)");
  const cats = new Map<string, number>();
  for (const l of r.lines) cats.set(l.category, (cats.get(l.category) ?? 0) + l.lineSale);
  const exCats = new Map<string, number>();
  const done = new Set(SALES.filter((s) => s.status === "completed").map((s) => s.id));
  for (const it of ITEMS) if (done.has(it.sale_id)) exCats.set(it.inventory_type, (exCats.get(it.inventory_type) ?? 0) + it.line_sale_total);
  ok(cats.size === 5 && [...exCats].every(([c, v]) => near(cats.get(c) ?? -1, v)), "kategori dağılımı (5 kategori ciro) bağımsız hesapla aynı");
  const top = topSelling(r.lines, 3);
  const qty = new Map<string, number>();
  for (const it of ITEMS) if (done.has(it.sale_id)) qty.set(it.product_name_snapshot, (qty.get(it.product_name_snapshot) ?? 0) + it.quantity);
  const exTop = [...qty.entries()].sort((a, b) => b[1] - a[1])[0];
  ok(top[0]?.productName === exTop[0] && near(top[0].qty, exTop[1]), `en çok satan ürün eksiksiz veriyle: ${top[0]?.productName} (${top[0]?.qty})`);

  console.log("[2] Tarih sıralaması gerçek ISO değerine göre");
  const iso = r.lines.map((l) => l.date!.getTime());
  ok(iso.every((t, i) => i === 0 || iso[i - 1] >= t), "satırlar en yeni → en eski (gerçek tarih)");
  ok(r.lines[0].date!.getUTCFullYear() === 2026 && r.lines[r.lines.length - 1].date!.getUTCFullYear() === 2025, "yıl sınırı: 2026 en üstte, 2025 en altta");
  const mk = (id: string, isoStr: string): ReportSaleLine => ({ id, timestamp: new Date(isoStr).toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), date: new Date(isoStr) } as ReportSaleLine);
  const sample = [mk("a", "2025-12-30T10:00:00Z"), mk("b", "2026-11-01T10:00:00Z"), mk("c", "2026-10-28T10:00:00Z")];
  const oldOrder = [...sample].sort((x, y) => (y.timestamp || "").localeCompare(x.timestamp || "")).map((l) => l.id).join("");
  const newOrder = [...sample].sort(compareLinesNewestFirst).map((l) => l.id).join("");
  ok(oldOrder !== "bca" && newOrder === "bca", `ESKİ metin sıralaması yanlıştı (${oldOrder}); YENİ ISO sıralaması doğru (${newOrder})`);

  console.log("[3] Başarısız veri yüklemesi → eksik toplam kesin sonuç DEĞİL");
  reset({ failAtCall: 4 });
  r = await loadDbReportLines();
  ok(!r.complete && r.error !== null, "3. sayfadan sonra hata → complete:false, hata bilgisi var");
  ok(r.lines.length > 0 && r.lines.length < ex.lines, `kısmi satırlar (${r.lines.length} < ${ex.lines}) TAM sayılmadı`);
  ok(/kesin sonuç olarak gösterilmiyor/.test(salesLoadIssue(r) ?? ""), "kullanıcıya açık eksik-veri uyarısı üretilir");
  reset({ failAtCall: 1 });
  r = await loadDbReportLines();
  ok(!r.complete && r.lines.length === 0 && salesLoadIssue(r) !== null, "ilk sayfa hatası → boş + uyarı ('0 ₺' kesin sonuç olarak gösterilmez)");

  console.log("[4] Tekrar eden kayıt / tutarsızlık / imleç kaybı");
  reset({ duplicateBoundary: true });
  r = await loadDbReportLines();
  ok(r.complete && r.lines.length === ex.lines, `sayfa sınırında tekrarlanan kalemler iki kez sayılmadı (${r.lines.length})`);
  const sum2 = summarizeSales(r.lines);
  ok(near(sum2.totalRevenue, ex.revenue), "tekrar enjeksiyonunda toplam ciro değişmedi");
  reset({ mismatchSaleAtCall: 2 });
  r = await loadDbReportLines();
  ok(!r.complete && /kalem sayısı tutarsız/.test(r.reason ?? ""), "sunucu kalem-sayısı tutarsızlığı → complete:false");
  reset({ dropCursorAtCall: 2 });
  r = await loadDbReportLines();
  ok(!r.complete && /sayfa imleci/.test(r.reason ?? ""), "hasMore varken imleç yok → complete:false (sessiz kesilme yok)");

  console.log("[5] Kategori geçmişi (kalem bazlı sayfalama)");
  seed(2600, (i) => (i % 5 === 0 ? 2 : 1)); // oil kategorisinde 1.000+ kalem
  reset();
  const cr = await loadDbCategorySales("oil");
  const oilItems = ITEMS.filter((it) => it.inventory_type === "oil");
  const oilSales = new Set(oilItems.map((it) => it.sale_id));
  ok(oilItems.length > 1000 && cr.complete, `oil: ${oilItems.length} kalem, yükleme tamam`);
  ok(cr.sales.length === oilSales.size && cr.sales.reduce((a, s) => a + s.items.length, 0) === oilItems.length, `satış/kalem sayısı eksiksiz (${cr.sales.length} satış)`);
  const st = cr.sales.map((s) => new Date(s.soldAt).getTime());
  ok(st.every((t, i) => i === 0 || st[i - 1] >= t), "kategori satışları gerçek tarihe göre en yeni önce");
  reset({ duplicateBoundary: true });
  const cr2 = await loadDbCategorySales("oil");
  ok(cr2.complete && cr2.sales.reduce((a, s) => a + s.items.length, 0) === oilItems.length, "kategori: sayfa sınırında tekrar eden kalem iki kez eklenmedi");
  reset({ failAtCall: 3 });
  const cr3 = await loadDbCategorySales("oil");
  ok(!cr3.complete && salesLoadIssue(cr3) !== null, "kategori: ara sayfa hatası → complete:false + uyarı");

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
