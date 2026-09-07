// ============================================================
// Beslenme Plan Word — SATIR SAYFALAMA (fetchAllPaged) harness (DB-siz, deterministik).
//
// Amaç: PostgREST/Supabase 1000-satır yanıt sınırı yüzünden büyük planlarda Word nutrient/item
// satırlarının SESSİZCE kırpılması bug'ının çözümünü (lib/beslenme/word/pagedFetch.ts) doğrular.
//
// Kapsam:
//   - Tam satır korunumu: N ∈ {0,1,999,1000,1001,1430,2000,2001,3000} (sayfa sınırları dahil)
//   - Duplicate YOK / eksik YOK / sıra korunur
//   - Error propagation (ilk ve orta sayfada)
//   - Sonsuz-döngü guard (her sayfa dolu dönen kaynak → üst sınırda throw)
//
// Çalıştır:  npx tsx scripts/beslenme-word/paginationHarness.mjs
// FAIL → exit 1.
// ============================================================
import { fetchAllPaged, PAGE_SIZE } from "../../lib/beslenme/pagedFetch.ts";

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

/**
 * PostgREST .range(from,to) taklidi: tek sorgu yanıtı sunucu max-row (1000) ile SINIRLI.
 * fetchAllPaged pageSize=1000 pencerelerle sorar → her yanıt ≤ 1000. rows: {id, v} dizisi.
 */
function makeTableFetcher(rows, { failAtCall = null } = {}) {
  const SERVER_MAX = 1000;
  let calls = 0;
  return async (from, to) => {
    calls += 1;
    if (failAtCall !== null && calls === failAtCall) {
      return { data: null, error: { message: "simulated db error" } };
    }
    const windowSize = Math.max(0, to - from + 1);
    const take = Math.min(windowSize, SERVER_MAX);
    return { data: rows.slice(from, from + take), error: null };
  };
}

function buildRows(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) out[i] = { id: i, v: `r${i}` };
  return out;
}

console.log("── fetchAllPaged: tam satır korunumu (sayfa sınırları) ──");
for (const n of [0, 1, 999, 1000, 1001, 1430, 2000, 2001, 3000]) {
  const rows = buildRows(n);
  const got = await fetchAllPaged(makeTableFetcher(rows));
  const countOk = got.length === n;
  const ids = got.map((r) => r.id);
  const orderOk = ids.every((id, i) => id === i);
  const uniqueOk = new Set(ids).size === n; // duplicate YOK
  const noMissing = ids.length === n && ids[0] === (n ? 0 : undefined) && ids[n - 1] === (n ? n - 1 : undefined);
  check(`N=${n}: satır sayısı=${n}`, countOk, `got ${got.length}`);
  check(`N=${n}: sıra korunur (0..${n - 1})`, orderOk);
  check(`N=${n}: duplicate YOK`, uniqueOk, `distinct ${new Set(ids).size}`);
  check(`N=${n}: eksik satır YOK`, noMissing);
}

console.log("── fetchAllPaged: 1000-satır sınırının ÖTESİ gerçekten çekiliyor ──");
{
  // Kırpma bug'ının birebir senaryosu: 1430 satır. Bug'lı kod 1000 döndürürdü.
  const rows = buildRows(1430);
  const got = await fetchAllPaged(makeTableFetcher(rows));
  check("1430 satır: kırpma YOK (1000 değil 1430)", got.length === 1430, `got ${got.length}`);
  check("1430 satır: son satır (id=1429) MEVCUT", got.some((r) => r.id === 1429));
}

console.log("── fetchAllPaged: error propagation (sessiz yutma YOK) ──");
{
  let threw = false, msg = "";
  try { await fetchAllPaged(makeTableFetcher(buildRows(10), { failAtCall: 1 })); }
  catch (e) { threw = true; msg = String(e && e.message || e); }
  check("ilk sayfada error → throw", threw, msg);
  check("error mesajı propagate", /simulated db error/.test(msg), msg);
}
{
  // 2500 satır → 3. sorguda hata; kısmî sonuç DÖNMEMELİ, throw etmeli.
  let threw = false;
  try { await fetchAllPaged(makeTableFetcher(buildRows(2500), { failAtCall: 2 })); }
  catch { threw = true; }
  check("orta sayfada error → throw (kısmî sonuç yok)", threw);
}

console.log("── fetchAllPaged: sonsuz-döngü guard ──");
{
  // Her sayfa DOLU dönen (asla bitmeyen) kaynak → maxPages üst sınırında throw.
  const alwaysFull = async (from, to) => {
    const size = to - from + 1;
    const data = new Array(size);
    for (let i = 0; i < size; i += 1) data[i] = { id: from + i };
    return { data, error: null };
  };
  let threw = false, msg = "";
  try { await fetchAllPaged(alwaysFull, 4 /* pageSize */, 3 /* maxPages */); }
  catch (e) { threw = true; msg = String(e && e.message || e); }
  check("bitmeyen kaynak → üst sınırda throw", threw, msg);
  check("guard mesajı 'sayfa üst sınırı'", /sayfa üst sınırı/.test(msg), msg);
}

console.log("── sabitler ──");
check("PAGE_SIZE === 1000 (Supabase max-row ile uyumlu)", PAGE_SIZE === 1000, String(PAGE_SIZE));

console.log("");
console.log(`SONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:", failures.join(", ")); process.exit(1); }
console.log("✅ fetchAllPaged pagination — TÜM TESTLER PASS (lossless, no-dup, no-missing, guarded)");
