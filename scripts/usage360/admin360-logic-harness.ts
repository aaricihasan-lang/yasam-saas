/**
 * USAGE360 AŞAMA 2C — Admin 360 saf mantık harness'i (DB/ağ/prod temas YOK).
 * Kapsam: TR takvim günü dönemleri (bugün/dün/7/30/90/özel, gün sınırı, 366/90 sınırı),
 * ölçüm kapsamı (none/partial/full), API eşleme (null≠0, modül durumu, eski olay eşlemesi,
 * izinli-ama-açılmamış), opak imleç, süre/etiket biçimleri, çıktı alanlarının içeriksizliği.
 * Çalıştır: npx tsx scripts/usage360/admin360-logic-harness.ts
 */
import {
  trDayOf, addDaysYmd, presetUsage360Period, customUsage360Period, parseYmdRange, ymdRangeToInstants,
  usage360Coverage, DETAIL_MAX_DAYS, TIMELINE_MAX_DAYS, isYmd,
} from "../../lib/admin/stats/usage360Period";
import {
  mapExpertRow, moduleStatus, buildModuleRows, mapTimelineRow, encodeCursor, decodeCursor, allowedExpertModules,
} from "../../lib/admin/stats/usage360Api";
import { formatDurationTr, actionText, channelShares, SUB_ENTITY_LABEL, ACTION_LABEL } from "../../lib/admin/stats/usage360Labels";
import { USAGE_SUB_ENTITIES, USAGE_ACTIONS } from "../../lib/usage/usageTaxonomy";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.error(`  ✗ ${label}`); }
}

console.log("\n[period] Türkiye takvim günü");
ok(trDayOf(Date.parse("2026-09-28T20:59:59Z")) === "2026-09-28" && trDayOf(Date.parse("2026-09-28T21:00:00Z")) === "2026-09-29", "20:59:59Z → 28.09, 21:00Z → 29.09 (TR gece yarısı)");
ok(trDayOf(Date.parse("2015-12-01T21:30:00Z")) === "2015-12-01", "2015 kışı (TR +02 dönemi) IANA ile doğru (sabit +03 değil)");
ok(addDaysYmd("2026-03-01", -1) === "2026-02-28" && addDaysYmd("2028-03-01", -1) === "2028-02-29" && addDaysYmd("2026-12-31", 1) === "2027-01-01", "tarih aritmetiği ay/yıl/artık yıl");
const now = Date.parse("2026-09-28T22:30:00Z"); // TR 29.09 01:30
const today = presetUsage360Period("today", now), yest = presetUsage360Period("yesterday", now);
ok(today.from === "2026-09-29" && today.to === "2026-09-29" && yest.from === "2026-09-28", "Bugün/Dün TR gününe göre (UTC 28.09 22:30 = TR 29.09)");
const p7 = presetUsage360Period("7", now), p90 = presetUsage360Period("90", now);
ok(p7.from === "2026-09-23" && p7.to === "2026-09-29" && p7.days === 7, "7 Gün = bugün dahil son 7 takvim günü");
ok(p90.days === 90 && p90.from === addDaysYmd("2026-09-29", -89), "90 Gün");
ok(customUsage360Period("2026-01-01", "2026-01-31").days === 31 && customUsage360Period("2026-02-01", "2026-01-01").invalid, "özel aralık: geçerli / ters → geçersiz");
ok(customUsage360Period("2025-01-01", "2026-01-02").invalid && !customUsage360Period("2025-01-02", "2026-01-02").invalid, `özel aralık en fazla ${DETAIL_MAX_DAYS} gün`);
ok(!isYmd("2026-02-30") && !isYmd("26-01-01") && isYmd("2028-02-29"), "geçersiz takvim günü reddi");
ok(parseYmdRange("2026-01-01", "2026-03-31", TIMELINE_MAX_DAYS).ok && !parseYmdRange("2026-01-01", "2026-04-01", TIMELINE_MAX_DAYS).ok, "zaman çizelgesi en fazla 90 gün");
ok(!parseYmdRange("2026-01-01; drop", "2026-01-02", 30).ok && !parseYmdRange(null, "2026-01-02", 30).ok, "enjeksiyon/boş tarih → hata");
const inst = ymdRangeToInstants("2026-09-28", "2026-09-28");
ok(inst.fromIso === "2026-09-27T21:00:00.000Z" && inst.toIso === "2026-09-28T21:00:00.000Z", "TR günü → UTC anları [21:00Z, ertesi 21:00Z)");
ok(usage360Coverage(null, "2026-09-01", "2026-09-30") === "none" && usage360Coverage("2026-09-20", "2026-09-01", "2026-09-10") === "none"
  && usage360Coverage("2026-09-20", "2026-09-01", "2026-09-30") === "partial" && usage360Coverage("2026-09-20", "2026-09-21", "2026-09-30") === "full", "ölçüm kapsamı none/partial/full");

console.log("\n[api] eşleme");
const row = mapExpertRow({ user_id: "u", full_name: " Ad ", email: "e", active: null, approval_status: "approved", created_at: "2026-01-01", last_login: null, last_seen: null, last_activity: null,
  today_visits: 0, today_active_seconds: 0, today_modules: 0, today_actions: 0, d7_active_days: 0, d30_active_days: 0, channel_visits_30d: { desktop_web: "3" }, module_permissions: { clients: true, video_ceviri: true } });
ok(row.lastActivityAt === null && row.lastLoginAt === null && row.active === null && row.fullName === "Ad", "null değerler null kalır (0'a çevrilmez)");
ok(row.channelVisits30d.desktop_web === 3 && row.accessibleModuleCount === 1, "kanal sayıları sayıya; admin-only modül izni sayılmaz");
ok(JSON.stringify(allowedExpertModules("expert", { ders_notu: true, belge_ceviri_ai: true, stones: true }).map((m) => m.key)) === JSON.stringify(["stones"]), "izinli uzman modülleri admin-only anahtarları dışlar");
ok(moduleStatus({ periodRow: null, everOpened: false, measurementStart: null }) === "not_measured", "ölçüm yok → Ölçülemiyor (\"kullanılmadı\" DEĞİL)");
ok(moduleStatus({ periodRow: { actions: 2, moduleOpens: 0, activeSeconds: 0 }, everOpened: true, measurementStart: "2026-09-01" }) === "actioned", "işlem → işlem yapıldı");
ok(moduleStatus({ periodRow: { actions: 0, moduleOpens: 1, activeSeconds: 0 }, everOpened: true, measurementStart: "2026-09-01" }) === "opened_only", "yalnız açılış → yalnız açıldı");
ok(moduleStatus({ periodRow: null, everOpened: false, measurementStart: "2026-09-01" }) === "never_opened", "hiç açılmamış (ölçüm başlangıcından beri)");
ok(moduleStatus({ periodRow: null, everOpened: true, measurementStart: "2026-09-01" }) === "not_measured", "önceden açılmış ama dönemde iz yok → never_opened DEĞİL");
const mods = buildModuleRows({
  rpcModules: [{ module: "numerology", actions: 3, creates: 3, moduleOpens: 2, activeSeconds: 600 }, { module: "stones", moduleOpens: 1 }],
  everOpened: ["numerology", "stones"], allowed: [{ key: "numerology", label: "Numeroloji" }, { key: "clients", label: "Danışan" }, { key: "stones", label: "Doğaltaş" }], measurementStart: "2026-09-01",
});
const m = Object.fromEntries(mods.map((x) => [x.module, x]));
ok(m.numerology.status === "actioned" && m.stones.status === "opened_only" && m.clients.status === "never_opened" && m.clients.actions === 0, "izinli modüller: işlem / yalnız açıldı / hiç açılmadı ayrımı");
const tl = mapTimelineRow({ id: "x", occurred_at: "2026-09-28T09:14:00Z", module_key: "numerology", action: null, event_type: "analysis_created", sub_entity: null, channel: null, source: null });
ok(tl.action === "analysis_run" && tl.subEntity === "analysis" && tl.label === "Numeroloji" && !("id" in tl), "eski (AŞAMA 1 öncesi) olay eşlenir; satır kimliği çıktıda YOK");
const tl2 = mapTimelineRow({ id: "x", occurred_at: "2026-09-28T09:14:00Z", module_key: "clients", action: "record_created", sub_entity: "anamnesis", channel: "android_app", source: "server", item_count_bucket: "1" });
ok(JSON.stringify(Object.keys(tl2).sort()) === JSON.stringify(["action", "at", "channel", "errorClass", "failedAction", "itemBucket", "label", "module", "source", "subEntity"]), "zaman çizelgesi satırı yalnız enum/zaman alanları");

console.log("\n[cursor] opak imleç");
const c = encodeCursor("2026-09-28T09:14:00.123Z", "11111111-1111-1111-1111-111111111111");
const dc = decodeCursor(c);
ok(dc !== null && dc !== "invalid" && dc.id === "11111111-1111-1111-1111-111111111111", "encode/decode");
ok(decodeCursor(null) === null && decodeCursor("bozuk!!") === "invalid" && decodeCursor(Buffer.from(JSON.stringify({ at: "x", id: "y" })).toString("base64url")) === "invalid", "geçersiz imleç → invalid (400)");

console.log("\n[labels]");
ok(formatDurationTr(0) === "0 dk" && formatDurationTr(null) === "—" && formatDurationTr(2520) === "~42 dk" && formatDurationTr(3900) === "~1 sa 5 dk" && formatDurationTr(20) === "~<1 dk", "süre: 0 gerçek sıfır, null → —, ~ yaklaşık");
ok(actionText("record_created", "anamnesis") === "Kayıt oluşturuldu · anamnez" && actionText("action_failed", "stone", "record_created").startsWith("İşlem başarısız"), "işlem metni");
ok(channelShares({ android_app: 3, desktop_web: 1 })[0].pct === 75 && channelShares({}).length === 0, "kanal payları");
const allSubs = new Set(Object.values(USAGE_SUB_ENTITIES).flat());
ok([...allSubs].every((s) => SUB_ENTITY_LABEL[s]), "her kanonik alt-varlığın Türkçe etiketi var");
ok(USAGE_ACTIONS.every((a) => ACTION_LABEL[a]), "her eylemin Türkçe etiketi var");

console.log(`\n──────────\nUSAGE360 2C ADMIN LOGIC: PASS ${passed} · FAIL ${failed}`);
process.exit(failed === 0 ? 0 : 1);
