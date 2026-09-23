/**
 * Beslenme besin listesi/seçici SAYFALAMA harness'i — SAF reducer sözleşmeleri.
 *   50-kayıt UI sınırının giderilmesi: offset tabanlı "daha fazla yükle", stale-yanıt koruması,
 *   tekilleştirme, sorgu değişiminde reset, hata durumlarının listeyi bozmaması.
 * DB'ye BAĞLANMAZ; yalnız foodPaginationReducer davranışını doğrular.
 */
import {
  foodPaginationReducer,
  initialFoodPaginationState,
  foodPaginationHasMore,
  mergeDedupById,
  type FoodPaginationState,
  type FoodPageAction,
} from "@/lib/beslenme/foodPagination";
import type { Food } from "@/lib/beslenme/beslenmeClient";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function chk(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  FAIL  ${name}`);
  }
}

// Sahte besin üretici (yalnız id/name_tr önemli).
const mk = (id: string): Food =>
  ({ id, name_tr: id, name_en: null, aliases: [], food_group_id: null, prep_state: null, description: null, notes: null, is_active: true, sort_order: 0, created_at: "", updated_at: "", tenant_id: "t" }) as Food;
const page = (from: number, count: number): Food[] => Array.from({ length: count }, (_, i) => mk(`f${from + i}`));

const reduce = (s: FoodPaginationState, a: FoodPageAction) => foodPaginationReducer(s, a);

// Hook'un seq mantığını taklit eden mini sürücü.
class Driver {
  s: FoodPaginationState = initialFoodPaginationState();
  seq = 0;
  reset(queryKey: string) {
    this.seq += 1;
    this.s = reduce(this.s, { type: "reset", seq: this.seq, queryKey });
    return this.seq;
  }
  more() {
    this.seq += 1;
    this.s = reduce(this.s, { type: "loadMore", seq: this.seq });
    return this.seq;
  }
  success(seq: number, items: Food[], total: number) {
    this.s = reduce(this.s, { type: "success", seq, items, total });
  }
  error(seq: number, code: string, status: number) {
    this.s = reduce(this.s, { type: "error", seq, code, status });
  }
  ids() {
    return this.s.items.map((f) => f.id);
  }
}

// ── T1 mergeDedupById: tekilleştirir, sıra korunur ──
{
  const merged = mergeDedupById([mk("a"), mk("b")], [mk("b"), mk("c"), mk("a"), mk("d")]);
  chk("T1 dedup + sıra korunur", merged.map((f) => f.id).join(",") === "a,b,c,d");
}

// ── T2 ilk sayfa + toplam ──
{
  const d = new Driver();
  const s = d.reset("");
  chk("T2 reset → first loading, items boş", d.s.first === "loading" && d.s.items.length === 0);
  d.success(s, page(0, 100), 632);
  chk("T2 ilk sayfa → 100 item, total 632, ready", d.s.items.length === 100 && d.s.total === 632 && d.s.first === "ready");
  chk("T2 hasMore true (100<632)", foodPaginationHasMore(d.s) === true);
}

// ── T3 ardışık sayfalarla SON kayda ulaşma; tekrar/atlama YOK ──
{
  const d = new Driver();
  d.success(d.reset(""), page(0, 100), 632);
  let from = 100;
  while (foodPaginationHasMore(d.s)) {
    const seq = d.more();
    const count = Math.min(100, 632 - from);
    d.success(seq, page(from, count), 632);
    from += count;
  }
  chk("T3 tüm 632 yüklendi", d.s.items.length === 632);
  chk("T3 hasMore false (son sayfa)", foodPaginationHasMore(d.s) === false);
  const unique = new Set(d.ids());
  chk("T3 duplicate YOK", unique.size === 632);
  chk("T3 atlama YOK (f0..f631 tam)", d.ids()[0] === "f0" && d.ids()[631] === "f631");
}

// ── T4 50'den fazla eşleşen arama (total 120, sayfa 100) ──
{
  const d = new Driver();
  d.success(d.reset("elma"), page(0, 100), 120);
  chk("T4 ilk sayfa 100/120, hasMore", d.s.items.length === 100 && foodPaginationHasMore(d.s));
  const seq = d.more();
  d.success(seq, page(100, 20), 120);
  chk("T4 ikinci sayfa → 120, hasMore false", d.s.items.length === 120 && !foodPaginationHasMore(d.s));
}

// ── T5 arama/filtre değişince sayfalama sıfırlanır ──
{
  const d = new Driver();
  d.success(d.reset("a"), page(0, 100), 300);
  chk("T5 önce 100 item", d.s.items.length === 100);
  d.reset("b"); // yeni sorgu
  chk("T5 reset → items temizlendi + loading", d.s.items.length === 0 && d.s.first === "loading" && d.s.queryKey === "b");
}

// ── T6 stale/geç gelen yanıt yeni sorguyu BOZMAZ ──
{
  const d = new Driver();
  const seqA = d.reset("a"); // eski sorgu isteği
  const seqB = d.reset("b"); // kullanıcı yeni sorgu yazdı
  d.success(seqA, page(0, 100), 300); // A'nın GEÇ gelen yanıtı
  chk("T6 stale success (eski seq) yok sayıldı", d.s.items.length === 0 && d.s.first === "loading");
  d.success(seqB, page(500, 40), 40); // B'nin yanıtı
  chk("T6 güncel success uygulandı", d.s.items.length === 40 && d.s.items[0].id === "f500");
}

// ── T7 "daha fazla" hatası mevcut listeyi SİLMEZ, güvenle tekrar denenir ──
{
  const d = new Driver();
  d.success(d.reset(""), page(0, 100), 300);
  const seqErr = d.more();
  d.error(seqErr, "NETWORK", 0);
  chk("T7 more error → liste korunur (100)", d.s.items.length === 100 && d.s.more === "error");
  chk("T7 more error → first hâlâ ready", d.s.first === "ready");
  const seqRetry = d.more(); // tekrar dene
  chk("T7 retry more dispatch edildi (more loading)", d.s.more === "loading");
  d.success(seqRetry, page(100, 100), 300);
  chk("T7 retry başarı → 200 item", d.s.items.length === 200 && d.s.more === "idle");
}

// ── T8 ilk sayfa API hatası → error state, reload ile toparlar ──
{
  const d = new Driver();
  const seq = d.reset("");
  d.error(seq, "LIST_FAILED", 500);
  chk("T8 ilk sayfa hatası → first error, items boş", d.s.first === "error" && d.s.items.length === 0);
  const seq2 = d.reset(""); // reload
  d.success(seq2, page(0, 50), 50);
  chk("T8 reload → ready + 50 item", d.s.first === "ready" && d.s.items.length === 50);
}

// ── T9 boş sonuç ──
{
  const d = new Driver();
  d.success(d.reset("xyzzy"), [], 0);
  chk("T9 boş sonuç → ready, 0 item, hasMore false", d.s.first === "ready" && d.s.items.length === 0 && !foodPaginationHasMore(d.s));
}

// ── T10 son sayfada loadMore no-op (over-fetch YOK) ──
{
  const d = new Driver();
  d.success(d.reset(""), page(0, 50), 50); // total==items
  const before = d.s;
  const seq = d.more(); // guard: items>=total → reducer değiştirmez
  chk("T10 dolu listede loadMore no-op", d.s === before || (d.s.more !== "loading"));
  chk("T10 hasMore false", !foodPaginationHasMore(d.s));
  void seq;
}

// ── T11 "daha fazla" sırasında gelen stale success eklenmez ──
{
  const d = new Driver();
  d.success(d.reset(""), page(0, 100), 300);
  const seqMore = d.more();
  d.reset(""); // arada yeni sorgu → seq ilerledi, items sıfırlandı
  d.success(seqMore, page(100, 100), 300); // eski "more" yanıtı geç geldi
  chk("T11 stale more success yok sayıldı", d.s.items.length === 0 && d.s.first === "loading");
}

console.log(`\n${"=".repeat(52)}\n  FOOD PAGINATION HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  console.log("  FAILURES:\n   - " + fails.join("\n   - "));
  process.exit(1);
}
console.log("  ✅ Sayfalama sözleşmeleri GEÇTİ");
process.exit(0);
