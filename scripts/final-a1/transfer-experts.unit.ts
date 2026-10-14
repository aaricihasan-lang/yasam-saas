/**
 * Final-A1 #2/#3 — Veri Aktarım Merkezi hedef uzman listesi (SAF; DB/ağ yok).
 * Sunucu sayfalamasını taklit eden sahte API ile istemci sayfa-birleştirme mantığı uçtan uca sınanır.
 * Çalıştır: npx tsx scripts/final-a1/transfer-experts.unit.ts
 */
import {
  mapTransferExpertRows,
  mergeTransferExpertPages,
  remainingTransferExperts,
  transferExpertListUrl,
  TRANSFER_EXPERT_PAGE_SIZE,
  type TransferExpertOption,
} from "../../lib/admin/transferExpertList";
import { parseMemberListQuery } from "../../lib/admin/memberListQuery";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

type Row = { id: string; role: string; full_name: string; email: string; tenant_id: string | null; is_demo_account?: boolean };
const pad = (n: number) => String(n).padStart(3, "0");
function experts(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-000000000${pad(i)}`,
    role: "expert",
    full_name: `ZZ Uzman ${pad(i)}`,
    email: `zz-uzman-${pad(i)}@example.invalid`,
    tenant_id: `aaaaaaaa-0000-4000-8000-000000000${pad(i)}`,
  }));
}
const fold = (s: string) => s.toLocaleLowerCase("tr-TR");

/** /api/admin/users sözleşmesini taklit eder: q (ad+e-posta), page/pageSize, total. */
function fakeApi(all: Row[], url: string) {
  const sp = new URL(url, "http://x").searchParams;
  const parsed = parseMemberListQuery(sp);
  if (!parsed.ok) return { status: 400, users: [] as Row[], total: 0 };
  const q = fold(parsed.value.q);
  const hit = all.filter((r) => !q || fold(r.full_name).includes(q) || fold(r.email).includes(q));
  const start = (parsed.value.page - 1) * parsed.value.pageSize;
  return { status: 200, users: hit.slice(start, start + parsed.value.pageSize), total: hit.length };
}

/** İstemci akışı: ilk sayfa + kalan oldukça "Daha fazla yükle". */
function loadAll(all: Row[], query: string) {
  let page = 1;
  let res = fakeApi(all, transferExpertListUrl(query, page));
  let list: TransferExpertOption[] = mapTransferExpertRows(res.users);
  const firstPage = list.length;
  let clicks = 0;
  while (remainingTransferExperts(list.length, res.total) > 0 && clicks < 100) {
    page++;
    clicks++;
    res = fakeApi(all, transferExpertListUrl(query, page));
    list = mergeTransferExpertPages(list, mapTransferExpertRows(res.users));
  }
  return { list, total: res.total, firstPage, clicks };
}

console.log("[1] İstek adresi — sunucu sözleşmesine uygun");
{
  const u = new URL(transferExpertListUrl("  Ayşe  ", 3), "http://x");
  const p = u.searchParams;
  ok(u.pathname === "/api/admin/users", "uç nokta /api/admin/users");
  ok(p.get("role") === "expert" && p.get("active") === "active", "filtre değişmedi: role=expert & active=active");
  ok(p.get("q") === "Ayşe" && p.get("page") === "3" && p.get("pageSize") === String(TRANSFER_EXPERT_PAGE_SIZE) && p.get("sort") === "name_asc", "q kırpılır, page/pageSize/sort", u.search);
  ok(!new URL(transferExpertListUrl("   ", 1), "http://x").searchParams.has("q"), "boş arama q yazmaz");
  ok(parseMemberListQuery(p).ok === true, "parseMemberListQuery adresi KABUL ediyor (400 yok)");
}

for (const n of [7, 50, 51, 137]) {
  console.log(`\n[2] ${n} uzman`);
  const r = loadAll(experts(n), "");
  ok(r.list.length === n && r.total === n, `${n} uzmanın TAMAMI listelenir (kayıp yok)`, { got: r.list.length, total: r.total });
  ok(new Set(r.list.map((e) => e.id)).size === n, "tekrar yok");
  ok(r.firstPage === Math.min(n, 50), `ilk sayfa ${Math.min(n, 50)}`);
  ok(r.clicks === Math.ceil(n / 50) - 1, `"Daha fazla" tıklaması ${Math.ceil(n / 50) - 1}`);
  ok(remainingTransferExperts(Math.min(n, 50), n) === Math.max(0, n - 50), `ilk sayfadan sonra kalan ${Math.max(0, n - 50)} (sessizce gizlenmez)`);
}

console.log("\n[3] Arama");
{
  const all = experts(60);
  all[57] = { ...all[57], full_name: "Şükrü IŞIK", email: "sukru.isik@example.invalid" };
  all[12] = { ...all[12], full_name: "Zeynep Kaya", email: "kaya.special@example.invalid" };
  const byName = loadAll(all, "şükrü ışık");
  ok(byName.list.length === 1 && byName.list[0].fullName === "Şükrü IŞIK", "isimle (2. sayfadaki uzman, Türkçe büyük/küçük)", byName.list);
  const byEmail = loadAll(all, "kaya.special@");
  ok(byEmail.list.length === 1 && byEmail.list[0].email === "kaya.special@example.invalid", "e-posta ile", byEmail.list);
  const none = loadAll(all, "zz-yok-boyle-biri");
  ok(none.list.length === 0 && none.total === 0 && none.clicks === 0, "sonuç yok → boş liste, 'daha fazla' yok");
  const many = loadAll(all, "zz uzman");
  ok(many.list.length === 58 && many.total === 58, "çok sonuçlu arama da sayfalanır (58)", many.total);
}

console.log("\n[4] Satır eşleme + demo hesap");
{
  const rows = [
    { id: "a", role: "expert", full_name: "", email: "only@mail.invalid", tenant_id: " " },
    { id: "b", role: "admin", full_name: "Yönetici", email: "adm@mail.invalid", tenant_id: "t" },
    { id: "", role: "expert", full_name: "Kimliksiz", email: "x@mail.invalid", tenant_id: "t" },
    { id: "d", role: "expert", full_name: "Demo Vitrin", email: "uzman@test.com", tenant_id: "td", is_demo_account: true },
  ];
  const m = mapTransferExpertRows(rows);
  ok(m.length === 2 && m[0].id === "a" && m[1].id === "d", "admin ve kimliksiz satır atılır; demo uzman (önceki davranış gibi) listede kalır", m);
  ok(m[0].fullName === "only@mail.invalid" && m[0].tenantId === null, "ad yoksa e-posta; boş tenant → null (aktarım engeli korunur)", m[0]);
  ok(mapTransferExpertRows(null).length === 0 && mapTransferExpertRows({}).length === 0, "bozuk yanıt → boş");
  // Demo hariç sayım Üye Yönetimi sayaçlarına aittir; bu liste sunucu `total`ını aynen gösterir (ek sayım yok).
  ok(remainingTransferExperts(50, 50) === 0 && remainingTransferExperts(60, 51) === 0, "kalan asla negatif değil");
}

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
process.exit(fail === 0 ? 0 : 1);
