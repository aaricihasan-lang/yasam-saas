/**
 * NUMEROLOJİ — "Gelecek Yılları Göster" alt-yetkisi (module_permissions.numerology_future_years).
 *
 * Kapsam (owner talimatı §6): KAPALI → önceki davranış BİREBİR; AÇIK → motorun zaten hesapladığı
 * tüm dönemler (yöntemin doğal bitişi; yeni formül yok); uzman bazında yetki; admin aç/kapa;
 * uzman kendi yetkisini değiştiremez; yetkisiz API; eski kayıtlar; güncel yılı kapsayan dönem;
 * geçmiş yıllar değişmez; Word tutarlılığı; performans; tenant; önbellek/hazır rapor.
 * Testler canlı saate bağlı DEĞİL: referans yıl enjekte edilir.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-faz6/future-years-harness.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hesaplaNumeroloji, calcDegisimByYearOnly, calcHarflerinYankilanisi } from "@/lib/numeroloji";
import {
  CHRONO_CUTOFF_NOTE,
  CHRONO_FULL_NOTE,
  CHRONO_NO_LIMIT_YEAR,
  chronoLimitYear,
  chronoNoteText,
  cutoffHarfSegments,
  cutoffMucadele,
  cutoffDegisimYearOnly,
  cutoffDegisimFullDate,
  zirveYasGorunumu,
  dogumYilindanOut,
} from "@/app/numeroloji/utils/chronoCutoff";
import {
  buildPlainAnalizFull,
  degisimBoundedText,
  zirveBoundedText,
  mucadeleBoundedText,
  harfBoundedText,
} from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { canSeeNumerologyFutureYears, NUMEROLOGY_FUTURE_YEARS_KEY } from "@/app/numeroloji/utils/futureYearsAccess";
import {
  ADMIN_MODULE_KIND,
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  DEFAULT_ADMIN_MODULE_PERMISSIONS,
  enabledAccessModules,
  mergeAdminModulePermissions,
  parseAdminModulePermissions,
  validateApprovalModules,
  validateModuleChanges,
} from "@/lib/admin/userManagement";
import { MEMBER_FILTER_MODULE_KEYS } from "@/lib/admin/memberListQuery";
import {
  DEFAULT_MODULE_PERMISSIONS,
  MODULE_PERMISSION_KEYS,
  buildPremiumModulePermissionsPayload,
} from "@/lib/auth/modulePermissions";
import { buildNumerolojiWordChildren } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
}
function eq<T>(a: T, e: T, label: string) {
  const sa = JSON.stringify(a), se = JSON.stringify(e);
  ok(sa === se, label, sa === se ? undefined : `beklenen ${se}, gelen ${sa}`);
}
const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

const CY = 2026;
const OFF = chronoLimitYear(CY, false);
const ON = chronoLimitYear(CY, true);

// ── 1) Sınır yılı + not: KAPALI = önceki davranış ───────────────────────────────
eq(OFF, CY, "L1 KAPALI sınır yılı = currentYear (önceki davranış)");
eq(ON, CHRONO_NO_LIMIT_YEAR, "L2 AÇIK sınır yılı = sonlu üst değer (9999; sonsuz değil)");
ok(Number.isFinite(ON), "L3 AÇIK sınır sonlu sayı");
eq(chronoNoteText(false), CHRONO_CUTOFF_NOTE, "L4 KAPALI not = önceki not birebir");
eq(chronoNoteText(true), CHRONO_FULL_NOTE, "L5 AÇIK not = gelecek dönemler dâhil notu");
ok(!/\d{4}/.test(CHRONO_FULL_NOTE), "L6 AÇIK not yıl numarası içermez");
eq(chronoLimitYear(CY, "true" as unknown as boolean), CY, "L7 truthy-string yetki AÇMAZ (yalnız boolean true)");

// ── OWNER UAT KAYDI: Hasan Ali ARICI YILMAZ DEMİR, 14.02.1987 ───────────────────
const FN = "Hasan Ali", LN = "ARICI YILMAZ DEMİR", BD = "14.02.1987";
const OUT = hesaplaNumeroloji({ firstName: FN, lastName: LN, birthDate: BD });
const BY = dogumYilindanOut(OUT);
eq(BY, 1987, "C0 doğum yılı 1987");

// ── 2) KAPALI: önceki davranış birebir (varsayılan imza = KAPALI çağrısı) ───────
eq(buildPlainAnalizFull(OUT, CY), buildPlainAnalizFull(OUT, OFF, chronoNoteText(false)), "K1 düz metin KAPALI = önceki çağrı birebir");
eq(degisimBoundedText(OUT, OFF), degisimBoundedText(OUT, CY), "K2 Değişim KAPALI değişmedi");
eq(zirveBoundedText(OUT, OFF), zirveBoundedText(OUT, CY), "K3 Zirve KAPALI değişmedi");
eq(mucadeleBoundedText(OUT, OFF), mucadeleBoundedText(OUT, CY), "K4 Mücadele KAPALI değişmedi");
eq(harfBoundedText(OUT, OFF), harfBoundedText(OUT, CY), "K5 Harf KAPALI değişmedi");

// ── 3) AÇIK: motorun hesapladığı TÜM dönemler; yeni formül/ek adım yok ───────────
const degAll = calcDegisimByYearOnly(1987, 2, 5);
const degOff = cutoffDegisimYearOnly(BD, OFF, 5);
const degOn = cutoffDegisimYearOnly(BD, ON, 5);
eq(degOn.map((r) => r.changeYear), degAll.map((r) => r.changeYear), "A1 Değişim AÇIK = motorun 5 adımı (2012·2017·2027·2038·2051)");
eq(degAll.map((r) => r.changeYear), [2012, 2017, 2027, 2038, 2051], "A2 Değişim kanonik yıllar değişmedi");
eq(degOff.map((r) => r.changeYear), [2012, 2017, 2027], "A3 Değişim KAPALI: 2026'da başlayan 2027 görünür, 2038/2051 gizli");
eq(cutoffDegisimFullDate(BD, ON, 5).length, 5, "A4 Değişim (gün+ay) AÇIK 5 adım — ek adım üretilmez");
ok(degOn.every((r) => r.effectEndYearDisplay === r.effectEndYear), "A5 Değişim aralıkları kırpılmaz");
ok(degisimBoundedText(OUT, ON).includes("2038") && !degisimBoundedText(OUT, OFF).includes("2038"), "A6 Değişim metni: 2038 yalnız AÇIK'ta");

const harfFull = calcHarflerinYankilanisi(FN, LN, BD);
const harfOn = cutoffHarfSegments(harfFull, ON);
const harfOff = cutoffHarfSegments(harfFull, OFF);
eq(harfOn.length, harfFull.length, "A7 Harf AÇIK = motorun tüm segmentleri (80 yaş doğal sınırı)");
ok(harfOn.every((s) => s.ageEnd <= 80), "A8 Harf: 80 yaş sınırı korunur (sonsuz döngü yok)");
ok(harfOff.length < harfOn.length, "A9 Harf KAPALI'da gelecekte başlayan segmentler gizli", `${harfOff.length}/${harfOn.length}`);
ok(harfOff.every((s) => (s.yearStart ?? 0) <= CY) && harfOn.some((s) => (s.yearStart ?? 0) > CY), "A10 Harf: >currentYear başlangıç yalnız AÇIK'ta");

const zOn = zirveYasGorunumu(OUT.zirveYillari?.peaks, BY, ON);
const zOff = zirveYasGorunumu(OUT.zirveYillari?.peaks, BY, OFF);
const peaks = OUT.zirveYillari?.peaks ?? [];
ok(zOn?.format === "iki-metot" && zOn.metot1.length === peaks.length && zOn.metot2.length === peaks.length, "A11 Zirve AÇIK: iki metot da 4 zirvenin tamamı");
ok(zOff?.format === "iki-metot" && (zOff.metot1.length + zOff.metot2.length) <= (zOn?.format === "iki-metot" ? zOn.metot1.length + zOn.metot2.length : 0), "A12 Zirve KAPALI ⊆ AÇIK");
ok(peaks.length === 4, "A13 Zirve sayısı 4 (yöntem sınırı)");

const mOn = cutoffMucadele(OUT.mucadeleYillari, BY, ON);
const mOff = cutoffMucadele(OUT.mucadeleYillari, BY, OFF);
ok(mOn?.format === "kitap2" && mOn.ana !== null, "A14 Mücadele AÇIK: ana mücadele dahil tüm dönemler");
ok(mOff?.format === "kitap2" && mOn?.format === "kitap2" && mOff.periods.length <= mOn.periods.length, "A15 Mücadele KAPALI ⊆ AÇIK");

// ── 8/9) Güncel yılı kapsayan dönem kesilmez; geçmiş yıllar değişmez ─────────────
{
  const active = harfFull.find((s) => (s.yearStart ?? 0) <= CY && CY <= (s.yearEnd ?? 0));
  ok(!!active, "G1 2026'yı kapsayan aktif harf segmenti var");
  const inOff = harfOff.find((s) => s.yearStart === active?.yearStart);
  const inOn = harfOn.find((s) => s.yearStart === active?.yearStart);
  eq([inOff?.yearStart, inOff?.yearEnd], [active?.yearStart, active?.yearEnd], "G2 KAPALI: aktif dönem TAM aralık (kırpılmaz)");
  eq([inOn?.yearStart, inOn?.yearEnd], [active?.yearStart, active?.yearEnd], "G3 AÇIK: aktif dönem TAM aralık");
  eq(harfOn.slice(0, harfOff.length), harfOff, "G4 Harf: geçmiş+aktif dönemler iki modda AYNI (önek)");
  eq(degOn.slice(0, degOff.length), degOff, "G5 Değişim: geçmiş+aktif dönemler iki modda AYNI");
  if (zOn?.format === "iki-metot" && zOff?.format === "iki-metot") {
    eq(zOn.metot1.slice(0, zOff.metot1.length), zOff.metot1, "G6 Zirve Metot1: geçmiş değerler aynı");
    eq(zOn.metot2.slice(0, zOff.metot2.length), zOff.metot2, "G7 Zirve Metot2: geçmiş değerler aynı");
  }
  // Farklı yıllarda (2030/2050/2100) KAPALI hâlâ o yıla sınırlı; AÇIK sabit tam set.
  for (const y of [2030, 2050, 2100]) {
    ok(cutoffHarfSegments(harfFull, chronoLimitYear(y, false)).every((s) => (s.yearStart ?? 0) <= y), `G8 KAPALI ${y}: sınır o yıl`);
    eq(cutoffHarfSegments(harfFull, chronoLimitYear(y, true)).length, harfFull.length, `G9 AÇIK ${y}: tam set`);
  }
}

// ── Motor/canonical değişmedi (mutasyon yok) ─────────────────────────────────────
{
  const before = JSON.stringify(OUT);
  cutoffHarfSegments(OUT.harflerinYankilanisi as never, ON);
  buildPlainAnalizFull(OUT, ON, CHRONO_FULL_NOTE);
  eq(JSON.stringify(OUT), before, "M1 motor çıktısı mutasyona uğramaz");
  const again = hesaplaNumeroloji({ firstName: FN, lastName: LN, birthDate: BD });
  eq(JSON.stringify(again), before, "M2 motor deterministik / değişmedi");
}

// ── 3) Uzman bazında yetki kararı (sunucu tek kaynak) ────────────────────────────
const prof = (role: string, perms: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({ role, module_permissions: perms, ...extra });
ok(canSeeNumerologyFutureYears(prof("expert", { numerology: true, numerology_future_years: true })), "P1 uzman A: numerology + yetki → AÇIK");
ok(!canSeeNumerologyFutureYears(prof("expert", { numerology: true })), "P2 uzman B: yalnız numerology → KAPALI (varsayılan)");
ok(!canSeeNumerologyFutureYears(prof("expert", { numerology: true, numerology_future_years: false })), "P3 açıkça false → KAPALI");
ok(!canSeeNumerologyFutureYears(prof("expert", { numerology_future_years: true })), "P4 numerology modülü kapalı → alt-yetki erişim SAĞLAMAZ");
ok(!canSeeNumerologyFutureYears(prof("expert", { numerology: false, numerology_future_years: true })), "P5 numerology=false + yetki → KAPALI");
ok(canSeeNumerologyFutureYears(prof("expert", { numeroloji: true, numerology_future_years: true })), "P6 TR alias (numeroloji) + yetki → AÇIK (sunucu kapısıyla aynı)");
ok(!canSeeNumerologyFutureYears(prof("expert", { numerology: true, numerology_future_years: "true" })), "P7 string \"true\" kabul EDİLMEZ");
ok(!canSeeNumerologyFutureYears(prof("expert", { numerology: true, numerology_future_years: 1 })), "P8 sayı 1 kabul EDİLMEZ");
ok(!canSeeNumerologyFutureYears(null), "P9 profil yok → KAPALI");
ok(!canSeeNumerologyFutureYears(prof("expert", null)), "P10 izin haritası yok → KAPALI");
ok(canSeeNumerologyFutureYears(prof("admin", {})), "P11 admin her zaman (hd_system_reading ile aynı model)");
{
  // İki uzman aynı tenant'ta: birinde açık, diğerinde kapalı (bağımsız).
  const a = prof("expert", { numerology: true, numerology_future_years: true }, { tenant_id: "t1" });
  const b = prof("expert", { numerology: true }, { tenant_id: "t1" });
  ok(canSeeNumerologyFutureYears(a) && !canSeeNumerologyFutureYears(b), "P12 bir uzmana açık, diğerinde kapalı");
}
eq(NUMEROLOGY_FUTURE_YEARS_KEY, "numerology_future_years", "P13 anahtar adı");

// ── 4) Admin yönetimi (mevcut Modül Yetkileri yapısı) ────────────────────────────
ok(ADMIN_MODULE_UI_KEYS.indexOf("numerology_future_years") === ADMIN_MODULE_UI_KEYS.indexOf("numerology") + 1, "Y1 admin listesinde Numeroloji'nin hemen altında");
eq(ADMIN_MODULE_KIND.numerology_future_years, "capability", "Y2 tür = capability (modül değil)");
eq(ADMIN_MODULE_UI_LABELS.numerology_future_years, "Numeroloji — Gelecek Yılları Göster", "Y3 etiket");
ok(DEFAULT_ADMIN_MODULE_PERMISSIONS.numerology_future_years === false && DEFAULT_MODULE_PERMISSIONS.numerology_future_years === false, "Y4 varsayılan KAPALI");
ok(!("numerology_future_years" in buildPremiumModulePermissionsPayload()), "Y5 Premium payload'ında YOK (otomatik açılmaz)");
ok(MODULE_PERMISSION_KEYS.includes("numerology_future_years"), "Y6 kullanıcı izin anahtarları arasında");
ok(validateModuleChanges({ numerology_future_years: true }).ok && validateModuleChanges({ numerology_future_years: false }).ok, "Y7 admin aç/kapa değişikliği geçerli");
ok(!validateModuleChanges({ numerology_future_years: "true" }).ok, "Y8 non-boolean değişiklik reddedilir");
ok(!validateApprovalModules(["numerology_future_years"]).ok, "Y9 onayda tek başına alt-yetki 'en az bir modül' sayılmaz");
{
  const appr = validateApprovalModules(["numerology"]);
  ok(appr.ok && appr.fullMap.numerology_future_years === false, "Y10 onay: seçilmezse KAPALI");
}
{
  const perms = parseAdminModulePermissions({ numerology: true, numerology_future_years: true });
  ok(perms.numerology_future_years === true && !enabledAccessModules(perms).includes("numerology_future_years"), "Y11 açık modül sayısına alt-yetki girmez");
}
ok(!MEMBER_FILTER_MODULE_KEYS.includes("numerology_future_years"), "Y12 üye listesi modül filtresinde alt-yetki yok");
{
  const merged = mergeAdminModulePermissions({ numerology: true, numerology_future_years: true, yasam_hafizasi: true }, { numerology: true, numerology_future_years: false });
  ok(merged.numerology_future_years === false && merged.yasam_hafizasi === true, "Y13 güvenli birleştirme: yönetilen anahtar güncellenir, yabancı korunur");
}
{
  const sql = src("supabase/migrations/20270129235900_admin_member_phase1_hardening.sql");
  ok(/e\.key !~ '\^\[a-z\]\[a-z0-9_\]\{0,39\}\$'/.test(sql) && /^[a-z][a-z0-9_]{0,39}$/.test("numerology_future_years"), "Y14 mevcut SQL doğrulayıcı anahtarı kabul eder → migration GEREKMEZ");
  ok(/lower\(coalesce\(v_actor\.role,''\)\) <> 'admin'/.test(sql) && /hedef uzman degil/.test(sql), "Y15 RPC: aktör admin+aktif, hedef yalnız uzman (DB ikinci savunma)");
  ok(/'module_enabled'/.test(sql) && /'module_disabled'/.test(sql), "Y16 aç/kapa admin_audit_log'a yazılır (module_enabled/disabled)");
}

// ── 5) Uzman kendi yetkisini değiştiremez ────────────────────────────────────────
{
  const r = src("app/api/admin/users/[id]/route.ts");
  const iGuard = r.indexOf("const guard = await verifyAdminRequest(req);");
  const iModules = r.indexOf('if (body.action === "modules") return patchModules(');
  ok(iGuard > 0 && iModules > iGuard, "S1 modül PATCH yalnız verifyAdminRequest SONRASI (uzman erişemez)");
  ok(/rpc\("admin_set_module_permissions"/.test(r), "S2 değişiklik atomik admin RPC üzerinden");
}

// ── 6) Yetkisiz doğrudan API erişimi ────────────────────────────────────────────
{
  const ent = src("app/api/numeroloji/entitlements/route.ts");
  const iG = ent.indexOf('requireModuleAccess(req, "numerology")');
  const iC = ent.indexOf("canSeeNumerologyFutureYears(guard.profile)");
  ok(iG > 0 && iC > iG, "U1 entitlements: oturum + numerology modül kapısı ÖNCE, karar doğrulanmış profilden");
  ok(/no-store/.test(ent), "U2 entitlements yanıtı no-store");
  ok(!/req\.json\(|searchParams/.test(ent), "U3 entitlements istemci girdisi OKUMAZ");
  const w = src("app/api/numeroloji/word-report/route.ts");
  const iWG = w.indexOf('requireModuleAccess(req, "numerology")');
  const iWF = w.indexOf("canSeeNumerologyFutureYears(guard.profile)");
  ok(iWG > 0 && iWF > iWG, "U4 Word: yetki SUNUCUDA doğrulanmış profilden");
  ok(!/futureYears\s*[,}]?\s*=?\s*[^;]*body/.test(w.split("\n").filter((l) => /futureYears/.test(l)).join("\n")) && !/futureYears.*as \{/.test(w), "U5 Word: body'den futureYears OKUNMAZ");
  ok(/buildNumerolojiWordChildren\(rows, sections, shared, stockIndex, refCalendar, new Date\(\), futureYears\)/.test(w), "U6 Word builder'a sunucu kararı geçirilir");
  const hook = src("app/numeroloji/hooks/useNumerolojiFutureYears.ts");
  ok(/\/api\/numeroloji\/entitlements/.test(hook) && !/module_permissions/.test(hook), "U7 istemci kararı localStorage izin haritasından DEĞİL, sunucudan");
  ok(/getServerSnapshot = \(\) => false/.test(hook) && /value: false/.test(hook), "U8 istemci fail-closed (yanıt yok/hata → KAPALI)");
  ok(/uid !== state\.userId/.test(hook), "U9 kullanıcı değişince önceki yetki taşınmaz");
}

// ── 10) Word/rapor tutarlılığı (gerçek builder) ──────────────────────────────────
function wordText(futureYears: boolean | undefined): string {
  const row = { id: "r1", name: FN, surname: LN, birth_date: BD, created_at: "2026-01-01T10:00:00Z", analysis_data: { version: 1, motor: OUT, summary: "X" } };
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  const sections = { summary: false, plain: true, detailed: false, tas: false, zamanlama: false } as never;
  const now = new Date("2026-06-01T09:00:00+03:00");
  const res = futureYears === undefined
    ? buildNumerolojiWordChildren([row] as never, sections, shared as never, new Map(), null, now)
    : buildNumerolojiWordChildren([row] as never, sections, shared as never, new Map(), null, now, futureYears);
  return JSON.stringify(res.children);
}
{
  const wDefault = wordText(undefined);
  const wOff = wordText(false);
  const wOn = wordText(true);
  eq(wOff, wDefault, "W1 Word KAPALI = önceki (varsayılan) çıktı birebir");
  ok(!wOff.includes("2038") && wOn.includes("2038"), "W2 Word: 2038 Değişim yalnız AÇIK'ta");
  ok(wOff.includes(CHRONO_CUTOFF_NOTE.slice(0, 40)) && !wOff.includes(CHRONO_FULL_NOTE.slice(0, 40)), "W3 Word KAPALI notu önceki not");
  ok(wOn.includes(CHRONO_FULL_NOTE.slice(0, 40)), "W4 Word AÇIK notu 'gelecek dönemler dâhil'");
  ok(wordText("true" as unknown as boolean) === wOff, "W5 Word: truthy-string AÇMAZ");
}

// ── 7) Eski kayıtlar (Model C) ───────────────────────────────────────────────────
{
  const old = JSON.parse(JSON.stringify(OUT));
  for (const p of old.zirveYillari?.peaks ?? []) { delete p.yasMetot1; delete p.yasMetot2; }
  const zOld = zirveYasGorunumu(old.zirveYillari?.peaks, BY, OFF);
  const zOldOn = zirveYasGorunumu(old.zirveYillari?.peaks, BY, ON);
  ok(zOld?.format === "kayitli" && zOldOn?.format === "kayitli", "E1 eski snapshot (tek yaş listesi) iki modda da 'kayitli' biçimi");
  ok(zOldOn?.format === "kayitli" && zOldOn.peaks.length === old.zirveYillari.peaks.length, "E2 eski snapshot AÇIK: tüm kayıtlı zirveler");
  ok(zOld?.format === "kayitli" && zOld.peaks.every((p) => (BY ?? 0) + p.age <= CY), "E3 eski snapshot KAPALI: önceki kural");
  const stored = JSON.stringify(old);
  zirveYasGorunumu(old.zirveYillari?.peaks, BY, ON);
  eq(JSON.stringify(old), stored, "E4 kayıtlı snapshot mutasyona uğramaz (yetki değişimi kayıt silmez/değiştirmez)");
}

// ── 11) Performans: uzun aralık sistemi yavaşlatmaz ──────────────────────────────
{
  const t0 = Date.now();
  for (let i = 0; i < 2000; i += 1) {
    cutoffHarfSegments(harfFull, ON);
    cutoffDegisimYearOnly(BD, ON, 5);
    zirveYasGorunumu(OUT.zirveYillari?.peaks, BY, ON);
    cutoffMucadele(OUT.mucadeleYillari, BY, ON);
  }
  const ms = Date.now() - t0;
  ok(ms < 3000, "PERF1 2000 kayıt × 4 bölüm AÇIK < 3 sn", `${ms} ms`);
  ok(harfOn.length <= 80 && degOn.length === 5, "PERF2 çıktı boyutu yöntem sınırında (harf ≤ 80, değişim 5)");
}

// ── 14/15) Tenant + önbellek / hazır rapor ───────────────────────────────────────
{
  const w = src("app/api/numeroloji/word-report/route.ts");
  ok(/\.from\("numerology_records"\)\.select\("\*", \{ count: "exact" \}\)\.eq\("tenant_id", tenantId\)/.test(w), "T1 Word kayıtları oturum tenant'ıyla sınırlı (değişmedi)");
  ok(/"Cache-Control": "no-store"/.test(w), "T2 Word yanıtı no-store");
  ok(!/storage\.from|\.upload\(/.test(w), "T3 Word saklanmaz → yetki kapatıldıktan sonra hazır rapor üzerinden aşım yok");
}

console.log(`\nfuture-years harness: ${pass} PASS / ${fail} FAIL`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
