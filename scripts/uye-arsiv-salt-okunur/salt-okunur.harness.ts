/**
 * ADMIN · ÜYE DETAYI — ARŞİVDEKİ HESAP SALT-OKUNUR GÖRÜNÜM harness'ı (tsx; DB / ağ YOK).
 * Sunucu kuralları (Aşama 4a: users / trial_profiles / fiyat dönemi / ödeme tetikleyicileri + route 409) DEĞİŞMEDİ;
 * bu harness yalnız arayüzün aynı kuralı göstermesini doğrular:
 *   B  bileşenler (gerçek React SSR): deneme kredisi / deneme durumu / ticari anlaşma — kilitli ↔ kilitsiz
 *      (kilitsiz hâl önceki davranışla birebir: aynı düğmeler, girişler etkin)
 *   S  Üye Detayı kaynağı: modül anahtarları, Atlas teknikleri, HD eğitim anahtarı, ödeme formu, ticari panel,
 *      lisans formu, rol seçimi, Pro geçişi arşivde kapalı; arşivden çıkarma yolu ve okuma alanları duruyor
 *
 * Çalıştır: npx tsx scripts/uye-arsiv-salt-okunur/salt-okunur.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialCreditPanel, TrialStatePanel } from "@/components/admin/members/detail/TrialManagementPanel";
import { MemberCommercialPanel } from "@/components/admin/members/MemberCommercialPanel";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

type Phase = "not_started" | "active" | "expired" | "review" | "suspended" | "converted";
const row = (phase: Phase, pro = true) => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  phase,
  daily_limit: 50,
  module_limits: { astrology: 20 },
  used_total: 3,
  used_by_module: { astrology: 2, numerology: 1 },
  pro_request_at: pro ? "2026-11-14T10:00:00Z" : null,
  review_reason: null,
});
const mgmt = (phase: Phase, locked: boolean) =>
  ({ state: { kind: "ready", row: row(phase) }, busy: false, act: async () => true, locked }) as unknown as Parameters<typeof TrialCreditPanel>[0]["mgmt"];
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const STATE_BTNS = ["İncelemeye al", "İncelemeyi kaldır", "Deneme erişimini durdur", "Erişimi sürdür"];

function sectionB(): void {
  console.log("\n[B] Bileşenler (React SSR)");
  const credOpen = html(createElement(TrialCreditPanel, { mgmt: mgmt("active", false) }));
  const credLocked = html(createElement(TrialCreditPanel, { mgmt: mgmt("active", true) }));
  ok(count(credOpen, /<input[^>]*>/g) === 4 && count(credOpen, /<input[^>]*disabled=""/g) === 0 && credOpen.includes("Limitleri kaydet"),
    "kilitsiz deneme kredisi: 4 giriş etkin + \"Limitleri kaydet\" (önceki davranış)");
  ok(count(credLocked, /<input[^>]*disabled=""/g) === 4 && !credLocked.includes("Limitleri kaydet") && credLocked.includes("data-trial-credit-locked"),
    "arşiv: 4 kredi girişi kilitli, \"Limitleri kaydet\" yok, salt-okunur notu var");
  ok(credLocked.includes("3 / 50") && credLocked.includes('value="50"') && credLocked.includes('value="20"'), "arşiv: kullanım ve mevcut limitler okunur");

  for (const phase of ["active", "not_started", "review", "suspended"] as Phase[]) {
    const open = html(createElement(TrialStatePanel, { mgmt: mgmt(phase, false) }));
    const locked = html(createElement(TrialStatePanel, { mgmt: mgmt(phase, true) }));
    const openBtns = STATE_BTNS.filter((b) => open.includes(`>${b}<`));
    const want: Record<string, string[]> = {
      active: ["İncelemeye al", "Deneme erişimini durdur"],
      not_started: ["İncelemeye al", "Deneme erişimini durdur"],
      review: ["İncelemeyi kaldır", "Deneme erişimini durdur"],
      suspended: ["Erişimi sürdür"],
    };
    ok(JSON.stringify(openBtns) === JSON.stringify(want[phase]), `kilitsiz deneme durumu (${phase}): işlem düğmeleri aynen (${openBtns.join(" · ")})`, openBtns);
    ok(STATE_BTNS.every((b) => !locked.includes(`>${b}<`)) && locked.includes("data-trial-state-locked"),
      `arşiv (${phase}): inceleme / durdurma / sürdürme düğmeleri yok, salt-okunur notu var`);
    ok(open.includes(">Pro talebini kapat<") && locked.includes(">Pro talebini kapat<"),
      `${phase}: "Pro talebini kapat" iki hâlde de var (sunucu arşivde izin verir, hak açmaz)`);
    ok(locked.includes(`data-trial-state="${phase}"`), `arşiv (${phase}): deneme durumu okunur`);
  }

  const props = { userId: "u1", adminId: "a1", legacyFee: 600, legacyPeriod: "monthly" as const, nextPaymentAt: null, paymentExempt: false, onPhasesChange: () => undefined, onNotify: () => undefined };
  const comOpen = html(createElement(MemberCommercialPanel, props));
  const comLocked = html(createElement(MemberCommercialPanel, { ...props, readOnly: true }));
  ok(comOpen.includes("Fiyat dönemi ekle") && !comOpen.includes("Hesap arşivde: fiyat dönemi eklenemez"), "kilitsiz ticari panel: \"Fiyat dönemi ekle\" açıklamasız (önceki davranış)");
  ok(/<button[^>]*disabled=""[^>]*title="Hesap arşivde: fiyat dönemi eklenemez/.test(comLocked), "arşiv: \"Fiyat dönemi ekle\" kapalı ve nedeni yazılı");
}

function sectionS(): void {
  console.log("\n[S] Üye Detayı kaynağı");
  const src = readFileSync(path.join(process.cwd(), "app", "admin", "users", "[id]", "page.tsx"), "utf8");
  const com = readFileSync(path.join(process.cwd(), "components", "admin", "members", "MemberCommercialPanel.tsx"), "utf8");
  const edu = readFileSync(path.join(process.cwd(), "components", "admin", "members", "HdEducationAccessSwitch.tsx"), "utf8");
  ok(/const isArchived = archiveInfo\.archivedAt !== null;/.test(src), "arşiv durumu tek kaynaktan (archived_at)");
  ok(/pendingKeys=\{modulePendingKeys\}\s*disabled=\{!canPersistModulePermissions \|\| isArchived\}/.test(src), "modül anahtarları arşivde kapalı");
  ok(/\$\{busy \|\| disabled \? "opacity-60" : ""\}/.test(src), "kapalı modül anahtarı görsel olarak da soluk (etkin görünmez)");
  ok(/openForEnableSignal=\{astroTechOpenSignal\}\s*disabled=\{!canPersistModulePermissions \|\| isArchived\}/.test(src), "Atlas teknik izinleri arşivde kapalı");
  ok(/!canPersistModulePermissions \|\| isArchived\) return;/.test(src), "modül kaydı arşivde istek göndermez (savunma)");
  ok(/locked=\{isArchived\}\s*\/>/.test(src) && /const disabled = busy \|\| locked \|\|/.test(edu), "HD eğitim anahtarı arşivde kilitli");
  ok(/locked: isArchived,/.test(src), "deneme yönetimi (kredi + durum) arşivde kilitli");
  ok(/readOnly=\{isArchived\}/.test(src) && /disabled=\{readOnly \|\| saving \|\| formOpen\}/.test(com) && (com.match(/disabled=\{readOnly \|\|/g) ?? []).length === 3,
    "fiyat dönemi ekle / düzenle / sil arşivde kapalı");
  ok(/<fieldset\s+disabled=\{isArchived\}\s+aria-disabled=\{isArchived\}\s+data-payment-form/.test(src), "ödeme formu (alanlar + \"Tahsilat geldi\") arşivde kilitli");
  ok(/disabled=\{savingPayment \|\| !canPersistPayment \|\| isArchived\}/.test(src) && /if \(!user \|\| !paymentDraft \|\| isArchived\) return;/.test(src), "\"Ödemeyi Kaydet\" arşivde kapalı + savunma");
  ok(/onClick=\{\(\) => setShowPaymentHistory\(\(open\) => !open\)\}/.test(src) && !/setShowPaymentHistory[^\n]*isArchived/.test(src), "ödeme geçmişi arşivde de okunur");
  ok(/disabled=\{!viewerIsMainAdmin \|\| isArchived\}/.test(src) && /viewerIsMainAdmin && !isArchived \? \(\(\) => \{/.test(src), "lisans / oturum / güvenlik istisnası formu arşivde kilitli, kaydet bloğu yok");
  ok(/disabled=\{isArchived\}\s*aria-describedby=\{isArchived \? "edit-role-hint"/.test(src), "rol seçimi arşivde kapalı (ad / e-posta sunucuda serbest)");
  ok(/disabled=\{actionUserId === user\.id \|\| legacyBlocked \|\| !user\.active \|\| isArchived\}/.test(src), "Pro üyeliğe geçiş düğmesi arşivde kapalı");
  ok(/data-unarchive-open/.test(src) && /disabled=\{!viewerIsMainAdmin\}/.test(src) && /executeUnarchive/.test(src), "arşivden çıkarma yolu (ana yönetici) korunur");
  ok((src.match(/<ArchivedReadOnlyNote what=/g) ?? []).length === 3, "salt-okunur notu: modül izinleri · ödeme · lisans");
}

sectionB();
sectionS();
console.log(`\nARŞİV SALT-OKUNUR: PASS ${pass} · FAIL ${fail}`);
if (fail) {
  console.log("Başarısız:", failures);
  process.exit(1);
}
