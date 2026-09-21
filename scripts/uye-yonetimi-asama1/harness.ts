/**
 * ÜYE YÖNETİMİ — AŞAMA 1 harness (atomiklik sürümü).
 *
 * (1) SAF MANTIK: membershipActions yardımcıları (izin koruma, approved_at semantiği,
 *     arşiv kapsamı, gerçek erişim türetimi, audit seçimi) — RPC'nin ENFORCE ettiği
 *     semantiği belgeler/test eder.
 * (2) KAYNAK & MIGRATION SÖZLEŞMESİ: durum değişikliği + audit'in TEK transaction'da
 *     (dar-yetkili RPC) yapıldığını, izinlerin korunduğunu, hard-delete olmadığını,
 *     FOR UPDATE kilidi + service_role-only EXECUTE + fail-closed audit'i doğrular.
 *
 * NOT: Gerçek PostgreSQL transaction davranışı (rollback/kilit) yalnız yetkili izole DB'de
 * çalıştırılabilir → burada KAYNAK/SQL SÖZLEŞMESİ düzeyinde doğrulanır (entegrasyon: DOĞRULANAMADI).
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-asama1/harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  currentModulePermissions,
  preservedApprovedAt,
  isArchivedExpert,
  deriveBaseExpertAccess,
  pickLatestAuditByAction,
  approverForPreservedDate,
  APPROVAL_AUDIT_ACTION,
  DEACTIVATION_AUDIT_ACTIONS,
} from "../../lib/admin/membershipActions";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}
function read(rel: string): string { return readFileSync(path.join(process.cwd(), rel), "utf8"); }
function stripLineComments(src: string): string { return src.replace(/(^|[^:])\/\/.*$/gm, "$1"); }

// ─── (1) SAF MANTIK ──────────────────────────────────────────────────────────
console.log("\n[1] Saf mantık");
ok(JSON.stringify(currentModulePermissions({ module_permissions: { numerology: true, stones: true, x: "no" } })) === JSON.stringify({ numerology: true, stones: true }), "currentModulePermissions yalnız boolean izinleri korur (Num.+Doğaltaş)");
ok(JSON.stringify(currentModulePermissions({})) === "{}", "currentModulePermissions izin yoksa {}");
ok(JSON.stringify(currentModulePermissions({ module_permissions: null })) === "{}", "currentModulePermissions null → {}");
ok(preservedApprovedAt({ approval_status: "approved", approved_at: "2026-01-02T03:04:05Z" }) === "2026-01-02T03:04:05Z", "preservedApprovedAt: zaten approved+tarih → ilk tarih korunur");
ok(preservedApprovedAt({ approval_status: "pending", approved_at: null }) === null, "preservedApprovedAt: pending → null");
ok(preservedApprovedAt({ approval_status: "approved", approved_at: "" }) === null, "preservedApprovedAt: approved ama tarih yok → null");
ok(isArchivedExpert({ role: "expert", approval_status: "approved", active: false }) === true, "arşiv: expert+approved+pasif → true");
ok(isArchivedExpert({ role: "expert", approval_status: "approved", active: true }) === false, "arşiv: aktif uzman → false");
ok(isArchivedExpert({ role: "expert", approval_status: "pending", active: false }) === false, "arşiv: pending → HARİÇ");
ok(isArchivedExpert({ role: "expert", approval_status: "rejected", active: false }) === false, "arşiv: rejected → HARİÇ");
ok(isArchivedExpert({ role: "admin", approval_status: "approved", active: false }) === false, "arşiv: admin → HARİÇ");
ok(deriveBaseExpertAccess({ role: "admin", active: false, approvalStatus: "pending" }) === true, "erişim: admin her zaman");
ok(deriveBaseExpertAccess({ role: "expert", active: true, approvalStatus: "approved", packageType: "premium" }) === true, "erişim: expert active+approved+premium → VAR");
ok(deriveBaseExpertAccess({ role: "expert", active: true, approvalStatus: "approved", packageType: "trial" }) === false, "erişim: expert+DENEME → YOK (yanıltıcı 'Aktif'e rağmen)");
ok(deriveBaseExpertAccess({ role: "expert", active: false, approvalStatus: "approved", packageType: "premium" }) === false, "erişim: pasif premium → YOK");
const auditSample = [
  { action: "user_activated", created_at: "2026-03-01T00:00:00Z" },
  { action: "user_deactivated", created_at: "2026-02-01T00:00:00Z" },
  { action: "user_archived", created_at: "2026-04-01T00:00:00Z" },
];
ok(pickLatestAuditByAction(auditSample, [...DEACTIVATION_AUDIT_ACTIONS])?.action === "user_archived", "pickLatestAuditByAction: en yeni pasife-alma");
ok(APPROVAL_AUDIT_ACTION.approve === "user_approved" && APPROVAL_AUDIT_ACTION.reject === "user_rejected", "onay/ret audit sözleşmesi");
// approverForPreservedDate — onaylayan adı YALNIZ korunan tarihle AYNI kayıttan (yeniden-onay uyuşmazlığı önlenir)
ok(approverForPreservedDate({ actorName: "Admin A", createdAt: "2026-01-02T03:04:05Z" }, "2026-01-02T03:04:05Z") === "Admin A", "approver: tarih=kayıt → onaylayan döner");
ok(approverForPreservedDate({ actorName: "Admin B", createdAt: "2026-05-05T05:05:05Z" }, "2026-01-02T03:04:05Z") === null, "approver: yeniden-onay (tarih≠ilk kayıt) → null (yanlış isim GÖSTERİLMEZ)");
ok(approverForPreservedDate(null, "2026-01-02T03:04:05Z") === null, "approver: ilk onay kaydı yok (50-pencere dışı) → null");
ok(approverForPreservedDate({ actorName: "Admin A", createdAt: "2026-01-02T03:04:05Z" }, null) === null, "approver: approvedAt yok → null");
ok(approverForPreservedDate({ actorName: "", createdAt: "2026-01-02T03:04:05Z" }, "2026-01-02T03:04:05Z") === null, "approver: eşleşme var ama ad boş → null");
ok(approverForPreservedDate({ actorName: "Admin A", createdAt: "2026-01-02T03:04:05.000Z" }, "2026-01-02T03:04:05Z") === "Admin A", "approver: aynı an farklı ISO biçimi (ms) → eşleşir");

// ─── (2) MIGRATION SÖZLEŞMESİ (atomiklik + eşzamanlılık + güvenlik) ───────────
console.log("\n[2] Migration RPC sözleşmesi");
const mig = read("supabase/migrations/20270107000000_admin_membership_atomic_rpcs.sql");
for (const fn of ["admin_approve_expert_premium", "admin_reject_user", "admin_set_user_active", "admin_archive_user"]) {
  ok(new RegExp(`create or replace function public\\.${fn}`, "i").test(mig), `migration: ${fn} tanımlı`);
}
ok((mig.match(/for update/gi) || []).length >= 4, "migration: her RPC hedef satırı FOR UPDATE ile kilitler (eşzamanlılık)");
ok((mig.match(/insert into public\.admin_audit_log/gi) || []).length >= 4, "migration: her RPC AYNI fonksiyonda audit yazar (atomik)");
ok((mig.match(/security definer/gi) || []).length >= 4, "migration: RPC'ler SECURITY DEFINER");
ok(/set search_path = public, pg_catalog/i.test(mig), "migration: sabit search_path");
ok(/grant execute on function .* to service_role/i.test(mig) && /revoke all on function .* from public, anon, authenticated/i.test(mig), "migration: yalnız service_role EXECUTE (PUBLIC/anon/auth REVOKE)");
ok(/lower\(coalesce\(v_actor\.role,''\)\)\s*<>\s*'admin'\s+or\s+v_actor\.active is not true/i.test(mig), "migration: aktör DB'de admin+aktif doğrulanır (istemci bayrağına güvenilmez)");
ok(/v_actor_main\s*:=\s*coalesce\(v_actor\.is_super_admin/i.test(mig), "migration: actor_is_main_admin is_super_admin'den türetilir (parametreden değil)");
ok(/yh_grade_expert_premium\(p_user_id, p_membership, NULL\)/i.test(mig), "migration: approve YH grant'i AYNI tx'te çağırır + izinleri KORUR (NULL)");
ok(/approved_at\s*=\s*COALESCE\(v_prior_approved_at, now\(\)\)/i.test(mig), "migration: approve ilk onay tarihini korur (tx içinde)");
// reject approved_at'e DOKUNMAZ (silme yok):
ok(!/admin_reject_user[\s\S]*?approved_at\s*=/i.test(mig.split("admin_set_user_active")[0]), "migration: reject approved_at'i SİLMEZ");
// Issue-1: set_user_active optimistic-concurrency (bayat istemci → yanlış yönde toggle önlenir)
ok(/p_expected_active\s+boolean\s+default\s+null/i.test(mig), "migration: admin_set_user_active p_expected_active (opsiyonel) parametresi");
ok(/p_expected_active is not null and v_prior_active is distinct from p_expected_active/i.test(mig), "migration: KİLİT altında beklenen≠gerçek durum → RAISE");
ok(/using errcode = 'UY001'/i.test(mig), "migration: durum-uyuşmazlığı ayırt edilebilir ERRCODE (UY001)");
ok(/admin_set_user_active\(uuid,uuid,boolean,boolean\)/.test(mig), "migration: grant/revoke yeni 4-arg imzayı hedefler");

// ─── (3) ROUTE & UI KAYNAK SÖZLEŞMESİ ────────────────────────────────────────
console.log("\n[3] Route & UI sözleşmesi");
const statusSrc = stripLineComments(read("app/api/admin/users/[id]/status/route.ts"));
ok(/rpc\("admin_approve_expert_premium"/.test(statusSrc), "status.approve → admin_approve_expert_premium RPC");
ok(/rpc\("admin_reject_user"/.test(statusSrc), "status.reject → admin_reject_user RPC");
ok(/rpc\("admin_set_user_active"/.test(statusSrc), "status.toggle → admin_set_user_active RPC");
ok(!/buildPremiumModulePermissionsPayload/.test(statusSrc), "status: TÜM modülleri açan payload KULLANILMAZ");
ok(!/writeAdminAudit/.test(statusSrc), "status: app-katmanı ayrı audit YOK (audit RPC içinde, atomik)");
ok(/revokeAllActiveSessions/.test(statusSrc) && /admin_set_user_active[\s\S]*revokeAllActiveSessions/.test(statusSrc), "status: pasifleştirme sonrası oturum iptali (RPC'den SONRA)");
// Issue-1: toggle güvenilir sunucu durumuna göre; bayat istemci verisi 409'a maplenir
ok(/typeof body\.currentActive !== "boolean"/.test(statusSrc), "status.toggle: currentActive boolean ZORUNLU (bayat/eksik veri reddedilir)");
ok(/p_expected_active:\s*expectedActive/.test(statusSrc), "status.toggle: beklenen mevcut durum RPC'ye geçer (optimistic-concurrency)");
ok(/code === "UY001"[\s\S]*status:\s*409/.test(statusSrc), "status.toggle: durum-uyuşmazlığı (UY001) → 409 (yanlış yönde değişiklik yok)");

const pkgSrc = stripLineComments(read("app/api/admin/users/[id]/package/route.ts"));
// Issue-3: premium ATAMA da audited atomik RPC'den geçer (audit'siz yh_grade boşluğu kapandı)
ok(/rpc\("admin_approve_expert_premium"/.test(pkgSrc) && /packagePlan === "premium"/.test(pkgSrc), "package.premium → admin_approve_expert_premium (ZORUNLU audit + atomik)");
ok(!/gradeExpertPremiumWithYasamHafizasi/.test(pkgSrc), "package: audit'siz doğrudan yh_grade çağrısı KALDIRILDI");
ok(!/buildPremiumModulePermissionsPayload/.test(pkgSrc), "package: TÜM modülleri açan payload KALDIRILDI");
ok(!/p_module_permissions/.test(pkgSrc), "package.premium: modül izinleri RPC içinde KORUNUR (snapshot geçilmez)");

const delSrc = stripLineComments(read("app/api/admin/users/[id]/delete/route.ts"));
ok(/rpc\("admin_archive_user"/.test(delSrc), "delete → admin_archive_user RPC (atomik: active=false + user_archived)");
ok(!/\.delete\(\)/.test(delSrc) && !/DELETE FROM/i.test(delSrc), "delete: hard-delete YOK");
ok(/requireMainAdmin\(/.test(delSrc) && /verify_admin_login/.test(delSrc), "delete: owner-only + admin parola doğrulaması korundu");

const auditRoute = stripLineComments(read("app/api/admin/users/[id]/audit/route.ts"));
ok(/verifyAdminRequest/.test(auditRoute) && !/\.insert\(|\.update\(|\.delete\(/.test(auditRoute), "audit API: korumalı + SALT OKUNUR");
// Issue-2: ilk onay kaydı AYRI ASC sorgu ile (50-satır penceresi düşürse bile kaçmaz)
ok(/eq\("action",\s*"user_approved"\)[\s\S]*order\("created_at",\s*\{\s*ascending:\s*true/.test(auditRoute), "audit API: ilk (en eski) user_approved ASC sorgu ile alınır (50-limit bypass)");
ok(/firstApproval/.test(auditRoute), "audit API: yanıt firstApproval içerir");
const archiveRoute = stripLineComments(read("app/api/admin/users/archive/route.ts"));
ok(/eq\("role",\s*"expert"\)/.test(archiveRoute) && /eq\("approval_status",\s*"approved"\)/.test(archiveRoute) && /eq\("active",\s*false\)/.test(archiveRoute) && !/\.insert\(|\.update\(|\.delete\(/.test(archiveRoute), "archive API: kapsam expert&approved&pasif + SALT OKUNUR");

const detail = read("app/admin/users/[id]/page.tsx");
ok(/loadAudit/.test(detail) && /deriveBaseExpertAccess/.test(detail), "detay: audit çekimi + gerçek erişim türetimi");
ok(/onaylayan bilgisi mevcut değil/.test(detail), "detay: onaylayan yoksa dürüst fallback");
// Issue-2: onaylayan adı, korunan tarihle AYNI kayıttan türer (en-yeni user_approved find KALDIRILDI)
ok(/approverForPreservedDate\(\s*auditFirstApproval/.test(detail), "detay: onaylayan approverForPreservedDate ile (tarih=kayıt eşleşmesi)");
ok(!/auditRows\.find\(\(r\) => r\.action === "user_approved"\)/.test(detail), "detay: 'en yeni user_approved' seçimi KALDIRILDI (yeniden-onay uyuşmazlığı yok)");
ok(/Pasife Al ve Arşivle/.test(detail) && !/savePackageMembership/.test(detail) && !/SİLMEYİ ONAYLIYORUM/.test(detail), "detay: 'Sil' düzeltildi + ayrı Premium butonu kaldırıldı");
const list = read("app/admin/users/page.tsx");
// Arşiv sekmesi: view-seçim OLAYINDA veri yükler (effect içinde senkron setState değil).
ok(/\/api\/admin\/users\/archive/.test(list) && /ArchiveUserRow/.test(list) && /handleSelectView\("archive"\)/.test(list) && /loadArchive\(currentUserId\)/.test(list), "liste: Arşiv sekmesi (olay-güdümlü yükleme)");
ok(/action:\s*"toggle_active",\s*currentActive:\s*false/.test(list), "liste: arşivden yeniden aktifleştirme (toggle_active)");

console.log(`\n──────────\nPASS ${passed} · FAIL ${failed}`);
if (failed > 0) process.exit(1);
