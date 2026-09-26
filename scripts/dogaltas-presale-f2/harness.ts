/**
 * Doğaltaş SATIŞ-ÖNCESİ NİHAİ — FAZ 2 regresyon harness'i.
 *
 * Kapsam (saf mantık + kaynak-tarama kapıları; çalışan DB gerektirmez):
 *   F-05  mineral semantiği: mineral koşulu assignments.Mineraller'den çözülür,
 *         taşın SERBEST açıklama metninden DEĞİL.
 *   F-01/DT-S1  server-side arama: minerals SQL .or(ilike); stone metin araması
 *         needsFullLoad'dan çıkarıldı (mode=list); limit clamp; condition endpoint.
 *   F-02  combination_stones ilişkisel model + RPC'ler + updated_at + backfill.
 *   F-03  optimistic concurrency: stone/mineral/combination PATCH version guard + 409.
 *   IA    menü sadeleştirme (4 ana + oluşturma route'ları korunur).
 *   trgm  arama index migration.
 *
 * Çalıştır: npx tsx scripts/dogaltas-presale-f2/harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  buildMineralsListSearchOrFilter,
} from "../../lib/dogaltas/mineralsListFetch";
import {
  evaluateStoneConditions,
  type SearchCondition,
  type ConditionStone,
} from "../../lib/dogaltas/stoneConditionSearch";
import {
  DOGALTAS_MODULES,
  DOGALTAS_PRIMARY_MODULES,
  findDogaltasModuleByPath,
} from "../../lib/dogaltas/dogaltasModules";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error(`  ✗ ${name}`); }
}
function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// ─── F-05 / mineral semantiği (assignments.Mineraller vs serbest metin) ──────────
{
  // Taş: mineral atamasında "Demir" var; serbest açıklamasında "güç" geçiyor
  // (fiziksel etki gibi) ama mineral atamasında "güç" YOK.
  const stone: ConditionStone = {
    stone_name: "Hematit",
    chakras: ["Kök"],
    assignments: {
      Mineraller: [["Demir", ""], ["Oksijen", "%30"]],
      // NOT: açıklama/fiziksel etki assignments'ta DEĞİL — koşul motoru bunları görmez.
    },
  };
  const cond = (type: SearchCondition["type"], value: string, minPercent: number | null = null): SearchCondition[] =>
    [{ id: "c0", type, value, minPercent }];

  ok("F-05 mineral adı (Demir) eşleşir", evaluateStoneConditions(stone, cond("mineral", "Demir")).matches);
  ok("F-05 mineral 'güç' (serbest metin) EŞLEŞMEZ (assignments'ta yok)",
    !evaluateStoneConditions(stone, cond("mineral", "güç")).matches);
  ok("F-05 var olmayan mineral eşleşmez", !evaluateStoneConditions(stone, cond("mineral", "Altın")).matches);
  ok("F-05 çakra (Kök) eşleşir", evaluateStoneConditions(stone, cond("chakra", "Kök")).matches);
  // Yüzde eşiği: Oksijen %30 ≥ %10 → eşleşir; ≥ %50 → eşleşmez.
  ok("F-05 mineral yüzde eşiği (≥10) eşleşir", evaluateStoneConditions(stone, cond("mineral", "Oksijen", 10)).matches);
  ok("F-05 mineral yüzde eşiği (≥50) eşleşmez", !evaluateStoneConditions(stone, cond("mineral", "Oksijen", 50)).matches);
  // AND mantığı: iki koşuldan biri sağlanmazsa eşleşmez.
  ok("F-05 AND: Demir + var olmayan çakra → eşleşmez",
    !evaluateStoneConditions(stone, [
      { id: "a", type: "mineral", value: "Demir", minPercent: null },
      { id: "b", type: "chakra", value: "Taç", minPercent: null },
    ]).matches);
  ok("F-05 AND: Demir + Kök → eşleşir",
    evaluateStoneConditions(stone, [
      { id: "a", type: "mineral", value: "Demir", minPercent: null },
      { id: "b", type: "chakra", value: "Kök", minPercent: null },
    ]).matches);
  // TR normalize: "hemat" içerik? stone_name koşulu.
  ok("F-05 taş ismi kısmi (TR-normalize) eşleşir", evaluateStoneConditions(stone, cond("stone_name", "hemat")).matches);
}

// ─── F-01 / minerals SQL arama filtresi (F-05 çekirdek alanları) ─────────────────
{
  const f = buildMineralsListSearchOrFilter("güç");
  ok("minerals or-filter var", Boolean(f));
  ok("minerals or-filter name/aciklama/kategori/source_id ilike içerir",
    !!f && f.includes("name.ilike.") && f.includes("aciklama.ilike.") &&
    f.includes("kategori.ilike.") && f.includes("source_id.ilike."));
  ok("minerals or-filter dizi alanı içermez (yapısal, hızlı-yol dışı)",
    !!f && !f.includes("fiziksel.ilike.") && !f.includes("cakralar.ilike."));
  // İ/ı varyant genişletme
  const fi = buildMineralsListSearchOrFilter("iyot");
  ok("minerals or-filter İ/ı varyantı üretir",
    !!fi && (fi.includes("%İyot%") || fi.includes("%ıyot%") || fi.includes("%iyot%")));
  // sanitize: ,()%' temizlenir
  ok("minerals or-filter sadece boşluk/özel karakterse null", buildMineralsListSearchOrFilter("  ,() ") === null);
}

// ─── F-01 / stone metin araması SERVER-SIDE (client rewire) ──────────────────────
{
  const list = read("app/dogaltas/dogaltas-listesi/page.tsx");
  ok("stone list: needsFullLoad artık debouncedSearch içermez (metin araması server)",
    /const needsFullLoad = isDetailFilterActive;/.test(list));
  ok("stone list: export-filtered server-side eşleşen küme çeker (yalnız yüklü sayfa değil)",
    list.includes("fetchStonesListPage(tenantId, {") && list.includes("limit: 500"));
  const stonesRoute = read("app/api/dogaltas/stones/route.ts");
  ok("stones route: list limit clamp (max 500)", stonesRoute.includes("Math.min(Math.max(1, rawLimit), 500)"));
  const minRoute = read("app/api/dogaltas/minerals/route.ts");
  ok("minerals route: SQL buildMineralsListSearchOrFilter kullanır (JS full-scan yok)",
    minRoute.includes("buildMineralsListSearchOrFilter") && !minRoute.includes("mineralRowMatchesSearch"));
  ok("minerals route: limit clamp (max 100)", minRoute.includes("Math.min(Math.max(1, rawLimit), 100)"));
}

// ─── §5 / condition-search endpoint (server-side AND, korpus tarayıcıya inmez) ───
{
  const cs = read("app/api/dogaltas/stones/condition-search/route.ts");
  ok("condition-search: requireModuleAccess (auth first)", cs.includes('requireModuleAccess(req, "stones")'));
  ok("condition-search: tenant SUNUCUDAN (body'den tenant alınmaz)", !/body\.tenant/i.test(cs));
  ok("condition-search: paylaşılan evaluateStoneConditions (AND mantığı korunur)", cs.includes("evaluateStoneConditions"));
  ok("condition-search: bounded korpus (CORPUS_CAP) + capped bayrağı", cs.includes("CORPUS_CAP") && cs.includes("capped"));
  ok("condition-search: ham hata sızmaz", cs.includes("serverErrorResponse") && !cs.includes("error: error.message"));
}

// ─── F-02 / combination_stones ilişkisel model migration ─────────────────────────
{
  const mig = read("supabase/migrations/20270124000000_dogaltas_combination_stones_relational.sql");
  ok("F-02 junction tablosu", mig.includes("CREATE TABLE IF NOT EXISTS public.combination_stones"));
  ok("F-02 combination_id -> combinations ON DELETE CASCADE",
    /combination_id[\s\S]*REFERENCES public\.combinations\(id\) ON DELETE CASCADE/.test(mig));
  ok("F-02 stone_id -> stones ON DELETE SET NULL (veri kaybı yok)",
    /stone_id[\s\S]*REFERENCES public\.stones\(id\) ON DELETE SET NULL/.test(mig));
  ok("F-02 snapshot_name NOT NULL (tarihsel fallback)", /snapshot_name\s+text\s+NOT NULL/.test(mig));
  ok("F-02 junction RLS enable + revoke", mig.includes("ALTER TABLE public.combination_stones ENABLE ROW LEVEL SECURITY") &&
    mig.includes("REVOKE ALL PRIVILEGES ON TABLE public.combination_stones FROM anon, authenticated"));
  ok("F-02 create RPC SECURITY DEFINER + search_path=''",
    /create_combination_with_stones[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = ''/.test(mig));
  ok("F-02 update RPC concurrency guard (combination_conflict)", mig.includes("combination_conflict"));
  ok("F-02 RPC'ler yalnız service_role",
    mig.includes("GRANT EXECUTE ON FUNCTION public.create_combination_with_stones") &&
    mig.includes("GRANT EXECUTE ON FUNCTION public.update_combination_with_stones") &&
    mig.includes("TO service_role"));
  ok("F-02/F-03 updated_at combinations + minerals",
    mig.includes("ALTER TABLE public.combinations ADD COLUMN IF NOT EXISTS updated_at") &&
    mig.includes("ALTER TABLE public.minerals     ADD COLUMN IF NOT EXISTS updated_at"));
  ok("F-02 updated_at trigger'ları", mig.includes("trg_combinations_updated_at") && mig.includes("trg_minerals_updated_at"));
  ok("F-02 RPC snapshot_name'den stone_id çözer (dogaltas_normalize_name)",
    mig.includes("dogaltas_normalize_name"));
}

// ─── F-02 / write path RPC entegrasyonu ──────────────────────────────────────────
{
  const save = read("app/api/dogaltas/combinations/save/route.ts");
  ok("save: create_combination_with_stones RPC", save.includes('rpc("create_combination_with_stones"'));
  ok("save: doğrudan combinations insert KALDIRILDI", !/from\("combinations"\)\s*\.insert/.test(save));
  const patch = read("app/api/dogaltas/combinations/[id]/route.ts");
  ok("PATCH: taş düzenlemede update_combination_with_stones RPC", patch.includes('rpc("update_combination_with_stones"'));
  ok("PATCH: 409 conflict + code", patch.includes('code: "conflict"') && patch.includes("status: 409"));
}

// ─── F-02 / legacy backfill FAIL-SAFE ────────────────────────────────────────────
{
  const bf = read("supabase/migrations/20270124000200_dogaltas_combination_stones_backfill.sql");
  ok("backfill: stones_text DROP/rewrite YOK", !/DROP\s+COLUMN[\s\S]*stones_text/i.test(bf) && !/UPDATE\s+public\.combinations\s+SET\s+stones_text/i.test(bf));
  ok("backfill: audit tablosu (unmatched/ambiguous izi)", bf.includes("combination_stones_backfill_audit"));
  ok("backfill: idempotent (NOT EXISTS)", bf.includes("NOT EXISTS"));
  ok("backfill: tek-eşleşmede id, aksi NULL (ambiguous tahmin yok)", /CASE WHEN count\(\*\) = 1 THEN max\(s\.id\)/.test(bf));
  // preflight SALT-OKUMA (mutation yok)
  const pf = read("scripts/dogaltas-presale-f2/legacy-backfill-preflight.sql");
  ok("preflight: yalnız SELECT (INSERT/UPDATE/DELETE yok)",
    !/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(pf.replace(/--.*$/gm, "")));
}

// ─── trgm arama index migration ──────────────────────────────────────────────────
{
  const idx = read("supabase/migrations/20270124000100_dogaltas_search_indexes.sql");
  ok("index: pg_trgm extension", idx.includes("CREATE EXTENSION IF NOT EXISTS pg_trgm"));
  ok("index: stones.stone_name gin_trgm", idx.includes("stones_stone_name_trgm_idx") && idx.includes("gin_trgm_ops"));
  ok("index: minerals name/aciklama/kategori trgm",
    idx.includes("minerals_name_trgm_idx") && idx.includes("minerals_aciklama_trgm_idx") && idx.includes("minerals_kategori_trgm_idx"));
  ok("index: tenant composite (sıralı pagination)", idx.includes("stones_tenant_name_idx") && idx.includes("minerals_tenant_name_idx"));
}

// ─── F-03 / concurrency route guard'ları ─────────────────────────────────────────
{
  for (const [rel, label] of [
    ["app/api/dogaltas/stones/[id]/route.ts", "stone"],
    ["app/api/dogaltas/minerals/[id]/route.ts", "mineral"],
  ] as const) {
    const src = read(rel);
    ok(`F-03 ${label} PATCH: expectedUpdatedAt guard`, src.includes("expectedUpdatedAt") && src.includes('.eq("updated_at"'));
    ok(`F-03 ${label} PATCH: 409 code=conflict`, src.includes('code: "conflict"') && src.includes("status: 409"));
  }
  const api = read("lib/dogaltas/dogaltasApi.ts");
  ok("F-03 client: update* expectedUpdatedAt gönderir + conflict yüzeyler",
    api.includes("expectedUpdatedAt") && api.includes('r.code === "conflict"'));
  // Edit UI'lar conflict'i işler
  ok("F-03 mineral edit UI: conflict handling", read("app/dogaltas/mineral-listesi/[id]/page.tsx").includes("res.conflict"));
  ok("F-03 combination edit UI: conflict handling", read("app/dogaltas/kombinasyonlar/[title]/page.tsx").includes("res.conflict"));
}

// ─── IA / menü sadeleştirme (route'lar KORUNUR) ──────────────────────────────────
{
  ok("IA: 4 ana çalışma alanı", DOGALTAS_PRIMARY_MODULES.length === 4);
  const primarySlugs = DOGALTAS_PRIMARY_MODULES.map((m) => m.slug).sort();
  ok("IA: doğru 4 slug", JSON.stringify(primarySlugs) === JSON.stringify(
    ["dogaltas-listesi", "kombinasyonlar", "mineral-listesi", "tas-bilgi-kutuphanesi"].sort()));
  ok("IA: oluşturma route'ları registry'de KORUNUR (silinmedi)",
    DOGALTAS_MODULES.some((m) => m.slug === "dogaltas-kayit") &&
    DOGALTAS_MODULES.some((m) => m.slug === "mineral-bankasi") &&
    DOGALTAS_MODULES.some((m) => m.slug === "kombinasyon-olustur"));
  ok("IA: oluşturma route'ları primaryNav:false",
    DOGALTAS_MODULES.filter((m) => !m.primaryNav).length === 3);
  // deep-link/breadcrumb hâlâ oluşturma route'larını çözer
  ok("IA: breadcrumb kombinasyon-olustur deep-link çözer",
    findDogaltasModuleByPath("/dogaltas/kombinasyon-olustur")?.slug === "kombinasyon-olustur");
  ok("IA: breadcrumb dogaltas-kayit deep-link çözer",
    findDogaltasModuleByPath("/dogaltas/dogaltas-kayit")?.slug === "dogaltas-kayit");
  // hub yalnız primary render eder
  const hub = read("app/dogaltas/page.tsx");
  ok("IA: hub DOGALTAS_PRIMARY_MODULES render eder", hub.includes("DOGALTAS_PRIMARY_MODULES.map"));
  // kombinasyonlar list "Yeni Kombinasyon" CTA
  ok("IA: kombinasyonlar list 'Yeni Kombinasyon' CTA (kombinasyon-olustur'a)",
    read("app/dogaltas/kombinasyonlar/page.tsx").includes('href="/dogaltas/kombinasyon-olustur"'));
}

// ─── Knowledge library ürün kararı korunur (tenant-scoped, global fallback yok) ──
{
  const k = read("app/api/dogaltas/knowledge/route.ts");
  // Davranış kontrolü: her erişim .eq("tenant_id", tenantId); çoklu-tenant union
  // (.in("tenant_id")) veya NULL-tenant/global .or fallback YOK. (Yorumda
  // ADMIN_LIBRARY_TENANT_ID geçebilir — union'ın YAPILMADIĞINI açıklar.)
  ok("knowledge: tenant-scoped (global/NULL/union fallback yok)",
    k.includes('.eq("tenant_id", tenantId)') &&
    !k.includes('.in("tenant_id"') &&
    !/tenant_id\.is\.null/.test(k));
}

// ─── §5/§7/§8 condition-search UI WIRE + unbounded-fetch audit ───────────────────
{
  const komb = read("app/dogaltas/kombinasyon-olustur/page.tsx");
  ok("Mineralle Taş Bul: condition-search endpoint kullanır", komb.includes("fetchStonesByConditions"));
  ok("Mineralle Taş Bul: full-corpus fetchAllStonesExtended KALDIRILDI", !komb.includes("fetchAllStonesExtended"));
  ok("Mineralle Taş Bul: race guard (searchSeq + AbortController)",
    komb.includes("searchSeq") && komb.includes("AbortController"));
  ok("Mineralle Taş Bul: AND motoru KORUNUR (evaluateStoneConditions)", komb.includes("evaluateStoneConditions"));
  ok("Mineralle Taş Bul: sepet/analiz knownStones üzerinden (korpus değil)", komb.includes("knownStones"));
  ok("Mineralle Taş Bul: met/missing + uyarı korunur",
    komb.includes("missingMinerals") && komb.includes("hasAnyWarning"));
  ok("Mineralle Taş Bul: loading/stale ayrımı (searchLoading)", komb.includes("searchLoading"));

  const list = read("app/dogaltas/dogaltas-listesi/page.tsx");
  ok("Doğaltaş Listesi detay filtre: condition-search kullanır", list.includes("fetchStonesByConditions"));
  ok("Doğaltaş Listesi: full-corpus fetchAllStonesExtended KALDIRILDI", !list.includes("fetchAllStonesExtended"));
  ok("Doğaltaş Listesi: detay race guard (detailSeq + AbortController)",
    list.includes("detailSeq") && list.includes("AbortController"));
  ok("Doğaltaş Listesi: metin araması server-side korunur (needsFullLoad=isDetailFilterActive)",
    /const needsFullLoad = isDetailFilterActive;/.test(list));

  // condition-search helper: bounded + race-safe (AbortSignal) + auth
  const helper = read("lib/dogaltas/conditionSearchApi.ts");
  ok("conditionSearchApi: AbortSignal desteği (race guard)", helper.includes("AbortSignal") && helper.includes("signal"));

  // Dashboard hub hızlı araması da server-side (mode=extended full-corpus KALDIRILDI).
  const hub = read("app/dogaltas/page.tsx");
  ok("Hub arama: condition-search kullanır", hub.includes("fetchStonesByConditions"));
  ok("Hub arama: mode=extended full-corpus KALDIRILDI", !hub.includes("mode=extended"));
  ok("Hub arama: race guard (searchSeq)", hub.includes("searchSeq"));

  // UNBOUNDED-FETCH AUDIT: arama/filtre AMAÇLI hiçbir sayfa full-corpus çekmez.
  // (Kalan fetchAllStonesExtended yalnızca kombinasyonlar/[title] ghost-tespiti =
  //  arama-DIŞI, veri-bütünlüğü göstergesi; ayrı optimizasyon başlığı.)
  for (const rel of [
    "app/dogaltas/page.tsx",
    "app/dogaltas/dogaltas-listesi/page.tsx",
    "app/dogaltas/kombinasyon-olustur/page.tsx",
  ]) {
    const src = read(rel);
    ok(`${rel}: arama/filtre yolunda fetchAllStonesExtended YOK`, !src.includes("fetchAllStonesExtended"));
  }
}

// ─── §5/§7 pagination (F) + sepet/seçim kalıcılığı (H) regresyon kilitleri ────────
// Kullanıcı istek listesi F ve H: server-side'a geçince yeni risk oluşmadığını kilitler.
{
  const list = read("app/dogaltas/dogaltas-listesi/page.tsx");
  const komb = read("app/dogaltas/kombinasyon-olustur/page.tsx");

  // F: server-side pagination — load-more monoton offset (stones.length) ile APPEND;
  //    deterministik stone_name sıralaması + offset → page1/page2 dup/gap üretmez.
  ok("F: liste load-more monoton offset (stones.length) ile çağrılır",
    /fetchList\(\{ reset: false, append: true, offset: stones\.length \}\)/.test(list));
  ok("F: liste append modu satırları EKLER ([...current, ...rows]) — replace/gap yok",
    /opts\.append \? \[\.\.\.current, \.\.\.rows\] : rows/.test(list));
  ok("F: liste hasMore = yüklenen < totalCount (bounded; sessiz truncation yok)",
    /stones\.length < totalCount/.test(list));

  // H: sepet/seçim, arama/filtre/pagination yenilenince SIFIRLANMAZ (ayrı state).
  ok("H: liste seçim (selectedIds) sonuç state'inden (stones/detailData) AYRI",
    /const \[selectedIds, setSelectedIds\]/.test(list) && list.includes("setDetailData"));
  ok("H: liste append (load-more) selectedIds'i sıfırlamaz",
    !/append[\s\S]{0,200}setSelectedIds\(/.test(list));
  ok("H: kombinasyon sepeti (cart) arama sonuçlarından (serverRows) AYRI state",
    /const \[cart, setCart\]/.test(komb) && /const \[serverRows, setServerRows\]/.test(komb));
  ok("H: kombinasyon bulunan taşları MERGE eder (mergeKnown) — sepet id'leri korunur",
    komb.includes("mergeKnown(res.rows)"));
}

// ─── Sonuç ──────────────────────────────────────────────────────────────────────
console.log(`\nDoğaltaş presale-F2 harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) {
  console.error("FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("✓ TÜM KAPILAR GEÇTİ");
