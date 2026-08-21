/**
 * BF-14 Birleşik Modül Kaynak Genişletme — matris + güvenlik harness (PASS/BLOCKED).
 *
 * Kapsam: machine-readable modül matrisi bütünlüğü + kaynak dormancy + modül-bazlı
 * negatif güvenlik kuralları. Production/DB YOK.  npm run yh:bf14:matrix:harness
 */
import {
  YH_MODULE_SOURCE_MATRIX,
  validateModuleSourceMatrix,
  referencedProfessionalKeys,
  referencedClientKeys,
  type MemoryClassification,
} from "@/lib/yasam-hafizasi/moduleSourceMatrix";
import { YH_INDEX_SOURCES } from "@/lib/yasam-hafizasi/indexer/sources";
import { YH_CLIENT_INDEX_SOURCES } from "@/lib/yasam-hafizasi/client/clientSources";
import { CLIENT_MODULE_LABELS } from "@/lib/yasam-hafizasi/client/clientSources";
import { YH_SOURCE_MODULES } from "@/lib/yasam-hafizasi/config";
import { YH_MODULE_LABELS } from "@/lib/yasam-hafizasi/ui/moduleLabels";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};
const entry = (k: string) => YH_MODULE_SOURCE_MATRIX.find((m) => m.moduleKey === k);
const cliKeysOf = (k: string): readonly string[] => entry(k)?.clientSourceKeys ?? [];
const denyHas = (k: string, sub: string) => (entry(k)?.deny ?? []).some((d) => d.toLowerCase().includes(sub.toLowerCase()));
const rationaleHas = (k: string, sub: string) => (entry(k)?.rationale ?? "").toLowerCase().includes(sub.toLowerCase());

// ── 1) Matris bütünlüğü ──
{
  let ok = true; let detail = "";
  try { validateModuleSourceMatrix(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("matrix-validate-passes", ok, detail);
}
{
  // §7 zorunlu modüllerin tamamı matriste (sessiz atlama 0).
  const required = [
    "biyoenerji", "refleksoloji", "numeroloji", "aromaterapi", "human_design", "dogaltas",
    "mineral_bankasi", "danisan_yolculugu", "sifa_rehberi", "yebs", "kozmik_ajanda", "belge_video", "kisisel_arsiv",
  ];
  const present = new Set<string>(YH_MODULE_SOURCE_MATRIX.map((m) => m.moduleKey));
  const missing = required.filter((r) => !present.has(r));
  add("matrix-all-required-modules", missing.length === 0, `missing=${missing.join(",")}`);
  add("matrix-no-silent-skip", YH_MODULE_SOURCE_MATRIX.length >= required.length, String(YH_MODULE_SOURCE_MATRIX.length));
}
{
  const dup = new Set<string>(); let hasDup = false;
  for (const m of YH_MODULE_SOURCE_MATRIX) { if (dup.has(m.moduleKey)) hasDup = true; dup.add(m.moduleKey); }
  add("matrix-no-dup-module", !hasDup);
  add("matrix-every-module-labeled", YH_MODULE_SOURCE_MATRIX.every((m) => m.label.trim().length > 0));
  add("matrix-every-module-has-rationale", YH_MODULE_SOURCE_MATRIX.every((m) => m.rationale.trim().length > 20));
  const VALID: MemoryClassification[] = ["DORMANT_READY", "FOUNDATION_READY", "PROFESSIONAL_ONLY", "CLIENT_ONLY", "DEFERRED_FOR_SAFETY", "NOT_MEMORY_SOURCE"];
  add("matrix-all-classes-valid", YH_MODULE_SOURCE_MATRIX.every((m) => VALID.includes(m.classification)));
}

// ── 2) Cross-reference bütünlüğü (uydurma kaynak yok) ──
{
  const proSet = new Set<string>(YH_INDEX_SOURCES.map((s) => s.sourceKey));
  const cliSet = new Set<string>(YH_CLIENT_INDEX_SOURCES.map((s) => s.sourceKey));
  add("xref-pro-keys-real", referencedProfessionalKeys().every((k) => proSet.has(k)), referencedProfessionalKeys().join(","));
  add("xref-client-keys-real", referencedClientKeys().every((k) => cliSet.has(k)), referencedClientKeys().join(","));
  add("xref-pro-keys-nonempty", referencedProfessionalKeys().length > 0);
  add("xref-client-keys-nonempty", referencedClientKeys().length > 0);
}

// ── 3) Dormancy + existing-live/new-dormant ayrımı ──
{
  const live = YH_INDEX_SOURCES.filter((s) => s.enabled === true);
  const dormantPro = YH_INDEX_SOURCES.filter((s) => s.enabled === false);
  const numKeys = ["numeroloji:sources", "numeroloji:knowledge-entries"];
  const num = YH_INDEX_SOURCES.filter((s) => numKeys.includes(s.sourceKey));

  add("client-sources-code-gate-open", YH_CLIENT_INDEX_SOURCES.every((s) => s.enabled === true), "");
  // BF-14 P1 6 client source; bu paket YENİ client source EKLEMEDİ (duplicate yok).
  add("client-registry-count-6", YH_CLIENT_INDEX_SOURCES.length === 6, String(YH_CLIENT_INDEX_SOURCES.length));
  add("client-source-keys-unique", new Set(YH_CLIENT_INDEX_SOURCES.map((s) => s.sourceKey)).size === YH_CLIENT_INDEX_SOURCES.length);

  // LIVE_PROFESSIONAL (enabled:true): 19 (Cohort A sonrası) + Professional Cohort 3 aroma (plant-taxa/
  // preparations/method) = 22. (numeroloji enabled:false KORUNDU → çift fail-closed kapı.)
  add("existing-live-professional-22", live.length === 22, `live=${live.length}`);
  // DORMANT professional (enabled:false): 2 numeroloji + 6 yebs = 8. Registry toplam 27→30 (+3 aroma).
  add("professional-registry-total-30", YH_INDEX_SOURCES.length === 30, String(YH_INDEX_SOURCES.length));
  add("dormant-professional-8", dormantPro.length === 8 && dormantPro.every((s) => /^(numeroloji|yebs):/.test(s.sourceKey)), dormantPro.map((s) => s.sourceKey).join(","));
  // Professional Cohort: numeroloji registry enabled:false KORUNDU (çift kapı; runtime processing OFF).
  add("numerology-sources-enabled-false", num.length === 2 && num.every((s) => s.enabled === false), String(num.length));
  add("professional-source-keys-unique", new Set(YH_INDEX_SOURCES.map((s) => s.sourceKey)).size === YH_INDEX_SOURCES.length);
}

// ── 3b) Numeroloji source contract (deterministic; verified tables; PII-safe) ──
{
  const byKey = new Map(YH_INDEX_SOURCES.map((s) => [s.sourceKey, s] as const));
  const src = byKey.get("numeroloji:sources");
  const ent = byKey.get("numeroloji:knowledge-entries");
  add("num-sources-family", src?.sourceFamily === "numeroloji" && src?.classification === "safe-non-pii");
  add("num-sources-table", src?.tableName === "numerology_sources" && src?.tenant.mode === "column");
  add("num-sources-updatedat", src?.updatedAtColumn === "updated_at");
  add("num-entries-family", ent?.sourceFamily === "numeroloji" && ent?.classification === "safe-non-pii");
  add("num-entries-table", ent?.tableName === "numerology_knowledge_source_entries" && ent?.searchTextColumns.includes("body"));
  // PII-safe: indexlenen kolonlarda client/PII kolonu YOK.
  const pii = ["client_id", "client_name", "name", "ad", "soyad", "dogum", "birth_date", "phone", "email", "pin"];
  const indexedCols = [src, ent].filter(Boolean).flatMap((s) => [
    ...(s!.titleColumns), ...(s!.searchTextColumns), ...(s!.snippetColumns), ...(s!.topicTagsColumns), ...(s!.relationColumns),
  ]);
  add("num-no-pii-columns", indexedCols.every((c) => !pii.includes(c)), indexedCols.join(","));
  // numerology_knowledge_records (repo'da CREATE TABLE yok) BAĞLANMADI.
  add("num-knowledge-records-not-wired", !YH_INDEX_SOURCES.some((s) => (s.tableName as string) === "numerology_knowledge_records"));
  // Family additif genişledi (mevcut 6 korunur + numeroloji).
  add("family-has-numeroloji", (YH_SOURCE_MODULES as readonly string[]).includes("numeroloji") && (YH_SOURCE_MODULES as readonly string[]).length === 8);
  add("family-has-yebs-excludes-belge", (YH_SOURCE_MODULES as readonly string[]).includes("yebs") && !(YH_SOURCE_MODULES as readonly string[]).includes("belge_video"));
  add("family-preserves-existing", ["refleksoloji", "sifa_rehberi", "biyoenerji", "dogaltas", "aromaterapi", "kisisel_arsiv"].every((m) => (YH_SOURCE_MODULES as readonly string[]).includes(m)));
  add("numeroloji-module-label", YH_MODULE_LABELS.numeroloji === "Numeroloji");
}

// ── 4) Modül-bazlı negatif güvenlik kuralları ──
{
  // Numeroloji: ad/doğum indexlenmez; isimden client eşleştirme yasak; client değil.
  add("numeroloji-deny-name-dob", denyHas("numeroloji", "doğum tarihi") && denyHas("numeroloji", "ad"));
  add("numeroloji-deny-name-match", denyHas("numeroloji", "isimden client eşleştirme"));
  // Numeroloji: professional WIRED (DORMANT_READY, 2 pro key), client YOK (DEFERRED).
  add("numeroloji-professional-dormant-ready", entry("numeroloji")?.classification === "DORMANT_READY" && entry("numeroloji")?.professionalSourceKeys.length === 2 && entry("numeroloji")?.clientSourceKeys.length === 0);
  add("numeroloji-deny-client-result", denyHas("numeroloji", "danışan analiz sonucu"));

  // Human Design: birth data denied; frozen engine; Private Memory Politika Kilidi md.13 → client chart DEFER.
  add("hd-deny-birthdata", denyHas("human_design", "doğum tarihi") && denyHas("human_design", "doğum saati") && denyHas("human_design", "koordinat"));
  add("hd-frozen-engine-noted", rationaleHas("human_design", "frozen") || rationaleHas("human_design", "dokunulmaz"));
  add("hd-client-deferred", cliKeysOf("human_design").length === 0 && entry("human_design")?.classification === "DEFERRED_FOR_SAFETY");

  // Aromaterapi: katman koruması.
  add("aroma-layer-protection", rationaleHas("aromaterapi", "katman") && (denyHas("aromaterapi", "faithful translation") || rationaleHas("aromaterapi", "faithful translation")));

  // Doğaltaş: admin/uzman ayrı; birleştirme yok.
  add("dogaltas-admin-uzman-separate", rationaleHas("dogaltas", "ayrı source") || rationaleHas("dogaltas", "birleştirme yok") || rationaleHas("dogaltas", "otomatik birleştirme yok"));

  // Danışan Yolculuğu: Private Memory Politika Kilidi → klinik serbest metin ARANABİLİR;
  // yalnız doğrudan kimlik kolonları denied; client_notes cohort'a dahil.
  add(
    "dy-clinical-searchable",
    (entry("danisan_yolculugu")?.allow ?? []).some((a) => a.toLowerCase().includes("klinik serbest metin")) &&
      denyHas("danisan_yolculugu", "ad-soyad") &&
      denyHas("danisan_yolculugu", "telefon") &&
      cliKeysOf("danisan_yolculugu").includes("danisan:notes"),
  );

  // Şifa Rehberi: snapshot recursive source yasağı.
  add("sifa-no-recursive-snapshot", denyHas("sifa_rehberi", "snapshot") && entry("sifa_rehberi")?.clientSourceKeys.length === 0);

  // YEBS: gerçek şema blocker (tenant_id yok) → DEFERRED; kaynak yok; claim birleştirme yasağı.
  add("yebs-wired-dormant", entry("yebs")?.classification === "DORMANT_READY" && entry("yebs")?.professionalSourceKeys.length === 6 && entry("yebs")?.clientSourceKeys.length === 0);
  add("yebs-global-canonical-noted", rationaleHas("yebs", "global-canonical") && rationaleHas("yebs", "published"));
  add("yebs-claim-merge-denied", denyHas("yebs", "claim birleştir") || denyHas("yebs", "karşıt"));

  // Kozmik: geçici hesap → NOT_MEMORY_SOURCE, kaynak yok.
  add("kozmik-not-memory", entry("kozmik_ajanda")?.classification === "NOT_MEMORY_SOURCE" && (entry("kozmik_ajanda")?.professionalSourceKeys.length ?? 1) === 0 && (entry("kozmik_ajanda")?.clientSourceKeys.length ?? 1) === 0);

  // Belge/Video: DEFERRED, kaynak yok, arbitrary indexleme yasağı.
  // belge_video ÜRÜN KARARIYLA NON_MEMORY_SOURCE'a taşındı (retirement); kaynak taşımaz.
  add("belge-not-memory-source", entry("belge_video")?.classification === "NOT_MEMORY_SOURCE" && (entry("belge_video")?.professionalSourceKeys.length ?? 1) === 0 && (entry("belge_video")?.clientSourceKeys.length ?? 1) === 0);

  // Kişisel Arşiv: BF-11E ROW-GATED CONTROLLED → FOUNDATION_READY (foundation WIRED; aktivasyon ayrı kapı).
  add("kisisel-arsiv-foundation-ready", entry("kisisel_arsiv")?.classification === "FOUNDATION_READY" && ((entry("kisisel_arsiv")?.professionalSourceKeys as readonly string[] | undefined)?.includes("kisisel_arsiv:archives") ?? false));
}

// ── 5) DORMANT_READY tutarlılığı: en az bir gerçek kaynak referansı ──
{
  const dormantReady = YH_MODULE_SOURCE_MATRIX.filter((m) => m.classification === "DORMANT_READY");
  add("dormant-ready-have-sources", dormantReady.every((m) => m.professionalSourceKeys.length + m.clientSourceKeys.length > 0), dormantReady.map((m) => m.moduleKey).join(","));
  // Her DORMANT_READY client source code-gate AÇIK (enabled:true); processing hâlâ DB is_active ile gated.
  const cliEnabled = new Map(YH_CLIENT_INDEX_SOURCES.map((s) => [s.sourceKey, s.enabled] as const));
  add("dormant-ready-client-sources-code-gate-open", dormantReady.every((m) => m.clientSourceKeys.every((k) => cliEnabled.get(k) === true)));
}

// ── 6) Modül etiketi tutarlılığı: client source key → bilinen client modül etiketi ──
{
  const knownClientModules = new Set(Object.keys(CLIENT_MODULE_LABELS));
  const clientSourceModule = new Map(YH_CLIENT_INDEX_SOURCES.map((s) => [s.sourceKey, s.sourceModule] as const));
  const allClientRefsLabeled = referencedClientKeys().every((k) => {
    const mod = clientSourceModule.get(k);
    return mod !== undefined && knownClientModules.has(mod);
  });
  add("client-refs-have-module-label", allClientRefsLabeled);
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-14 MODULE SOURCE MATRIX HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
