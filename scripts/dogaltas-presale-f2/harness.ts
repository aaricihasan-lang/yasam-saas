/**
 * Doğaltaş SATIŞ-ÖNCESİ NİHAİ — FAZ 2 regresyon harness'i.
 *
 * Kapsam (saf mantık + kaynak-tarama kapıları; çalışan DB gerektirmez):
 *   F-05  mineral semantiği: mineral koşulu assignments.Mineraller'den çözülür,
 *         taşın SERBEST açıklama metninden DEĞİL.
 *   F-01/DT-S1  server-side arama: minerals SQL .or(ilike); stone metin araması
 *         needsFullLoad'dan çıkarıldı (mode=list); limit clamp; condition endpoint.
 *   F-02  combination_stones ilişkisel model + RPC'ler + updated_at (bulk backfill
 *         KALDIRILDI; legacy stones_text-canonical, yeni kayıt junction).
 *   F-03  optimistic concurrency: stone/mineral/combination PATCH version guard + 409.
 *   IA    menü sadeleştirme (4 ana + oluşturma route'ları korunur).
 *   trgm  arama index migration.
 *
 * Çalıştır: npx tsx scripts/dogaltas-presale-f2/harness.ts
 */
import { readFileSync, existsSync } from "node:fs";
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
import {
  pickStoneName,
  buildResolvedStonesText,
  toResolvedStone,
} from "../../lib/dogaltas/combinationStonesRead";
import {
  LONG_TEXT_BACKDROP_GUARD_MS,
  LONG_TEXT_EDITOR_CLOSED,
  canCloseFromBackdrop,
  closeLongTextEditor,
  needsDiscardConfirm,
  openLongTextEditor,
  shouldAutoOpenLongText,
} from "../../lib/dogaltas/longTextEditor";
import { stoneReadTenantIds } from "../../lib/dogaltas/stoneTenantScope";
import { ADMIN_LIBRARY_TENANT_ID as LIB_T } from "../../lib/tenancy/syntheticTenants";

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
  // Mineral Türkçe İ düzeltmesi: filtre ILIKE yerine Türkçe duyarsız literal `imatch` (amaç aynı:
  // dört çekirdek kolon dahil, dizi kolonları hariç).
  ok("minerals or-filter name/aciklama/kategori/source_id içerir",
    !!f && f.includes("name.imatch.") && f.includes("aciklama.imatch.") &&
    f.includes("kategori.imatch.") && f.includes("source_id.imatch."));
  ok("minerals or-filter dizi alanı içermez (yapısal, hızlı-yol dışı)",
    !!f && !f.includes("fiziksel.") && !f.includes("cakralar."));
  // İ/ı varyant genişletme
  const fi = buildMineralsListSearchOrFilter("iyot");
  ok("minerals or-filter İ/ı varyantı üretir",
    !!fi && fi.includes("[iİıI]yot"));
  // sanitize: ,()%' temizlenir
  ok("minerals or-filter sadece boşluk/özel karakterse null", buildMineralsListSearchOrFilter("  ,() ") === null);
}

// ─── F-01 / stone metin araması SERVER-SIDE (client rewire) ──────────────────────
{
  const list = read("app/dogaltas/dogaltas-listesi/page.tsx");
  ok("stone list: needsFullLoad artık debouncedSearch içermez (metin araması server)",
    /const needsFullLoad = isDetailFilterActive;/.test(list));
  ok("stone list: export-filtered server-side eşleşen küme çeker (yalnız yüklü sayfa değil)",
    // AŞAMA 2 / P2-07: 500'lük tek istek yerine 500'lük SAYFALARLA tüm eşleşen küme (amaç aynı, kesilme yok).
    list.includes("fetchStonesListPage(tenantId, {") && (list.includes("limit: 500") || list.includes("limit: PAGE")));
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

// ─── LEGACY GÜVENLİĞİ — bulk backfill KALDIRILDI (prod preflight: stones_text
//     güvenilir CSV DEĞİL; cümle/açıklama parçaları var). Legacy stones_text-canonical
//     kalır; yeni kayıtlar junction. ──────────────────────────────────────────────
{
  // Backfill migration prod zincirinden ÇIKARILDI.
  ok("backfill migration KALDIRILDI (prod'a gitmez)",
    !existsSync(resolve(ROOT, "supabase/migrations/20270124000200_dogaltas_combination_stones_backfill.sql")));
  // Preflight SQL analiz için KORUNUR (salt-okuma).
  const pf = read("scripts/dogaltas-presale-f2/legacy-backfill-preflight.sql");
  ok("preflight: KORUNDU (gelecekte analiz) + yalnız SELECT",
    !/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(pf.replace(/--.*$/gm, "")));

  const patch = read("app/api/dogaltas/combinations/[id]/route.ts");
  // A/B/C: LEGACY edit junction pollution ENGELİ — yalnız junction'ı OLAN (yapısal)
  // kayıt RPC ile junction-replace edilir; legacy (junction yok) stones_text plain update.
  ok("legacy: PATCH junction discriminator (hasJunction)", patch.includes("hasJunction"));
  ok("legacy: RPC yalnız hasJunction iken (yapısal)", /stones_text" in body && hasJunction/.test(patch));
  ok("legacy: junction sorgusu combination_stones count (tenant-scoped)",
    /from\("combination_stones"\)[\s\S]*count: "exact"[\s\S]*head: true/.test(patch) && patch.includes('.eq("combination_id", id)'));
  ok("legacy: junction yoksa stones_text plain field update (RPC değil)",
    /fields\.stones_text = names\.join/.test(patch));
  // Hiçbir READER combination_stones sorgulamaz → legacy stones_text ile render eder.
  for (const rel of [
    "app/dogaltas/kombinasyonlar/page.tsx",
    "app/dogaltas/kombinasyonlar/[title]/page.tsx",
    "app/api/dogaltas/combinations/word-report/route.ts",
    "app/api/dogaltas/word-report/route.ts",
  ]) {
    ok(`legacy read: ${rel} stones_text okur, combination_stones tablosu SORGULAMAZ`,
      read(rel).includes("stones_text") && !read(rel).includes('from("combination_stones")'));
  }
  // D/F: yeni structured write — save route create RPC + stones_text mirror + stoneRefs.
  const save = read("app/api/dogaltas/combinations/save/route.ts");
  ok("yeni write: create_combination_with_stones RPC", save.includes('rpc("create_combination_with_stones"'));
  ok("yeni write: stoneRefs (stone_id + snapshot_name) desteklenir", save.includes("stoneRefs"));
  // E: cross-tenant stone_id reddi (RPC).
  const rel = read("supabase/migrations/20270124000000_dogaltas_combination_stones_relational.sql");
  ok("E: RPC cross-tenant stone_id reddi (stone_not_found_for_tenant)", rel.includes("stone_not_found_for_tenant"));
  // F: relational RPC stones_text mirror'ı yazar (compatibility korunur).
  ok("F: RPC stones_text compatibility mirror yazar", /stones_text[\s\S]*string_agg/.test(rel));
  // relational migration legacy combinations verisini REWRITE ETMEZ.
  ok("relational: legacy combinations rewrite YOK",
    !/UPDATE\s+public\.combinations\s+SET\s+stones_text/i.test(rel) && !/DELETE FROM public\.combinations/i.test(rel));
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

// ─── F-02 READ COMPLETION — junction canonical read + rename/delete/legacy ────────
{
  // Rename: stone_id bağlı + güncel ad → CURRENT NAME (mirror string eski olsa da).
  const renamed = toResolvedStone({ stone_id: "S1", snapshot_name: "Florit", stones: { stone_name: "Yeşil Florit" } });
  ok("READ rename: güncel taş adı (Yeşil Florit)", renamed.name === "Yeşil Florit" && !renamed.deleted);
  ok("READ rename: pickStoneName current adı seçer", pickStoneName(renamed) === "Yeşil Florit");
  // Delete: stone_id NULL (ON DELETE SET NULL) → snapshot_name fallback + deleted.
  const deleted = toResolvedStone({ stone_id: null, snapshot_name: "Florit", stones: null });
  ok("READ delete: snapshot_name fallback (Florit)", pickStoneName(deleted) === "Florit" && deleted.deleted);
  // stone_id var ama embed adı yok → deleted + snapshot.
  const unresolved = toResolvedStone({ stone_id: "S2", snapshot_name: "Ametist", stones: [{ stone_name: null }] });
  ok("READ unresolved: deleted=true + snapshot", unresolved.deleted && pickStoneName(unresolved) === "Ametist");
  // Canonical CSV = current names + snapshot fallback, sıra korunur.
  ok("READ resolved CSV (current + snapshot)",
    buildResolvedStonesText([renamed, deleted]) === "Yeşil Florit, Florit");

  // Wiring: GET + word-report'lar junction'dan hydrate eder.
  const combRoute = read("app/api/dogaltas/combinations/route.ts");
  ok("READ: combinations GET hydrateCombinationStoneNames kullanır", combRoute.includes("hydrateCombinationStoneNames"));
  ok("READ: combinations GET satır INSERT/UPDATE combination_stones YAPMAZ",
    !/from\("combination_stones"\)[\s\S]*\.(insert|update|delete)\(/.test(combRoute));
  for (const rel of ["app/api/dogaltas/word-report/route.ts", "app/api/dogaltas/combinations/word-report/route.ts"]) {
    ok(`READ: ${rel} hydrate eder (Word structured relation)`, read(rel).includes("hydrateCombinationStoneNames"));
  }

  // Helper: SALT-OKUMA + BATCH + tenant-scoped + legacy fallback.
  const helper = read("lib/dogaltas/combinationStonesRead.ts");
  ok("READ helper: mutation YOK (insert/update/delete)", !/\.(insert|update|delete)\(/.test(helper));
  ok("READ helper: BATCH tek sorgu (.in combination_id)", helper.includes('.in("combination_id"'));
  ok("READ helper: tenant-scoped", helper.includes('.eq("tenant_id", tenantId)'));
  // AŞAMA 2 / P2-07: sorgu artık parçalı+sayfalı (fetchAllRowsByIds); hata → legacy fallback korunur.
  ok("READ helper: tablo yok/hata → legacy fallback (rows döner)", /if \(error\) return rows|if \(!res\.ok\) return rows/.test(helper));
  ok("READ helper: junction yok → legacy (stones_text değişmez)", /if \(!resolved \|\| resolved\.length === 0\) return row/.test(helper));
  // (DB stones_text UPDATE etmez → yukarıdaki "mutation YOK" gate'i zaten kapsar.)
}

// ─── RPC-FIX: combination RPC'lerinde uuid için max() YOK (prod 42883) ─────────
{
  const rel = "supabase/migrations/20270128000000_dogaltas_combination_rpc_uuid_agg_fix.sql";
  ok("RPC-FIX migration dosyası var", existsSync(resolve(ROOT, rel)));
  const sql = existsSync(resolve(ROOT, rel)) ? read(rel) : "";
  const body = sql.replace(/^--.*$/gm, "");
  ok("RPC-FIX: max(s.id) (uuid) YOK", !/max\(\s*s\.id\s*\)/i.test(body));
  ok("RPC-FIX: tek-eşleşme (array_agg(s.id))[1] ×2", (body.match(/\(array_agg\(s\.id\)\)\[1\]/g) ?? []).length === 2);
  ok("RPC-FIX: iki fonksiyon CREATE OR REPLACE",
    body.includes("CREATE OR REPLACE FUNCTION public.create_combination_with_stones(") &&
    body.includes("CREATE OR REPLACE FUNCTION public.update_combination_with_stones("));
  ok("RPC-FIX: SECURITY DEFINER + search_path='' korunur",
    (body.match(/SECURITY DEFINER/g) ?? []).length === 2 && (body.match(/SET search_path = ''/g) ?? []).length === 2);
  ok("RPC-FIX: anon/authenticated EXECUTE revoke + yalnız service_role grant",
    (body.match(/REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC, anon, authenticated;/g) ?? []).length === 2 &&
    (body.match(/GRANT EXECUTE ON FUNCTION[^;]+TO service_role;/g) ?? []).length === 2);
  // Fonksiyon gövdeleri ($$…$$) dışındaki üst-seviye ifadeler yalnız
  // CREATE OR REPLACE FUNCTION / REVOKE / GRANT olabilir (tablo/veri/RLS YOK).
  const topLevel = body.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$")
    .split(";").map((s) => s.trim()).filter(Boolean);
  ok("RPC-FIX: üst-seviye yalnız CREATE OR REPLACE FUNCTION / REVOKE / GRANT (tablo/veri/RLS YOK)",
    topLevel.length === 6 && topLevel.every((s) => /^(CREATE OR REPLACE FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION)/.test(s)));
  // En son tanımlanan RPC gövdesi (migrasyon sırasına göre) max(uuid) içermemeli.
  const orig = read("supabase/migrations/20270124000000_dogaltas_combination_stones_relational.sql");
  ok("RPC-FIX: hotfix orijinalden SONRA sıralanır", "20270128000000" > "20270124000000" && orig.includes("max(s.id)"));
}

// ─── UX-LT: uzun metin alanı → geniş editör OTOMATİK açılır (satış öncesi kapanış) ──
{
  // Canlı senkron editör simülasyonu: form state + editör state saf fonksiyonlarla.
  let form = { spiritual_effects: "Deneme metni", physical_effects: "", stone_name: "" };
  let ed = LONG_TEXT_EDITOR_CLOSED;
  const T0 = 1_000_000;

  // 1. Ruhsal Etkiler tıklama → açılır.
  ed = openLongTextEditor(ed, "pointer", T0);
  ok("UX-LT-1 Ruhsal Etkiler tık → geniş editör açılır", ed.open);
  // 9. Aynı tıklamanın ikinci olayı (çift tık) → idempotent, ikinci modal yok.
  const again = openLongTextEditor(ed, "pointer", T0 + 5);
  ok("UX-LT-9 çift olay → aynı state (ikinci modal yok)", again === ed && again.openedAt === T0);
  // 5. Mevcut metin editörde aynı (editör form değerini doğrudan gösterir, taslak yok).
  ok("UX-LT-5 mevcut metin editörde aynı ('Deneme metni')", form.spiritual_effects === "Deneme metni");
  // 6. Editörde değişiklik → form state anında güncellenir; kapatınca korunur.
  const onChange = (v: string) => { form = { ...form, spiritual_effects: v }; };
  onChange("Deneme metni 2");
  ed = closeLongTextEditor(ed, "done", T0 + 2000);
  ok("UX-LT-6 kapatma sonrası form state 'Deneme metni 2'", !ed.open && form.spiritual_effects === "Deneme metni 2");
  // 7. ESC / × / arka plan → veri kaybı yok (metin form state'inde).
  for (const reason of ["escape", "close-button", "backdrop"] as const) {
    let s = openLongTextEditor(LONG_TEXT_EDITOR_CLOSED, "pointer", T0);
    onChange(`metin-${reason}`);
    s = closeLongTextEditor(s, reason, T0 + 2000);
    ok(`UX-LT-7 ${reason} kapatma → metin korunur`, !s.open && form.spiritual_effects === `metin-${reason}`);
  }
  // Çift tıklamanın ikinci tıkı arka plana düşerse editör anında KAPANMAZ (guard).
  const guarded = closeLongTextEditor(openLongTextEditor(LONG_TEXT_EDITOR_CLOSED, "pointer", T0), "backdrop", T0 + 50);
  ok("UX-LT-9b açılıştan hemen sonra arka plan tıkı editörü kapatmaz", guarded.open);
  ok("UX-LT backdrop guard sınırı (≥ guard ms kapatır)", canCloseFromBackdrop(T0, T0 + LONG_TEXT_BACKDROP_GUARD_MS));
  // 4. ⤢ ok butonu → açılır.
  ok("UX-LT-4 ⤢ ok → açılır", openLongTextEditor(LONG_TEXT_EDITOR_CLOSED, "arrow", T0).open);
  // 8. Mobil dokunma: tap → click olayı → "pointer" kaynağı ile aynı yol.
  ok("UX-LT-8 dokunma (tap→click=pointer) → açılır", shouldAutoOpenLongText("pointer"));
  // Klavye (Tab) odağı AÇMAZ (focus-loop yok); devre dışı alan açmaz.
  ok("UX-LT klavye odağı editör açmaz", !openLongTextEditor(LONG_TEXT_EDITOR_CLOSED, "keyboard", T0).open);
  ok("UX-LT disabled alan açmaz", !openLongTextEditor(LONG_TEXT_EDITOR_CLOSED, "pointer", T0, true).open);
  // Taslaklı (DB-kaydet) editör: değişiklik varsa kapatma onayı; yoksa doğrudan kapanır.
  ok("UX-LT taslak değişmedi → onay gerekmez", !needsDiscardConfirm('"a"', '"a"'));
  ok("UX-LT taslak değişti → onay gerekir", needsDiscardConfirm('"a"', '"a b"'));

  // Kaynak kapıları: bileşen sözleşmesi.
  const comp = read("app/dogaltas/components/LongTextField.tsx");
  ok("UX-LT bileşen: textarea onClick → open('pointer')", /onClick=\{\(\) => open\("pointer"\)\}/.test(comp));
  ok("UX-LT bileşen: ⤢ butonu → open('arrow')", /onClick=\{\(\) => open\("arrow"\)\}/.test(comp));
  ok("UX-LT bileşen: onFocus ile AÇMAZ (focus-loop yok)", !/onFocus=/.test(comp));
  ok("UX-LT bileşen: editör taslaksız, onChange doğrudan forma", /onChange=\{\(event\) => onChange\(event\.target\.value\)\}/.test(comp));
  ok("UX-LT bileşen: portal (transform'lu kart dışına)", comp.includes("createPortal("));
  ok("UX-LT bileşen: Esc yayılımı durdurulur (alttaki modal kapanmaz)", comp.includes("event.stopPropagation()") && comp.includes("closeOnEsc: false"));
  ok("UX-LT bileşen: ilk focus editör textarea (initialFocusRef)", comp.includes("initialFocusRef: textareaRef"));

  // 2. Her uzun metin code-path'i ortak bileşeni kullanır; ham <textarea> kalmaz.
  const LT_PAGES: Array<[string, number]> = [
    ["app/dogaltas/dogaltas-kayit/page.tsx", 5],
    ["app/dogaltas/mineral-listesi/[id]/page.tsx", 2],
    ["app/dogaltas/kombinasyonlar/[title]/page.tsx", 1],
    ["app/dogaltas/kombinasyon-olustur/page.tsx", 1],
    ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", 3],
  ];
  for (const [rel, min] of LT_PAGES) {
    const src = read(rel);
    const uses = (src.match(/<LongTextField\b/g) ?? []).length;
    ok(`UX-LT-2 ${rel}: LongTextField ×${min}+ (bulundu ${uses})`, uses >= min);
    ok(`UX-LT-2 ${rel}: ham <textarea> yok`, !/<textarea\b/.test(src));
  }
  const kayit = read("app/dogaltas/dogaltas-kayit/page.tsx");
  ok("UX-LT-1 kayıt: effects bölümü (Ruhsal Etkiler dahil) LongTextField", /effectSections\.map[\s\S]{0,2500}<LongTextField/.test(kayit));
  ok("UX-LT kayıt: eski yalnız-⤢ ExpandableTextarea kaldırıldı", !kayit.includes("ExpandableTextarea"));
  // 3. Kısa tek satır alan (stone_name) <input> kalır, geniş editör açmaz.
  ok("UX-LT-3 stone_name tek satır <input> (LongTextField değil)",
    /<input\s+type="text"\s+value=\{formData\.stone_name\}/.test(kayit) && !/<LongTextField[^>]*stone_name/.test(kayit));

  // Taslaklı taş detay editörü: sessiz atma yok + imleç textarea'da.
  const detail = read("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
  ok("UX-LT detay: Esc/arka plan/Vazgeç → requestCloseEditor (onaylı)",
    (detail.match(/requestCloseEditor/g) ?? []).length >= 4 && detail.includes("needsDiscardConfirm("));
  ok("UX-LT detay: arka plan artık setActiveEditor(null) ile sessizce atmaz",
    !/currentTarget && !saving\) \{\s*setActiveEditor\(null\)/.test(detail));
  ok("UX-LT detay: editör textarea initialFocusRef ile odaklanır", detail.includes("editorTextareaRef") && detail.includes("initialFocusRef"));
  ok("F-03 detay editörü: updateStone expectedUpdatedAt (stone.updated_at) gönderir",
    /updateStone\(stone\.id, payload, stone\.updated_at\)/.test(detail));
  ok("F-03 detay editörü: 409 conflict → taslak korunur + kayıt tazelenir (editör kapanmaz)",
    /if \(conflict\) \{[\s\S]{0,300}getStone\(stone\.id\)[\s\S]{0,200}return;/.test(detail));
  ok("UX-PHOTO detay: fotoğraf alanı dikey yığın (görsel + ad yan yana ezilmez)",
    detail.includes("relative flex-col overflow-hidden ${uiImageArea}"));
  ok("UX-PHOTO detay: uzun taş adı satır kırar (görselli + görselsiz)",
    (detail.match(/break-words[^"]*text-(xl|sm) font-black text-slate-9[05]0/g) ?? []).length >= 2);
  const stonesRoute = read("app/api/dogaltas/stones/route.ts");
  const rawBlock = stonesRoute.slice(stonesRoute.indexOf('if (mode === "raw")'), stonesRoute.indexOf('if (mode === "extended")'));
  ok("PERF pano: raw modu yalnız created_at seçer (select * YOK)",
    rawBlock.includes('select("created_at")') && !rawBlock.includes('select("*")'));
  ok("PERF pano: raw modu since penceresi + tenant guard",
    /mode === "raw"[\s\S]{0,700}\.gte\("created_at", since\)/.test(stonesRoute) &&
    /mode === "raw"[\s\S]{0,700}\.eq\("tenant_id", tenantId\)/.test(stonesRoute));
  ok("PERF pano: istemci 6 aylık since gönderir",
    read("app/dogaltas/page.tsx").includes("mode=raw&since="));
  const bank = read("app/dogaltas/mineral-bankasi/page.tsx");
  ok("UX-LT mineral bankası: geniş editör Esc/focus (useOverlay)", bank.includes("useOverlay<HTMLDivElement>") && bank.includes("initialFocusRef: editorTextareaRef"));
}

// ─── IDOR: tek-taş okuma (GET + Word) liste ile AYNI tenant görünürlüğü ─────────
{
  const TA = "11111111-1111-4111-8111-111111111111"; // normal uzman A
  const TB = "22222222-2222-4222-8222-222222222222"; // normal uzman B
  const TD = "33333333-3333-4333-8333-333333333333"; // demo
  const rows = [
    { id: "a0000000-0000-4000-8000-00000000000a", tenant_id: TA, stone_name: "A taşı" },
    { id: "b0000000-0000-4000-8000-00000000000b", tenant_id: TB, stone_name: "B taşı" },
    { id: "c0000000-0000-4000-8000-00000000000c", tenant_id: LIB_T, stone_name: "Kütüphane taşı" },
  ];
  // Route ile aynı sorgu şekli: .eq("id", id).in("tenant_id", ids).maybeSingle() → 200/404.
  const get = (id: string, tenant: string, isDemo: boolean) => {
    const ids = stoneReadTenantIds(tenant, isDemo);
    const row = rows.find((r) => r.id === id && ids.includes(r.tenant_id)) ?? null;
    return row ? { status: 200, body: { ok: true, row } } : { status: 404, body: { ok: false, error: "Taş bulunamadı." } };
  };
  ok("IDOR-1 normal A → kendi taşı 200", get(rows[0].id, TA, false).status === 200);
  ok("IDOR-2 normal A → Tenant B taşı 404", get(rows[1].id, TA, false).status === 404);
  ok("IDOR-3 normal A → ADMIN_LIBRARY taşı 404", get(rows[2].id, TA, false).status === 404);
  ok("IDOR-4 admin/library → kendi kütüphane taşı 200", get(rows[2].id, LIB_T, false).status === 200);
  ok("IDOR-4b admin/library → uzman taşı 404", get(rows[0].id, LIB_T, false).status === 404);
  ok("IDOR-5 demo → kütüphane taşı 200 (liste showcase semantiği)", get(rows[2].id, TD, true).status === 200);
  ok("IDOR-5b demo → başka uzman taşı 404", get(rows[1].id, TD, true).status === 404);
  const leak = JSON.stringify(get(rows[2].id, TA, false).body);
  ok("IDOR-7 404 gövdesi taş verisi sızdırmaz", !leak.includes("Kütüphane taşı") && !leak.includes('"row"'));
  ok("IDOR helper: normal uzman kümesi yalnız [tenant]", JSON.stringify(stoneReadTenantIds(TA, false)) === JSON.stringify([TA]));

  const detailSrc = read("app/api/dogaltas/stones/[id]/route.ts");
  const getBlock = detailSrc.slice(detailSrc.indexOf("export async function GET"), detailSrc.indexOf("export async function PATCH"));
  ok("IDOR-6 GET: geçersiz UUID → 400 (isUuid)", /if \(!isUuid\(id\)\)[^\n]*status: 400/.test(getBlock));
  ok("IDOR GET: ortak helper stoneReadTenantIds(tenantId, is_demo_account)", getBlock.includes("stoneReadTenantIds(tenantId, is_demo_account)"));
  ok("IDOR GET: normal uzman için library fallback YOK", !getBlock.includes("ADMIN_LIBRARY_TENANT_ID"));
  ok("IDOR GET: .eq(id).in(tenant_id, ids).maybeSingle()", /\.eq\("id", id\)\.in\("tenant_id", ids\)\.maybeSingle\(\)/.test(getBlock));
  ok("IDOR GET 404 gövdesi yalnız hata (row yok)", /if \(!data\) return NextResponse\.json\(\{ ok: false, error: "Taş bulunamadı\." \}, \{ status: 404 \}\)/.test(getBlock));
  // 8. PATCH/DELETE tenant davranışı değişmedi (yalnız kendi tenant, helper KULLANMAZ).
  const writeBlock = detailSrc.slice(detailSrc.indexOf("export async function PATCH"));
  ok("IDOR-8 PATCH/DELETE: .eq(\"tenant_id\", tenantId) korunur", (writeBlock.match(/\.eq\("tenant_id", tenantId\)/g) ?? []).length >= 3);
  ok("IDOR-8 PATCH/DELETE: okuma helper'ı yazmaya sızmaz", !writeBlock.includes("stoneReadTenantIds") && !writeBlock.includes(".in(\"tenant_id\""));
  const wordSrc = read("app/api/dogaltas/stones/[id]/word-report/route.ts");
  ok("IDOR Word: tek-taş raporu aynı helper (demo zaten 403 → false)", wordSrc.includes("stoneReadTenantIds(tenantId, false)"));
  ok("IDOR Word: [tenantId, ADMIN_LIBRARY] fallback YOK", !/\[tenantId, ADMIN_LIBRARY_TENANT_ID\]/.test(wordSrc));
  // 9. List/detail tutarlılık kapısı: Doğaltaş taş okuma API'lerinde yerel kopya kural YOK.
  for (const rel of [
    "app/api/dogaltas/stones/route.ts",
    "app/api/dogaltas/stones/condition-search/route.ts",
    "app/api/dogaltas/stone-warnings/route.ts",
  ]) {
    const src = read(rel);
    ok(`IDOR-9 ${rel}: ortak helper kullanır, yerel kural kopyası yok`,
      src.includes("stoneReadTenantIds") && !/function tenantIdsFor\(/.test(src) && !/\[tenantId, ADMIN_LIBRARY_TENANT_ID\]/.test(src));
  }
  ok("IDOR-9 detay GET ve liste AYNI helper'ı çağırır",
    read("app/api/dogaltas/stones/route.ts").includes("const tenantIdsFor = stoneReadTenantIds") && getBlock.includes("stoneReadTenantIds("));
}

// ─── Sonuç ──────────────────────────────────────────────────────────────────────
console.log(`\nDoğaltaş presale-F2 harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) {
  console.error("FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("✓ TÜM KAPILAR GEÇTİ");
