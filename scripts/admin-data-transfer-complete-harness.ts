/**
 * Admin → Uzman Veri Aktarım Merkezi — kapsamlı harness (statik sözleşme + saf mantık).
 *
 * Çalıştırma:  npx tsx scripts/admin-data-transfer-complete-harness.ts
 *
 * KAPSAM:
 *   - Kök neden düzeltmesi: all-or-nothing → bölüm-bazında atomik + kısmi başarı.
 *   - Merkezî registry (UI ⇄ server ⇄ helper drift guard).
 *   - Relational (Şifa Rehberi) parent-child FK remap.
 *   - INSERT-only, güvenli hata sözleşmesi, güvenlik (admin/target/tenant/service-role).
 *   - Görünür admin köken etiketi YOK (badge nötr + route origin_type/label yazmaz).
 *   - Saf yardımcı mantık (sayım/özet/registry türetmeleri).
 * Gerçek DB'ye YAZMAZ. cwd = repo kökü.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  ALL_TRANSFER_GROUP_KEYS,
  emptyTransferCounts,
  formatTransferResultLines,
  sumBioenergyCounts,
  sumReflexologyCounts,
  sumNumerologyCounts,
  type TransferResultCounts,
} from "../lib/admin/veriPaylasimiTransfer";
import {
  ALL_ACTIVE_GROUP_KEYS,
  GRANULAR_GROUP_KEYS,
  GROUP_KEY_LABELS,
  TRANSFER_MODULES,
  collectActiveTransferGroups,
  groupLabel,
} from "../lib/admin/transferRegistry";
import { ADMIN_AUDIT_ACTIONS } from "../lib/admin/adminAudit";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function ok(cond: boolean, name: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}

const read = (p: string): string => readFileSync(p, "utf8");
const stripTs = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripSql = (s: string): string => s.replace(/--[^\n]*/g, "");
const setEq = (a: string[], b: string[]): boolean => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

const ROUTE = "app/api/admin/veri-paylasimi/transfer/route.ts";
const HELPER = "lib/admin/veriPaylasimiTransfer.ts";
const PAGE = "app/admin/veri-paylasimi/page.tsx";
const BADGE = "components/provenance/AdminTransferBadge.tsx";
const MIGRATION = "supabase/migrations/20260929000000_healing_guides_transfer_provenance.sql";

/** Server route REGISTRY anahtar kümesini kaynak koddan çıkarır. */
function serverRegistryKeys(routeSrc: string): string[] {
  const m = routeSrc.match(/const REGISTRY\s*=\s*\{([\s\S]*?)\}\s*as const satisfies/);
  if (!m) return [];
  const body = m[1];
  const keys: string[] = [];
  // Üst-seviye anahtarlar: satır başında "  <key>: {"
  const re = /^\s{2}([a-z_]+):\s*\{/gm;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(body)) !== null) keys.push(mm[1]);
  return keys;
}

function run(): void {
  const route = read(ROUTE);
  const routeCode = stripTs(route);
  const helper = read(HELPER);
  const page = read(PAGE);
  const badge = read(BADGE);
  const badgeCode = stripTs(badge);

  // ── A) MERKEZÎ REGISTRY — UI ⇄ server ⇄ helper drift guard ──────────────────
  const srvKeys = serverRegistryKeys(route);
  ok(srvKeys.length >= 15, `route: REGISTRY anahtarları ayrıştırıldı (${srvKeys.length})`);
  ok(setEq(srvKeys, ALL_ACTIVE_GROUP_KEYS as unknown as string[]),
    "drift: transferRegistry aktif anahtarları == server REGISTRY anahtarları");
  ok(setEq(srvKeys, ALL_TRANSFER_GROUP_KEYS as unknown as string[]),
    "drift: helper ALL_TRANSFER_GROUP_KEYS == server REGISTRY");
  ok(setEq(Object.keys(emptyTransferCounts()), srvKeys),
    "drift: emptyTransferCounts anahtarları == server REGISTRY");
  ok(ALL_ACTIVE_GROUP_KEYS.every((k) => GROUP_KEY_LABELS[k]),
    "registry: her grup anahtarının GROUP_KEY_LABELS etiketi var");
  ok(GRANULAR_GROUP_KEYS.every((k) => (srvKeys as string[]).includes(k)),
    "registry: granular anahtarları server REGISTRY alt kümesi");
  // Yeni grup: healing_guides her katmanda mevcut
  for (const layer of [srvKeys, ALL_TRANSFER_GROUP_KEYS as unknown as string[], Object.keys(emptyTransferCounts())]) {
    ok(layer.includes("healing_guides"), "healing_guides tüm katmanlarda var");
  }

  // ── B) KÖK NEDEN: all-or-nothing KALDIRILDI → bölüm-bazında atomik ──────────
  ok(!/async function rollbackBatch\b/.test(route),
    "route: eski global rollbackBatch (tüm grupları silen) KALDIRILDI");
  ok(/async function rollbackGroup\b/.test(route),
    "route: grup-scoped rollbackGroup eklendi");
  // rollbackGroup paylaşılan tabloda matchColumn ile daraltır (essential↔carrier korunur)
  ok(/if \(cfg\.matchColumn && cfg\.matchValue != null\) \{[\s\S]{0,80}del = del\.eq\(cfg\.matchColumn/.test(routeCode),
    "route: rollbackGroup paylaşılan tabloda matchColumn ile grup-scoped");
  // Her grup KENDİ try/catch'inde; catch içinde SADECE o grubun rollback'i
  ok(/for \(const group of groupKeys\) \{[\s\S]*?try \{[\s\S]*?\} catch \(err\) \{[\s\S]*?rollbackGroup\(db, cfg, batchId\)/.test(routeCode),
    "route: her grup bağımsız try/catch + grup-scoped rollback");
  // Bir grubun hatası döngüyü kırmaz (grup döngüsü bölgesinde throw yok)
  const loopStart = routeCode.indexOf("for (const group of groupKeys)");
  const loopEnd = routeCode.indexOf("const failedSectionCount");
  const loopRegion = loopStart >= 0 && loopEnd > loopStart ? routeCode.slice(loopStart, loopEnd) : routeCode;
  ok(loopStart >= 0 && loopEnd > loopStart, "route: grup döngüsü bölgesi bulundu");
  ok(/rollbackGroup\(db, cfg, batchId\)/.test(loopRegion) && !/\bthrow\b/.test(loopRegion),
    "route: grup hatası tüm isteği düşürmez (döngüde rollback var, throw yok)");

  // ── C) BÖLÜM-BAZINDA SONUÇ RAPORU (kısmi başarı) ───────────────────────────
  for (const f of ["sections", "selectedSectionCount", "successfulSectionCount", "failedSectionCount", "insertedCount"]) {
    ok(new RegExp(`\\b${f}\\b`).test(routeCode), `route: response alanı ${f}`);
  }
  ok(/status:\s*result\.inserted > 0 \? "success" : "empty"/.test(routeCode),
    "route: bölüm outcome success/empty");
  ok(/status:\s*"failed"/.test(routeCode) && /errorCode:/.test(routeCode),
    "route: başarısız bölüm outcome + güvenli errorCode");
  ok(/failedSectionCount/.test(helper) && /successfulSectionCount/.test(helper),
    "helper: kısmi başarı alanlarını yüzeye çıkarır");
  ok(/Aktarım kısmen tamamlandı/.test(page),
    "page: kısmi başarı UI metni");
  ok(/Aktarılamayan bölümler/.test(page),
    "page: başarısız bölüm listesi UI");

  // ── D) RELATIONAL (Şifa Rehberi) parent-child FK REMAP ─────────────────────
  ok(/async function cloneRelationalGroup\b/.test(route), "route: cloneRelationalGroup mevcut");
  ok(/kind:\s*"relational"/.test(route) && /childTable:\s*"healing_guide_sections"/.test(route) && /childParentFk:\s*"guide_id"/.test(route),
    "route: healing_guides relational config (child + FK kolonu)");
  ok(/new Set<string>\(\[\.\.\.STRIP, childFk, "user_id"\]\)/.test(route),
    "route: child STRIP parent FK + user_id çıkarır (kaynak id/user kopyalanmaz)");
  ok(/copy\[childFk\]\s*=\s*newParentId/.test(route),
    "route: FK REMAP — child yeni parent id'ye bağlanır");
  ok(/\.insert\(parentCopy\)[\s\S]{0,40}\.select\("id"\)[\s\S]{0,20}\.single\(\)/.test(route),
    "route: parent insert → yeni id alınır (remap kaynağı)");
  ok(/rollbackGroup[\s\S]*?cfg\.kind === "relational" && cfg\.childTable[\s\S]*?childTable\)\.delete\(\)\.eq\("origin_transfer_batch_id"/.test(routeCode),
    "route: relational rollback child'ı da batch_id ile siler");
  // PER-UNIT atomik: her (parent+child'ları) bağımsız birim; birim patlarsa yeni parent
  // silinir (cascade child) ve diğer birimlere devam; hepsi patlarsa grup failed.
  ok(/delete\(\)\.eq\("id", newParentId\)/.test(routeCode),
    "route: per-unit rollback (yeni parent silinir → child cascade)");
  ok(/unitsOk === 0 && unitsFailed > 0.*throw new TransferError/.test(routeCode.replace(/\s+/g, " ")),
    "route: tüm birimler patlarsa grup failed (unitsOk==0)");
  ok(/childHasTenant/.test(route) && /copy\.tenant_id = targetTenantId/.test(route),
    "route: child tenant_id (HD sources) hedef tenant'a yazılır");

  // ── E) INSERT-ONLY (upsert/replace/onConflict YOK) ─────────────────────────
  ok(!/\.upsert\(/.test(routeCode), "route: .upsert() YOK");
  ok(!/onConflict/.test(routeCode), "route: onConflict YOK");
  ok(/\.insert\(/.test(route), "route: plain .insert() (yan yana yaşar)");

  // ── F) GÖRÜNÜR ADMİN KÖKEN ETİKETİ YOK (acceptance-J) ──────────────────────
  ok(!/origin_type\s*=\s*["']admin_transfer["']/.test(routeCode),
    "route: GÖRÜNÜR origin_type='admin_transfer' YAZILMAZ");
  ok(!/origin_label\s*=/.test(routeCode),
    "route: GÖRÜNÜR origin_label YAZILMAZ");
  // iç audit alanları KORUNUR (rollback/idempotency için)
  ok(/origin_transfer_batch_id\s*=\s*batchId/.test(routeCode),
    "route: iç origin_transfer_batch_id (rollback) KORUNUR");
  ok(/origin_source_id\s*=/.test(routeCode) && /transferred_at\s*=/.test(routeCode),
    "route: iç origin_source_id + transferred_at (audit) KORUNUR");
  // badge nötr — her zaman null; görünür "Admin Kütüphanesi" chip YOK
  ok(/return null;?\s*\}/.test(badgeCode) && !/🎁/.test(badgeCode),
    "badge: nötrlendi (her zaman null; görünür chip yok)");
  ok(!/isAdminTransferOrigin\(originType\)\)\s*return null/.test(badgeCode) || /_props/.test(badge),
    "badge: koşullu render kaldırıldı (props kullanılmıyor)");

  // ── G) GÜVENLİK sözleşmesi KORUNUR/GÜÇLENİR ────────────────────────────────
  ok(/verifyAdminRequest/.test(route), "route: verifyAdminRequest guard");
  ok(/runtime\s*=\s*["']nodejs["']/.test(route), "route: runtime nodejs");
  ok(/!==\s*["']expert["']/.test(route), "route: hedef role=expert doğrulaması");
  ok(/active !== true/.test(route), "route: hedef aktif doğrulaması");
  ok(/target\.tenant_id[\s\S]{0,40}!==\s*targetTenantId/.test(route),
    "route: hedef tenant kullanıcıyla eşleşme doğrulaması");
  ok(/targetTenantId === sourceTenantId/.test(route), "route: kaynak==hedef reddi");
  ok(/targetTenantId === ADMIN_LIBRARY_TENANT_ID/.test(route), "route: hedef admin-library reddi");
  ok(/tenant_id.*adminId|\.eq\("id", adminId\)/.test(route),
    "route: kaynak tenant SUNUCUDA (adminId ile) çözülür");
  ok(/isGroupKey/.test(route) && /Geçersiz veri grubu/.test(route),
    "route: allowlist dışı grup reddi (arbitrary tablo YOK)");
  ok(!/\.from\(\s*(body|group|table|req)\b/.test(route),
    "route: istemci string'i .from(...) içine geçmiyor");
  // helper client-side write yapmaz
  ok(!/\.from\(/.test(helper) && !/\.insert\(/.test(helper),
    "helper: client-side .from()/.insert() YOK (yalnız service-role route'a POST)");
  ok(/\/api\/admin\/veri-paylasimi\/transfer/.test(helper) && /method:\s*["']POST["']/.test(helper),
    "helper: service-role route'a POST");

  // ── H) GÜVENLİ HATA SÖZLEŞMESİ (ham DB mesajı sızmaz) ──────────────────────
  ok(!/insErr\.message|error\.message|pErr\.message|cErr\.message/.test(routeCode),
    "route: DB error.message dışarı DÖNMEZ");
  ok(!/permission denied/i.test(routeCode), "route: 'permission denied' string'i DÖNMEZ");
  for (const code of ["400", "403", "404", "409", "413", "422"]) {
    ok(new RegExp(`jsonError\\(${code}`).test(routeCode), `route: HTTP ${code} sözleşmede`);
  }

  // ── I) İDEMPOTENCY ledger + replay ─────────────────────────────────────────
  ok(/admin_library_transfer_batches/.test(route), "route: idempotency ledger");
  ok(/status:\s*["']processing["']/.test(route), "route: atomik claim (processing)");
  ok(/replayed:\s*true/.test(route), "route: replay (aynı batch kopya üretmez)");
  for (const a of ["library_transfer_completed", "library_transfer_failed", "library_transfer_retried"]) {
    ok((ADMIN_AUDIT_ACTIONS as readonly string[]).includes(a), `adminAudit: ${a} tanımlı`);
  }
  ok(/writeAdminAudit/.test(route) && /AdminAuditError/.test(route),
    "route: writeAdminAudit + AdminAuditError ele alınır");

  // ── J) MIGRATION (healing_guides provenance) ───────────────────────────────
  ok(existsSync(MIGRATION), "migration: healing provenance dosyası mevcut");
  const mig = read(MIGRATION);
  const migCode = stripSql(mig);
  ok(/ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid/.test(mig), "migration: batch_id kolonu");
  ok(/ADD COLUMN IF NOT EXISTS transferred_at timestamptz/.test(mig), "migration: transferred_at kolonu");
  ok(/'healing_guides'/.test(mig) && /'healing_guide_sections'/.test(mig),
    "migration: parent + child tabloları hedeflenir");
  ok(/to_regclass/.test(mig), "migration: to_regclass guard");
  ok(!/REFERENCES/.test(migCode) && !/ON DELETE CASCADE/.test(migCode),
    "migration: provenance FK/CASCADE YOK (additive)");
  ok(/ADD COLUMN IF NOT EXISTS/.test(mig) && /BEGIN;[\s\S]*COMMIT;/.test(mig),
    "migration: idempotent additive + tek BEGIN/COMMIT");
  // timestamp tekil + en yüksek
  const migFiles = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  const ts = migFiles.map((f) => f.slice(0, 14));
  ok(ts.filter((v) => v === "20260929000000").length === 1, "migration: 20260929000000 tekil");
  ok(ts.filter((v) => v === "20260930000000").length === 1, "migration: 20260930000000 tekil");
  // Bu turun iki migration'ı önceki tüm merged migration'lardan (<=20260928) sonra gelir.
  const preExisting = ts.filter((v) => v !== "20260929000000" && v !== "20260930000000").sort().at(-1) ?? "0";
  ok("20260929000000" > preExisting && "20260930000000" > preExisting,
    `migration: yeni timestamp'ler mevcut en yüksekten büyük (${preExisting})`);

  // ── K) SAF MANTIK: registry türetmeleri + sayım/özet ───────────────────────
  ok(Object.keys(emptyTransferCounts()).length === ALL_TRANSFER_GROUP_KEYS.length,
    `emptyTransferCounts: ${ALL_TRANSFER_GROUP_KEYS.length} grup`);
  // "Tümünü seç" simülasyonu: tüm aktif bölümler işaretli → tüm aktif grup anahtarları
  const allChecked: Record<string, boolean> = {};
  for (const mod of TRANSFER_MODULES) for (const s of mod.sections) if (s.active) allChecked[s.key] = true;
  ok(setEq(collectActiveTransferGroups(allChecked) as unknown as string[], ALL_ACTIVE_GROUP_KEYS as unknown as string[]),
    "collectActiveTransferGroups: 'tümünü seç' tüm aktif grupları üretir");
  // disabled bölüm grup üretmez
  const onlyDisabled: Record<string, boolean> = { ref_atlas: true, ref_notes: true };
  ok(collectActiveTransferGroups(onlyDisabled).length === 0,
    "collectActiveTransferGroups: disabled (localStorage) bölüm grup üretmez");
  ok(groupLabel("healing_guides").includes("Şifa Rehberi"),
    "groupLabel: healing_guides → Şifa Rehberi etiketi");

  const counts: TransferResultCounts = emptyTransferCounts();
  counts.stones = 2;
  counts.bioenergy_symbols = 1;
  counts.bioenergy_chakras = 2;
  counts.reflexology_protocols = 1;
  counts.numerology_knowledge_records = 3;
  counts.healing_guides = 4;
  counts.hd_knowledge = 5;
  counts.aromatherapy_blends = 2;
  counts.bioenergy_sessions = 4;
  ok(sumBioenergyCounts(counts) === 3 + 4, "sumBioenergyCounts sessions dahil doğru");
  ok(sumReflexologyCounts(counts) === 1, "sumReflexologyCounts doğru");
  ok(sumNumerologyCounts(counts) === 3, "sumNumerologyCounts doğru");
  const lines = formatTransferResultLines(counts, "uzman@x.com");
  ok(lines.some((l) => /2 Doğaltaş/.test(l)) && lines.some((l) => /7 Biyoenerji/.test(l)),
    "formatTransferResultLines: doğaltaş + biyoenerji (sessions dahil) satırları");
  ok(lines.some((l) => /4 Şifa rehberi/.test(l)),
    "formatTransferResultLines: healing_guides satırı");
  ok(lines.some((l) => /5 Human Design/.test(l)),
    "formatTransferResultLines: hd_knowledge satırı");
  ok(lines.some((l) => /2 Aromaterapi blend/.test(l)),
    "formatTransferResultLines: aromatherapy_blends satırı");

  // ── L) UI hiyerarşik seçim (Tümünü Seç / modül / indeterminate) ────────────
  ok(/Tüm Verileri Seç/.test(page), "page: 'Tüm Verileri Seç' global kontrol");
  ok(/Modülün tümünü seç/.test(page), "page: modül-tümü kontrol metni");
  ok(/TriCheckbox/.test(page) && /indeterminate/.test(page),
    "page: indeterminate (tri-state) checkbox");
  ok(/toggleAll\(/.test(page) && /toggleModule\(/.test(page) && /toggleSection\(/.test(page),
    "page: global/modül/bölüm toggle handler'ları");
  ok(/setTransferring\(true\)/.test(page) && /canTransfer/.test(page),
    "page: double-submit guard (transferring/canTransfer)");
  ok(/bağımsız kopya olarak eklenecek/.test(page), "page: bağımsız kopya onay metni");
  ok(/değiştirilmez, silinmez veya replace edilmez/.test(page),
    "page: yeni bağımsız kayıt / replace yok mesajı");

  // ── M) YENİ KAPSAMLAR: HD + Biyoenerji Seansları + Aromaterapi Blend ───────
  // Server REGISTRY yeni anahtarları içeriyor (drift setEq zaten kümece doğruladı)
  for (const k of ["hd_knowledge", "bioenergy_sessions", "aromatherapy_blends"]) {
    ok(srvKeys.includes(k), `route REGISTRY yeni anahtar: ${k}`);
    ok((ALL_ACTIVE_GROUP_KEYS as unknown as string[]).includes(k), `registry aktif: ${k}`);
  }
  // HD relational config (records + sources, record_id FK, child tenant var)
  ok(/hd_knowledge:\s*\{[\s\S]*?kind:\s*"relational"[\s\S]*?childTable:\s*"human_design_knowledge_sources"[\s\S]*?childParentFk:\s*"record_id"[\s\S]*?childHasTenant:\s*true/.test(route),
    "route: hd_knowledge relational (records+sources, record_id FK, child tenant)");
  ok(/HD_RECORD_COPY_FIELDS/.test(route) && !/expert_notes/.test(route.split("HD_RECORD_COPY_FIELDS")[1]?.split("]")[0] ?? ""),
    "route: HD parent allowlist (expert_notes/user_id TAŞINMAZ)");
  // Biyoenerji Seansları flat, iş-alanı allowlist
  ok(/bioenergy_sessions:\s*\{\s*table:\s*"bioenergy_sessions", copyFields:\s*SESSION_COPY_FIELDS/.test(route),
    "route: bioenergy_sessions flat + SESSION_COPY_FIELDS allowlist");
  ok(/SESSION_COPY_FIELDS = \["title", "content", "category", "source", "note"\]/.test(route),
    "route: bioenergy_sessions yalnız iş alanları (id/tenant/created taşınmaz)");
  // Aromaterapi blend flat JSONB snapshot
  ok(/aromatherapy_blends:\s*\{\s*table:\s*"aromatherapy_blends", copyFields:\s*BLEND_COPY_FIELDS/.test(route),
    "route: aromatherapy_blends flat + BLEND_COPY_FIELDS (JSONB snapshot)");
  // UI kaynağı registry'dir (page modülleri TRANSFER_MODULES'ten render eder).
  const hdMod = TRANSFER_MODULES.find((m) => m.key === "human_design");
  ok(!!hdMod && hdMod.sections.some((s) => s.key === "hd_knowledge" && s.active),
    "registry: Human Design modülü + hd_knowledge aktif section");
  const bioMod = TRANSFER_MODULES.find((m) => m.key === "bioenergy");
  ok(!!bioMod && bioMod.sections.some((s) => s.key === "bioenergy_sessions" && s.active),
    "registry: Biyoenerji Seansları aktif section");
  const aroMod = TRANSFER_MODULES.find((m) => m.key === "aromatherapy");
  ok(!!aroMod && aroMod.sections.some((s) => s.key === "aromatherapy_blends" && s.active),
    "registry: Aromaterapi Blend aktif section");
  // page gerçekten registry'yi dinamik render ediyor (statik değil)
  ok(/TRANSFER_MODULES\.map/.test(page), "page: modülleri registry'den dinamik render eder");
  // Yeni provenance migration (4 hedef tablo)
  const MIG2 = "supabase/migrations/20260930000000_transfer_provenance_hd_bioenergy_blends.sql";
  ok(existsSync(MIG2), "migration: 20260930 (HD/bioenergy/blend provenance) mevcut");
  const mig2 = read(MIG2);
  for (const t of ["human_design_knowledge_records", "human_design_knowledge_sources", "bioenergy_sessions", "aromatherapy_blends"]) {
    ok(new RegExp(`'${t}'`).test(mig2), `migration 20260930: hedef ${t}`);
  }
  ok(/ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid/.test(mig2) && !/REFERENCES/.test(stripSql(mig2)) && !/ON DELETE CASCADE/.test(stripSql(mig2)),
    "migration 20260930: additive provenance, FK/CASCADE yok");

  console.log(`\nadmin-data-transfer-complete harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Veri Aktarım Merkezi — bölüm-bazında atomik + kısmi başarı + FK remap + merkezî registry + görünür köken YOK geçti.");
}

run();
