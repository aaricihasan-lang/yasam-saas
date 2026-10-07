/**
 * SİLME GÜVENLİĞİ — birim + statik kapsam harness'i (DB'siz, ağsız).
 *
 *  A) lib/ui/bulkDeleteGuard: eşik (1–2 serbest, 3+ ve tümünü sil → 3 aşama), ifade üretimi ve
 *     Türkçe/harf-duyarsız eşleşme, runBulkDeleteConfirm akışı (her aşamada iptal → false,
 *     yanlış ifade → false, yalnız 3 onayla true; DELETE yalnız true'da çağrılır).
 *  B) hooks/useDeleteConfirm sayım çözümü (count > names > 1).
 *  C) lib/admin/expertPurge: uygunluk, e-posta eşleşmesi, RPC hata eşlemesi (ham SQL sızmaz),
 *     Storage önekleri (yalnız hedef tenant).
 *  D) lib/api/bulkDeleteLimits.
 *  E) STATİK KAPSAM: envanterdeki her toplu silme yüzeyi 3 aşamalı akışa bağlı mı; sınırsız toplu
 *     silme endpoint'i kaldı mı; purge route'u requireMainAdmin'i hedef okumadan ÖNCE çağırıyor mu.
 *
 * Çalıştır: npx tsx scripts/delete-safety/unit.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BULK_DELETE_THRESHOLD,
  bulkDeletePhrase,
  bulkPhraseMatches,
  buildBulkDeleteStages,
  requiresBulkDeleteGuard,
  runBulkDeleteConfirm,
  type BulkConfirmFn,
} from "../../lib/ui/bulkDeleteGuard";
import { resolveDeleteCount } from "../../hooks/useDeleteConfirm";
import {
  checkPurgeEligibility,
  purgeEmailMatches,
  purgeRpcError,
  tenantStorageTargets,
} from "../../lib/admin/expertPurge";
import { MAX_BULK_DELETE_IDS, exceedsBulkDeleteLimit, dedupeIds } from "../../lib/api/bulkDeleteLimits";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

type Call = Parameters<BulkConfirmFn>[0];
/** Sahte onay: her aşama için sırayla yanıt verir; requireTextMatcher varsa yazılan metni dener. */
function fakeConfirm(answers: (boolean | { type: string })[]) {
  const calls: Call[] = [];
  const fn: BulkConfirmFn = async (opts) => {
    calls.push(opts);
    const a = answers[calls.length - 1];
    if (a === undefined) return false;
    if (typeof a === "object") return opts.requireTextMatcher ? opts.requireTextMatcher(a.type) : false;
    return a;
  };
  return { fn, calls };
}

async function flow(count: number, answers: (boolean | { type: string })[], deleteAll = false) {
  const { fn, calls } = fakeConfirm(answers);
  let deletes = 0;
  const confirmed = await runBulkDeleteConfirm(fn, { count, deleteAll });
  if (confirmed) deletes++; // çağıran yalnız true'da DELETE gönderir
  return { confirmed, calls, deletes };
}

async function main(): Promise<void> {
  // ── A) Eşik + ifade ────────────────────────────────────────────────────────
  console.log("[A] bulkDeleteGuard");
  ok(BULK_DELETE_THRESHOLD === 3, "eşik 3");
  ok(!requiresBulkDeleteGuard(1) && !requiresBulkDeleteGuard(2), "1 ve 2 kayıt → mevcut onay (3 aşama yok)");
  ok(requiresBulkDeleteGuard(3) && requiresBulkDeleteGuard(30) && requiresBulkDeleteGuard(500), "3 / 30 / 500 kayıt → 3 aşama");
  ok(requiresBulkDeleteGuard(1, true) && requiresBulkDeleteGuard(0, true), "tümünü sil → sayıdan bağımsız 3 aşama");
  ok(bulkDeletePhrase(30) === "30 KAYDI SİL" && bulkDeletePhrase(5, true) === "TÜMÜNÜ SİL", "ifadeler");
  ok(bulkPhraseMatches("30 KAYDI SİL", "30 KAYDI SİL"), "birebir eşleşme");
  ok(bulkPhraseMatches("  30 kaydı sil ", "30 KAYDI SİL"), "küçük harf + Türkçe + boşluk");
  ok(bulkPhraseMatches("30 kaydi sil", "30 KAYDI SİL") && bulkPhraseMatches("30 KAYDI SIL", "30 KAYDI SİL"), "ı/i ve İ/I (Türkçe olmayan klavye)");
  ok(bulkPhraseMatches("tümünü sil", "TÜMÜNÜ SİL"), "tümünü sil küçük harf");
  ok(!bulkPhraseMatches("3 KAYDI SİL", "30 KAYDI SİL"), "yanlış sayı → eşleşmez");
  ok(!bulkPhraseMatches("SİL", "30 KAYDI SİL") && !bulkPhraseMatches("", "30 KAYDI SİL"), "eksik ifade → eşleşmez");
  ok(!bulkPhraseMatches("30 KAYIT SİL", "30 KAYDI SİL"), "farklı kelime → eşleşmez");
  const st = buildBulkDeleteStages({ count: 30 });
  ok(st.stage1.message.startsWith("30 kayıt kalıcı olarak silinecek. Bu işlem geri alınamaz."), "aşama 1 metni");
  ok(st.stage1.confirmText === "Devam Et" && st.stage2.confirmText === "Devam Et", "aşama 1/2 → Devam Et");
  ok(st.stage3.title === "Son Onay — Bu işlem geri alınamaz." && st.stage3.confirmText === "Kalıcı Olarak Sil (30)" &&
     st.stage3.message.includes("30 kayıt"), "aşama 3: son onay + sayı tekrar + Kalıcı Olarak Sil");

  // ── runBulkDeleteConfirm ──
  let f = await flow(3, [true, { type: "3 KAYDI SİL" }, true]);
  ok(f.confirmed && f.calls.length === 3 && f.deletes === 1, "3 kayıt: 3 ayrı onay → DELETE 1 kez");
  ok(f.calls[1].requireText === "3 KAYDI SİL", "aşama 2 doğrulama ifadesi zorunlu");
  f = await flow(30, [true, { type: "30 kaydı sil" }, true]);
  ok(f.confirmed && f.calls.length === 3, "30 kayıt: 3 aşama");
  f = await flow(7, [true, { type: "TÜMÜNÜ SİL" }, true], true);
  ok(f.confirmed && f.calls[0].title?.startsWith("Tümünü Sil") === true, "tümünü sil: 3 aşama");
  f = await flow(30, [true, { type: "3 KAYDI SİL" }, true]);
  ok(!f.confirmed && f.deletes === 0 && f.calls.length === 2, "aşama 2 yanlış ifade → silme yok, aşama 3'e geçilmez");
  f = await flow(30, [false]);
  ok(!f.confirmed && f.deletes === 0 && f.calls.length === 1, "aşama 1 iptal (Vazgeç/ESC/dışarı) → silme yok");
  f = await flow(30, [true, { type: "30 KAYDI SİL" }, false]);
  ok(!f.confirmed && f.deletes === 0, "son onay verilmeden kapatma → silme yok");
  f = await flow(30, [true, false]);
  ok(!f.confirmed && f.deletes === 0, "aşama 2 iptal → silme yok");

  // ── B) Sayım çözümü ────────────────────────────────────────────────────────
  console.log("\n[B] useDeleteConfirm sayım çözümü");
  ok(resolveDeleteCount({}) === 1, "tekli silme → 1");
  ok(resolveDeleteCount({ names: ["a", "b"] }) === 2, "2 ad → 2 (mevcut onay)");
  ok(resolveDeleteCount({ names: ["a", "b", "c"] }) === 3, "3 ad → 3 (3 aşama)");
  ok(resolveDeleteCount({ count: 40, names: ["a"] }) === 40, "açık count önceliklidir (kısaltılmış ad listesi)");

  // ── C) Purge yardımcıları ──────────────────────────────────────────────────
  console.log("\n[C] expertPurge");
  ok(checkPurgeEligibility({ role: "expert", approval_status: "approved", active: false }).ok, "arşivdeki uzman uygun");
  ok(!checkPurgeEligibility({ role: "admin", approval_status: "approved", active: false }).ok, "admin hedef uygun değil");
  ok(!checkPurgeEligibility({ role: "expert", approval_status: "approved", active: false, is_super_admin: true }).ok, "owner hedef uygun değil");
  ok(!checkPurgeEligibility({ role: "expert", approval_status: "approved", active: true }).ok, "aktif uzman uygun değil");
  ok(!checkPurgeEligibility({ role: "expert", approval_status: "pending", active: false }).ok, "onay bekleyen uygun değil");
  ok(!checkPurgeEligibility({ role: "expert", approval_status: "approved", active: false, is_demo_account: true }).ok, "demo uygun değil");
  ok(purgeEmailMatches(" A@B.Test ", "a@b.test") && !purgeEmailMatches("a@b.tes", "a@b.test") && !purgeEmailMatches("", ""), "e-posta eşleşmesi");
  ok(purgeRpcError({ code: "UP003" }).status === 403, "UP003 → 403");
  ok(purgeRpcError({ code: "UP006" }).status === 409 && purgeRpcError({ code: "UP004" }).status === 404, "UP006 → 409, UP004 → 404");
  ok(purgeRpcError({ code: "UP023", message: "SQL detay" }).error.includes("HİÇBİR veri silinmedi") &&
     !purgeRpcError({ code: "XX000", message: "relation secret" }).error.includes("relation"), "ham SQL hatası sızmaz");
  const tid = "11111111-2222-4333-8444-555555555555";
  const targets = tenantStorageTargets(tid);
  ok(targets.length >= 8 && targets.every((t) => t.prefix.includes(`${tid}/`)), "Storage önekleri yalnız hedef tenant id'sini içerir");
  ok(targets.every((t) => t.bucket !== "store-product-images"), "mağaza (admin) bucket'ı kapsam dışı");

  // ── D) Sunucu sınırı ───────────────────────────────────────────────────────
  console.log("\n[D] bulkDeleteLimits");
  ok(MAX_BULK_DELETE_IDS === 1000 && !exceedsBulkDeleteLimit(new Array(1000)) && exceedsBulkDeleteLimit(new Array(1001)), "1000 sınırı");
  ok(dedupeIds(["a", "b", "a"]).length === 2, "dedupe");

  // ── E) Statik kapsam ───────────────────────────────────────────────────────
  console.log("\n[E] Statik kapsam — toplu silme yüzeyleri");
  const viaDeleteConfirmCount = [
    "app/sifa-rehberi/page.tsx",
    "app/danisan-yolculugu/liste/page.tsx",
    "app/numeroloji/liste/page.tsx",
    "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx",
    "app/dogaltas/mineral-listesi/page.tsx",
    "app/dogaltas/dogaltas-listesi/page.tsx",
    "app/aromaterapi/_components/OilsPage.tsx",
    "app/urun-stok/yag/page.tsx",
    "app/urun-stok/sabun-krem/page.tsx",
    "app/urun-stok/diger/page.tsx",
    "app/urun-stok/aksesuar/page.tsx",
    "app/urun-stok/dogaltas/page.tsx",
  ];
  for (const p of viaDeleteConfirmCount) {
    const s = read(p);
    ok(/deleteConfirm\(\{[\s\S]{0,600}?count:/.test(s), `${p}: deleteConfirm açık count ile (3+ → 3 aşama)`);
  }
  for (const p of ["app/urun-stok/yag/page.tsx", "app/urun-stok/sabun-krem/page.tsx", "app/urun-stok/diger/page.tsx",
    "app/urun-stok/aksesuar/page.tsx", "app/urun-stok/dogaltas/page.tsx"]) {
    const s = read(p);
    ok(s.includes("deleteBusyRef.current") && s.includes("salesCancelBusyRef.current"), `${p}: çift tıklama ref kilidi`);
    ok(!s.includes("cihazınızdan silindi ancak buluttan"), `${p}: başarısız bulut silmesi başarılı gibi gösterilmez`);
  }
  const viaRunFlow = [
    "app/numeroloji/bilgi-bankasi/components/BilgiKayitListesi.tsx",
    "app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx",
    "app/dogaltas/kombinasyonlar/page.tsx",
    "app/human-design/bilgi-bankasi/page.tsx",
    "app/admin/human-design/page.tsx",
    "app/refleksoloji/components/LegacyQuarantineBanner.tsx",
    "app/kupa/takvim/components/CalendarWorkspace.tsx",
  ];
  for (const p of viaRunFlow) {
    const s = read(p);
    ok(s.includes("requiresBulkDeleteGuard(") && s.includes("runBulkDeleteConfirm(confirm"), `${p}: 3+ → runBulkDeleteConfirm`);
  }
  const bio = read("app/dashboard/biyoenerji/components/BiyoenerjiDangerDeleteModal.tsx");
  ok(bio.includes("guardedSelected") && bio.includes("bulkPhraseMatches(codeInput, phrase)") && bio.includes("Son Onay — Bu işlem geri alınamaz."),
    "Biyoenerji seçilenleri sil: 3+ → 3 aşama (ifade + son onay)");
  const hook = read("hooks/useDeleteConfirm.ts");
  ok(hook.includes("requiresBulkDeleteGuard(count, opts.deleteAll)"), "useDeleteConfirm 3+ dalı");
  const kombi = read("app/dogaltas/kombinasyonlar/page.tsx");
  ok(kombi.includes("visibleIssues.has(issue)"), "Kombinasyonlar: gizli seçim silinmez (görünür ∩ seçili)");

  console.log("\n[E2] Sunucu: sınırsız toplu silme kalmadı");
  for (const p of [
    "app/api/aromaterapi/oils/route.ts", "app/api/dogaltas/stones/bulk-delete/route.ts",
    "app/api/dogaltas/minerals/bulk-delete/route.ts", "app/api/dogaltas/knowledge/route.ts",
    "app/api/dogaltas/stone-exclusions/route.ts", "app/api/sifa-rehberi/guides/route.ts", "app/api/hd/knowledge/route.ts",
  ]) ok(read(p).includes("exceedsBulkDeleteLimit("), `${p}: üst sınır`);
  const transfer = read("app/api/admin/veri-paylasimi/transfer/route.ts");
  ok(/rollbackGroup\(db, cfg, batchId, targetTenantId\)/.test(transfer) && transfer.includes('.eq("tenant_id", targetTenantId);'),
    "veri aktarım telafi-silmesi hedef tenant ile sınırlı");

  console.log("\n[E3] Purge route sırası");
  const purge = read("app/api/admin/users/[id]/purge/route.ts");
  const iMain = purge.indexOf("requireMainAdmin(db, adminId)");
  const iTarget = purge.indexOf('.from("users")');
  ok(iMain > 0 && iTarget > iMain, "requireMainAdmin hedef okumadan ÖNCE (normal admin hiçbir bilgi öğrenmez)");
  ok(purge.includes("verify_admin_login") && purge.includes("purgeEmailMatches(") && purge.includes("PURGE_FINAL_PHRASE"),
    "parola + e-posta + son ifade sunucuda doğrulanır");
  const mig = read("supabase/migrations/20271009100000_admin_purge_archived_expert.sql");
  ok(/v_actor\.is_super_admin IS NOT TRUE/.test(mig), "DB fonksiyonu owner işaretini ayrıca doğrular");
  ok(/REVOKE ALL ON FUNCTION public\.admin_purge_archived_expert\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated;/.test(mig),
    "purge RPC anon/authenticated'a kapalı");

  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
  if (fail > 0) {
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
