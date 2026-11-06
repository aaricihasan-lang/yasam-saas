/**
 * Klasik mükerrer kontrolü — PostgREST max-rows (Supabase varsayılanı 1000) SESSİZ KESME kanıtı.
 *
 * Sahte istemci gerçek PostgREST gibi davranır: her yanıt en çok MAX_ROWS satır (limit/range ne olursa olsun),
 * count=exact istenirse gerçek toplamı bildirir. Senaryolar: 1.001 ve 5.001 kişi analizi, eşleşen kayıt EN ESKİ
 * satır (tek sayfa okuma onu kaçırırdı). Eksik okuma / sayfa hatası → db_error (mükerrer yokmuş gibi DEĞİL).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/duplicate/paging.harness.ts
 */
import Module from "node:module";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  }
}

type Row = { id: string; tenant_id: string; kind: string; title: string; input: unknown; created_at: string; deleted_at: string | null };
const MAX_ROWS = 1000;

/** Gerçek PostgREST max-rows davranışını taklit eden minimal sorgu kurucu. */
function fakeDb(all: Row[], opts: { shrinkAfterCount?: number; failOnPage?: number } = {}) {
  const calls: Array<{ from: number | null; to: number | null; limit: number | null }> = [];
  let pageNo = 0;
  return {
    calls,
    from() {
      const st = { filters: [] as Array<(r: Row) => boolean>, count: false, from: null as number | null, to: null as number | null, limit: null as number | null };
      const q = {
        select(_c: string, o?: { count?: string }) { st.count = o?.count === "exact"; return q; },
        eq(k: keyof Row, v: unknown) { st.filters.push((r) => r[k] === v); return q; },
        is(k: keyof Row, v: unknown) { st.filters.push((r) => r[k] === v); return q; },
        order() { return q; },
        range(a: number, b: number) { st.from = a; st.to = b; return q; },
        limit(n: number) { st.limit = n; return q; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          try {
            const p = pageNo++;
            calls.push({ from: st.from, to: st.to, limit: st.limit });
            if (opts.failOnPage === p) return Promise.resolve({ data: null, error: { message: "sayfa hatası" }, count: null }).then(res, rej);
            const rows = all.filter((r) => st.filters.every((f) => f(r))).sort((x, y) => y.created_at.localeCompare(x.created_at) || x.id.localeCompare(y.id));
            const total = rows.length;
            // Okuma SIRASINDA veri değişti senaryosu: count gerçek toplamdan büyük bildirilir.
            const reportedCount = opts.shrinkAfterCount !== undefined ? total + opts.shrinkAfterCount : total;
            const start = st.from ?? 0;
            const want = st.to !== null ? st.to - start + 1 : st.limit ?? total;
            const data = rows.slice(start, start + Math.min(want, MAX_ROWS));
            return Promise.resolve({ data, error: null, count: st.count ? reportedCount : null }).then(res, rej);
          } catch (e) {
            return Promise.reject(e).then(res, rej);
          }
        },
      };
      return q;
    },
  };
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function seed(n: number): Row[] {
  const rows: Row[] = [];
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i++) {
    const isDup = i === 0; // EN ESKİ kayıt eşleşen kişi
    rows.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      tenant_id: T,
      kind: "person",
      title: isDup ? "Eski kayıt" : `K${i}`,
      input: isDup ? { fullName: "Çağrı Gülşen ŞÜKRÜOĞLU", birth: { year: 1950, month: 1, day: 1 } } : { fullName: `Kişi ${i}`, birth: { year: 1980, month: 1 + (i % 12), day: 1 + (i % 28) } },
      created_at: new Date(base + i * 60_000).toISOString(),
      deleted_at: null,
    });
  }
  // Başka tenant'ta aynı kişi (görünmemeli)
  rows.push({ ...rows[0], id: "11111111-1111-4111-8111-111111111111", tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  return rows;
}

async function main(): Promise<void> {
  const repo = await import("../../../lib/numeroloji-klasik/server/repository");
  const { findClassicDuplicates } = await import("../../../lib/numeroloji-klasik/duplicate");
  const check = { fullName: "ÇAĞRI GÜLŞEN ŞÜKRÜOĞLU", birth: { year: 1950, month: 1, day: 1 }, excludeId: null };

  for (const n of [1001, 5001]) {
    console.log(`\n— ${n} kişi analizi (max-rows ${MAX_ROWS}; eşleşen kayıt en eski)`);
    const all = seed(n);
    // Kanıt: tek istekli `.limit(5000)` okuma max-rows'ta kesilir ve en eski kaydı KAÇIRIR.
    const naive = fakeDb(all);
    const nv = (await (naive.from().select("id, title, input, created_at").eq("tenant_id", T).eq("kind", "person").is("deleted_at", null).order().order().limit(5000) as unknown as PromiseLike<{ data: Row[] }>)).data;
    ok(nv.length === MAX_ROWS && findClassicDuplicates(nv, check).length === 0, `eski tek istek (.limit(5000)) ${MAX_ROWS} satırda kesilir → eşleşmeyi KAÇIRIR`, nv.length);
    // Düzeltilmiş depo fonksiyonu: tüm sayfalar okunur.
    const db = fakeDb(all);
    const r = await repo.listPersonAnalysesForDuplicateCheck(db as never, T);
    ok(r.ok && r.value.length === n, `sayfalı okuma: ${n}/${n} satır`, r.ok ? r.value.length : r);
    const m = r.ok ? findClassicDuplicates(r.value, check) : [];
    ok(m.length === 1 && m[0].title === "Eski kayıt", "en eski (sınır dışı) eşleşme bulunur, başka tenant görünmez", m.map((x) => x.id));
    ok(db.calls.every((c) => c.from !== null && c.to !== null && c.to - c.from + 1 <= MAX_ROWS), "her istek max-rows altında range kullanır", db.calls.slice(0, 3));
    ok(db.calls.length === Math.ceil(n / 500), `sayfa sayısı ${Math.ceil(n / 500)} (500'lük)`, db.calls.length);
  }

  console.log("\n— okuma tamamlanamazsa sessiz 'mükerrer yok' DEĞİL");
  {
    const all = seed(1001);
    const rInc = await repo.listPersonAnalysesForDuplicateCheck(fakeDb(all, { shrinkAfterCount: 3 }) as never, T);
    ok(!rInc.ok && rInc.reason === "db_error", "count ≠ okunan satır (eksik okuma) → db_error", rInc);
    const rErr = await repo.listPersonAnalysesForDuplicateCheck(fakeDb(all, { failOnPage: 1 }) as never, T);
    ok(!rErr.ok && rErr.reason === "db_error", "2. sayfa hatası → db_error (kısmi sonuç kabul edilmez)", rErr);
  }

  console.log(`\nmükerrer sayfalama harness: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
void main();
