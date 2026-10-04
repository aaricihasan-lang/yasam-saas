/**
 * ÜYE YÖNETİMİ 360° — SAF birim testleri (DB/ağ YOK).
 * memberListQuery (yeni filtreler), memberPricing (fiyat dönemleri), member360 (aktivite, dikkat,
 * yönetim özeti dürüstlüğü, ödeme kovaları, yönetim geçmişi güvenli metni, kullanım özeti).
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-360/unit.harness.ts
 */
import {
  DEFAULT_MEMBER_LIST_QUERY,
  MEMBER_FILTER_MODULE_KEYS,
  foldTr,
  memberListQueryToSearch,
  memberListReturnHref,
  moduleFilterDbKeys,
  parseMemberListQuery,
} from "../../lib/admin/memberListQuery";
import {
  findOverlap,
  formatPhaseRange,
  formatPrice,
  mapPricingPhaseRow,
  phaseOn,
  phaseTimingLabel,
  rangesOverlap,
  resolveCommercialTerms,
  validatePricingPhaseDraft,
  type PricingPhase,
} from "../../lib/admin/memberPricing";
import {
  AUDIT_ACTION_LABELS,
  activeCard,
  activitySummaryLabel,
  attentionReasons,
  auditTimelineText,
  dueBucket,
  dueDistanceLabel,
  idleCard,
  paymentDayIso,
  parseMemberActivity,
  parseMemberOverview,
  summarizeMemberUsage,
  type MemberActivity,
} from "../../lib/admin/member360";
import { ADMIN_AUDIT_ACTIONS } from "../../lib/admin/adminAudit";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}
const qs = (s: string) => new URLSearchParams(s);
const T = "2026-10-04";
const add = (n: number) => {
  const [y, m, d] = T.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

console.log("[1] Liste sorgu sözleşmesi");
{
  const d = parseMemberListQuery(qs(""));
  ok(d.ok && d.value.activity === "all" && d.value.module === "all" && d.value.security === "all", "varsayılanlar all");
  ok(JSON.stringify(DEFAULT_MEMBER_LIST_QUERY).includes('"activity":"all"'), "DEFAULT_MEMBER_LIST_QUERY yeni alanları içerir");
  const full = parseMemberListQuery(qs("activity=idle60&module=reflexology&security=alert&due=d31_60&sort=activity_asc&q=Alperen&page=2"));
  ok(full.ok && full.value.activity === "idle60" && full.value.module === "reflexology" && full.value.due === "d31_60" && full.value.sort === "activity_asc", "yeni değerler ayrıştırılır");
  if (full.ok) {
    const s = memberListQueryToSearch(full.value);
    const again = parseMemberListQuery(qs(s));
    ok(again.ok && JSON.stringify(again.value) === JSON.stringify(full.value), `URL gidiş-dönüş kayıpsız (${s})`);
    ok(memberListReturnHref(s).includes("activity=idle60") && memberListReturnHref(s).includes("module=reflexology"), "detaydan dönüş filtreleri korur");
  }
  for (const bad of ["activity=never", "module=digital_content", "module=video_ceviri", "module=__proto__", "security=yes", "due=d0_8", "sort=x"]) {
    ok(!parseMemberListQuery(qs(bad)).ok, `geçersiz: ${bad}`);
  }
  ok(memberListQueryToSearch(DEFAULT_MEMBER_LIST_QUERY) === "", "varsayılan → boş URL");
  for (const legacy of ["due=due30", "due=overdue", "due=no_date", "sort=next_payment_asc", "sort=next_payment_desc"]) {
    ok(parseMemberListQuery(qs(legacy)).ok, `eski M4 değeri geçerli: ${legacy}`);
  }
  ok(!MEMBER_FILTER_MODULE_KEYS.includes("digital_content" as never) && MEMBER_FILTER_MODULE_KEYS.includes("reflexology"), "modül filtresi gerçek modüller (hub hariç)");
  const rk = moduleFilterDbKeys("reflexology");
  ok(JSON.stringify(rk) === JSON.stringify(["reflexology", "refleksoloji"]), `reflexology + TR alias (${rk})`);
  ok(JSON.stringify(moduleFilterDbKeys("cupping")) === JSON.stringify(["cupping", "kupa", "hacamat_terapi"]), "cupping alias'ları");
  ok(moduleFilterDbKeys("all") === null, "all → null");
  for (const v of ["alperen", "ALPEREN", "Alperen", "aLpErEn"]) ok(foldTr(v) === "alperen", `foldTr("${v}") = alperen`);
  ok(foldTr("IŞIK") === foldTr("ışık") && foldTr("İşık") === "isik", "foldTr İ/I/ı/i");
}

console.log("\n[2] Fiyat dönemleri");
{
  const okDraft = validatePricingPhaseDraft({ startsOn: "2026-10-01", endsOn: "2027-02-28", amount: "200", billingPeriod: "monthly", label: " İlk 5 ay ", termsNote: "" });
  ok(okDraft.ok && okDraft.value.amount === 200 && okDraft.value.label === "İlk 5 ay" && okDraft.value.termsNote === null, "geçerli taslak (kırpma, boş not → null)");
  const comma = validatePricingPhaseDraft({ startsOn: "2026-10-01", amount: "1500,50", billingPeriod: "yearly" });
  ok(comma.ok && comma.value.amount === 1500.5 && comma.value.endsOn === null, "virgüllü tutar + açık uçlu");
  for (const [label, d] of [
    ["boş", null], ["dizi", []], ["bilinmeyen alan", { startsOn: "2026-10-01", amount: 1, billingPeriod: "monthly", x: 1 }],
    ["geçersiz tarih", { startsOn: "2026-02-30", amount: 1, billingPeriod: "monthly" }],
    ["bitiş < başlangıç", { startsOn: "2026-10-02", endsOn: "2026-10-01", amount: 1, billingPeriod: "monthly" }],
    ["negatif", { startsOn: "2026-10-01", amount: -1, billingPeriod: "monthly" }],
    ["3 ondalık", { startsOn: "2026-10-01", amount: "1.005", billingPeriod: "monthly" }],
    ["aşırı tutar", { startsOn: "2026-10-01", amount: 100000000, billingPeriod: "monthly" }],
    ["NaN", { startsOn: "2026-10-01", amount: "abc", billingPeriod: "monthly" }],
    ["bilinmeyen dönem", { startsOn: "2026-10-01", amount: 1, billingPeriod: "weekly" }],
    ["uzun etiket", { startsOn: "2026-10-01", amount: 1, billingPeriod: "monthly", label: "x".repeat(81) }],
    ["uzun not", { startsOn: "2026-10-01", amount: 1, billingPeriod: "monthly", termsNote: "x".repeat(501) }],
    ["kontrol karakteri", { startsOn: "2026-10-01", amount: 1, billingPeriod: "monthly", termsNote: "a\u0000b" }],
  ] as [string, unknown][]) {
    ok(!validatePricingPhaseDraft(d).ok, `reddedilir: ${label}`);
  }
  ok(rangesOverlap("2026-10-01", "2027-02-28", "2027-02-28", null), "bitiş günü dahil → çakışır");
  ok(!rangesOverlap("2026-10-01", "2027-02-28", "2027-03-01", null), "ertesi gün → çakışmaz");
  ok(rangesOverlap("2027-03-01", null, "2030-01-01", "2030-02-01"), "açık uçlu sonrasını kapsar");
  const P = (id: string, s: string, e: string | null, amount: number, per: "monthly" | "yearly" = "monthly", label: string | null = null): PricingPhase =>
    ({ id, startsOn: s, endsOn: e, amount, billingPeriod: per, label, termsNote: null, updatedAt: null });
  const phases = [P("a", "2026-10-01", "2027-02-28", 200, "monthly", "Tanışma"), P("b", "2027-03-01", null, 600)];
  ok(findOverlap(phases, { startsOn: "2027-02-15", endsOn: "2027-03-15" })?.id === "a", "findOverlap ilk çakışanı döner");
  ok(findOverlap(phases, { startsOn: "2026-10-01", endsOn: "2027-02-28" }, "a") === null, "düzenlenen dönem hariç tutulur");
  ok(phaseOn(phases, "2027-02-28")?.id === "a" && phaseOn(phases, "2027-03-01")?.id === "b" && phaseOn(phases, "2026-09-30") === null, "phaseOn sınırlar");
  const r1 = resolveCommercialTerms(phases, { agreedFee: 999, billingPeriod: "yearly" }, "2026-11-15");
  ok(r1.current.source === "phase" && r1.current.amount === 200 && r1.next?.id === "b", "mevcut = kapsayan dönem, sonraki = b");
  const r2 = resolveCommercialTerms([], { agreedFee: 1500, billingPeriod: "monthly" }, T);
  ok(r2.current.source === "legacy" && r2.current.amount === 1500 && r2.next === null, "dönem yoksa eski agreed_fee fallback (geriye uyum)");
  const r3 = resolveCommercialTerms([P("f", "2027-01-01", null, 600)], { agreedFee: 1500, billingPeriod: "monthly" }, T);
  ok(r3.current.source === "legacy" && r3.next?.id === "f", "gelecekte başlayacak dönem: bugün eski anlaşma, sonraki = gelecek dönem");
  const r4 = resolveCommercialTerms([], { agreedFee: null, billingPeriod: null }, T);
  ok(r4.current.source === "none", "hiç bilgi yok → none");
  ok(formatPrice(200, "monthly") === "200 TL / Ay" && formatPrice(5000, "yearly") === "5.000 TL / Yıl" && formatPrice(1500.5, "quarterly") === "1.500,50 TL / 3 Ay", `formatPrice (${formatPrice(1500.5, "quarterly")})`);
  ok(formatPhaseRange(phases[0]) === "01.10.2026 – 28.02.2027" && formatPhaseRange(phases[1]) === "01.03.2027 →", "formatPhaseRange");
  ok(phaseTimingLabel(phases[1], "2027-02-20") === "9 gün sonra başlıyor" && phaseTimingLabel(phases[1], "2027-04-01") === "Geçerli · açık uçlu"
    && phaseTimingLabel(phases[0], "2027-03-02") === "Sona erdi" && phaseTimingLabel(phases[0], "2027-02-28") === "Geçerli · bugün bitiyor", "phaseTimingLabel");
  ok(mapPricingPhaseRow({ id: "x", starts_on: "2026-02-30", amount: 1, billing_period: "monthly" }) === null
    && mapPricingPhaseRow({ id: "x", starts_on: "2026-02-01", amount: 1, billing_period: "weekly" }) === null
    && mapPricingPhaseRow({ id: "x", starts_on: "2026-02-01", ends_on: null, amount: "12.50", billing_period: "monthly", label: " " })?.label === null,
    "mapPricingPhaseRow geçersiz satırı eler");
}

console.log("\n[3] Aktivite + dikkat nedenleri");
const act = (o: Partial<MemberActivity>): MemberActivity => ({
  state: "d7", isDemo: false, lastActivityAt: null, daysSince: null, idleLowerBound: null, d7ActiveDays: 0, d30ActiveDays: 0, ...o,
});
{
  const a = parseMemberActivity({ activity_state: "idle30", last_activity: "2026-08-30T10:00:00Z", days_since_activity: 35, d7_active_days: 0, d30_active_days: 0 });
  ok(a.state === "idle30" && a.daysSince === 35, "parseMemberActivity");
  const legacyRow = parseMemberActivity({ id: "x" });
  ok(legacyRow.state === null && legacyRow.d7ActiveDays === null, "eski RPC satırı (alan yok) → null; kırılmaz");
  ok(parseMemberActivity({ activity_state: "hacked" }).state === null, "bilinmeyen durum yok sayılır");
  ok(activitySummaryLabel(act({ daysSince: 0 })) === "Son aktivite: bugün" && activitySummaryLabel(act({ daysSince: 1 })) === "Son aktivite: dün"
    && activitySummaryLabel(act({ daysSince: 46 })) === "Son aktivite: 46 gün önce", "aktivite metni");
  ok(activitySummaryLabel(act({ state: "unmeasured", idleLowerBound: 5 })) === "Ölçüm henüz yeterli değil", "yetersiz ölçüm metni");
  ok(activitySummaryLabel(act({ state: "idle90", idleLowerBound: 120 })).includes("en az 120 gün"), "alt sınır metni (en az)");
  const base = { role: "expert", approvalStatus: "approved", active: true, paymentStatus: "pending", securityAlerts: 0, todayIso: T };
  const r = attentionReasons({ ...base, nextPaymentDate: add(-12), activity: act({ daysSince: 46, state: "idle30" }) });
  ok(r.map((x) => x.text).join(" | ") === "Ödeme 12 gün gecikmiş | 46 gündür kullanılmıyor", `öncelik sırası (${r.map((x) => x.text).join(" | ")})`);
  const r2 = attentionReasons({ ...base, nextPaymentDate: add(3), activity: act({ daysSince: 2 }), securityAlerts: 4 });
  ok(r2[0].text === "Ödeme 3 gün içinde" && r2[1].text === "4 güvenlik uyarısı" && r2[1].tone === "rose", "yaklaşan ödeme + güvenlik");
  const r3 = attentionReasons({ ...base, paymentStatus: "exempt", nextPaymentDate: add(-50), activity: act({ daysSince: 2 }) });
  ok(r3.length === 0, "ödemeden muaf → ödeme nedeni yok");
  const r4 = attentionReasons({ ...base, nextPaymentDate: add(0), activity: act({ state: "unmeasured", idleLowerBound: 12 }) });
  ok(r4.map((x) => x.text).join() === "Ödeme bugün", "yetersiz ölçümde hareketsizlik iddiası yok");
  const r5 = attentionReasons({ ...base, approvalStatus: "pending", active: false, nextPaymentDate: null, activity: act({ state: null }) });
  ok(r5.map((x) => x.text).join() === "Onay bekliyor", "onay bekleyen");
  const r6 = attentionReasons({ ...base, role: "admin", nextPaymentDate: add(-3), activity: act({ state: null }) });
  ok(r6.length === 0, "yönetici satırında ticari/aktivite nedeni yok");
  const r7 = attentionReasons({ ...base, nextPaymentDate: add(-1), activity: act({ daysSince: null, idleLowerBound: 95, state: "idle90" }), securityAlerts: 1 });
  ok(r7.length === 2 && r7[1].text === "En az 95 gündür kullanılmıyor", "en fazla 2 neden; alt sınır 'En az'");
}

console.log("\n[4] Yönetim özeti dürüstlüğü");
{
  const none = parseMemberOverview({ denominator: 10, active7: null, active30: null, coverage7: "none", coverage30: "none", measurement: { start: null } });
  ok(activeCard(none, 7).kind === "unavailable" && idleCard(none, 30).kind === "unavailable", "ölçüm yok → kart sayı göstermez");
  ok((idleCard(none, 90) as { note: string }).note === "Kullanım ölçümü henüz başlamadı", "ölçüm yok notu");
  const part = parseMemberOverview({ denominator: 20, active7: 4, active30: 6, coverage7: "partial", coverage30: "partial", idle30: null, idle60: null, idle90: null, measurement: { start: "2026-09-30", measured_days: 5 } });
  const c7 = activeCard(part, 7);
  ok(c7.kind === "value" && c7.value === 4 && c7.ratio === "%20" && /Kısmi ölçüm: 7 günün yalnız 5 günü/.test(c7.note ?? ""), `kısmi 7g kartı (${JSON.stringify(c7)})`);
  const i90 = idleCard(part, 90);
  ok(i90.kind === "unavailable" && i90.note === "90 günlük ölçüm süresi henüz tamamlanmadı · ölçüm 5 gündür açık", `90+ kartı dürüst metin (${(i90 as { note: string }).note})`);
  const full = parseMemberOverview({ denominator: 0, active7: 0, active30: 0, coverage7: "full", coverage30: "full", idle30: 0, measurement: { start: "2026-01-01", measured_days: 277 } });
  const c0 = activeCard(full, 30);
  ok(c0.kind === "value" && c0.value === 0 && c0.ratio === null, "payda 0 → oran yok (bölme hatası yok)");
  const i30 = idleCard(full, 30);
  ok(i30.kind === "value" && i30.value === 0, "kapsam doluysa gerçek 0 gösterilir");
  const neg = parseMemberOverview({ payment_overdue: -3, payment_due7: "x" });
  ok(neg.paymentOverdue === 0 && neg.paymentDue7 === 0, "bozuk sayı → 0'a kırpılır");
}

console.log("\n[5] Ödeme kovaları");
{
  const exp: [number | null, string][] = [[-1, "overdue"], [0, "d0_7"], [7, "d0_7"], [8, "d8_30"], [30, "d8_30"], [31, "d31_60"], [60, "d31_60"], [61, "d61_90"], [90, "d61_90"], [91, "d90p"], [null, "no_date"]];
  for (const [n, b] of exp) ok(dueBucket(n === null ? null : add(n), T) === b, `+${n} → ${b}`);
  ok(dueDistanceLabel(add(0), T) === "Bugün" && dueDistanceLabel(add(12), T) === "12 gün kaldı" && dueDistanceLabel(add(-5), T) === "5 gün geçti", "mesafe metni");
  ok(dueBucket("2026-02-30", T) === "no_date", "geçersiz tarih → no_date");
  ok(paymentDayIso("2026-09-22") === "2026-09-22" && paymentDayIso("2026-09-21T21:00:00.000Z") === "2026-09-22"
    && paymentDayIso("2026-09-22T00:00:00+00:00") === "2026-09-22" && paymentDayIso("bozuk") === null && paymentDayIso(null) === null,
    "paymentDayIso: saatli değer İstanbul gününe (gün kayması yok)");
  ok(dueBucket("2026-10-03T21:00:00.000Z", T) === "d0_7", "saatli ödeme tarihi İstanbul gününe göre kovalanır (bugün)");
}

console.log("\n[6] Yönetim geçmişi güvenli metin");
{
  for (const a of ADMIN_AUDIT_ACTIONS) ok(Boolean(AUDIT_ACTION_LABELS[a]), `etiket var: ${a}`);
  const ml = (k: string) => (k === "reflexology" ? "Refleksoloji" : null);
  ok(auditTimelineText({ action: "pricing_phase_changed", context: { op: "updated", fields: ["amount", "terms_note"], amount: 600, note: "gizli" } }, ml)
    === "Ticari fiyat dönemi güncellendi (tutar, not)", "fiyat dönemi: yalnız alan adları (değer yok)");
  ok(auditTimelineText({ action: "pricing_phase_changed", context: { op: "created" } }, ml) === "Ticari fiyat dönemi eklendi", "fiyat dönemi eklendi");
  ok(auditTimelineText({ action: "payment_status_changed", context: { fields: ["paid_amount", "payment_note"], paid_amount: 1500 } }, ml)
    === "Ödeme kaydı güncellendi (tutar, not)", "ödeme: alan adları");
  ok(auditTimelineText({ action: "module_enabled", context: { modules: ["reflexology", "evil<script>"] } }, ml) === "Modül erişimi açıldı: Refleksoloji", "modül: yalnız bilinen anahtar etiketlenir");
  const leak = auditTimelineText({ action: "user_profile_updated", context: { email: "a@b.c", full_name: "X" } }, ml);
  ok(leak === "Profil bilgileri güncellendi", "profil: e-posta/ad gösterilmez");
  ok(auditTimelineText({ action: "unknown_future_action" }, ml) === "Yönetim işlemi", "bilinmeyen action → genel metin");
}

console.log("\n[7] Kullanım özeti (Usage360 detay → üye detayı)");
{
  const s = summarizeMemberUsage({
    today: T, measurementStart: add(-9), account: { lastActivityAt: `${add(-2)}T10:00:00Z` },
    totals: { visits: 9, activeSeconds: 3600, actions: 4 },
    daily: [{ day: add(0) }, { day: add(-2) }, { day: add(-6) }, { day: add(-7) }, { day: add(-9) }],
    modules: [
      { module: "stones", label: "Doğaltaş", allowed: true, status: "actioned", actions: 3 },
      { module: "clients", label: "Danışan", allowed: true, status: "opened_only", actions: 0 },
      { module: "reflexology", label: "Refleksoloji", allowed: true, status: "never_opened", actions: 0 },
      { module: "numerology", label: "Numeroloji", allowed: false, status: "not_measured", actions: 0 },
    ],
    channels: [{ channel: "desktop_web", visits: 6 }, { channel: "android_app", visits: 3 }, { channel: "mobile_web", visits: 0 }],
  });
  ok(s.measuredDaysIn30 === 10 && s.coverage30 === "partial" && s.coverage7 === "full", `kapsam: 30g kısmi (10 gün), 7g tam (${s.measuredDaysIn30}/${s.coverage30}/${s.coverage7})`);
  ok(s.d7ActiveDays === 3 && s.d30ActiveDays === 5, `aktif gün 7g=3 (6 gün önce dahil, 7 hariç), 30g=5 (${s.d7ActiveDays}/${s.d30ActiveDays})`);
  ok(s.modulesUsed.map((m) => m.key).join() === "stones,clients" && s.allowedNeverOpened === 1, "kullanılan modüller + hiç açılmamış izinli");
  ok(s.channels.length === 2 && s.channels[0].pct === 67 && s.channels[1].pct === 33, "kanal payları (0 ziyaret hariç)");
  const none = summarizeMemberUsage({ today: T, measurementStart: null, account: { lastActivityAt: null }, totals: { visits: 0, activeSeconds: 0, actions: 0 }, daily: [], modules: [], channels: [] });
  ok(none.measuredDaysIn30 === null && none.coverage7 === "none", "ölçüm yok → kapsam none");
}

console.log(`\nÜYE YÖNETİMİ 360 · UNIT: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.error("Başarısız:\n - " + failures.join("\n - "));
  process.exit(1);
}
