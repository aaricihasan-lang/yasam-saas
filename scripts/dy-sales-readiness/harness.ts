/**
 * FAZ 2 — Danışan Yolculuğu satış-öncesi düzeltmeleri harness'i.
 *
 * Çalıştır: npx tsx scripts/dy-sales-readiness/harness.ts
 *
 * Kapsam:
 *   - BURÇ: computeBurc UI-algoritma paritesi + sınır tarihleri + null davranışı (F7)
 *   - ÖDEV: aggregateHomeworks / isHomeworkOverdue canonical fixture'ları (F3)
 *   - ISTANBUL TIME: ay penceresi + UTC/gün-ay sınırı (F6)
 *   - STATIC: randevu filtreleri (F1/F2), silme atomikliği (F5), hata sanitasyonu (F4),
 *             FAZ 1 güvenlik invariant'ları, burç server-authoritative (F7)
 */
import { readFileSync } from "node:fs";
import { computeBurc } from "@/lib/danisan/burc";
import { aggregateHomeworks, isHomeworkOverdue } from "@/lib/odevStatus";
import { istanbulMonthRange } from "@/lib/danisan/istanbulTime";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.error("  ✗ " + name); }
}
function eq(name: string, got: unknown, want: unknown) {
  check(`${name} (got=${JSON.stringify(got)} want=${JSON.stringify(want)})`, got === want);
}

// ── UI'daki ESKİ algoritma (parite referansı; birebir taşındığını kanıtlar) ──────
function oldBurcHesapla(date: string): string {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  const ay = Number(parts[1]);
  const gun = Number(parts[2]);
  if ((ay === 3 && gun >= 21) || (ay === 4 && gun <= 19)) return "Koç";
  if ((ay === 4 && gun >= 20) || (ay === 5 && gun <= 20)) return "Boğa";
  if ((ay === 5 && gun >= 21) || (ay === 6 && gun <= 20)) return "İkizler";
  if ((ay === 6 && gun >= 21) || (ay === 7 && gun <= 22)) return "Yengeç";
  if ((ay === 7 && gun >= 23) || (ay === 8 && gun <= 22)) return "Aslan";
  if ((ay === 8 && gun >= 23) || (ay === 9 && gun <= 22)) return "Başak";
  if ((ay === 9 && gun >= 23) || (ay === 10 && gun <= 22)) return "Terazi";
  if ((ay === 10 && gun >= 23) || (ay === 11 && gun <= 21)) return "Akrep";
  if ((ay === 11 && gun >= 22) || (ay === 12 && gun <= 21)) return "Yay";
  if ((ay === 12 && gun >= 22) || (ay === 1 && gun <= 19)) return "Oğlak";
  if ((ay === 1 && gun >= 20) || (ay === 2 && gun <= 18)) return "Kova";
  return "Balık";
}

console.log("── BURÇ (F7) ──");
// Parite: 2024 (artık yıl) tüm günleri için computeBurc === eski algoritma.
{
  let parityOk = true;
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(2024, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `2024-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const got = computeBurc(ds) ?? "";
      const want = oldBurcHesapla(ds);
      if (got !== want) { parityOk = false; console.error(`   parite kırıldı: ${ds} got=${got} want=${want}`); }
    }
  }
  check("computeBurc, 366 günün tamamında eski UI algoritmasıyla BİREBİR", parityOk);
}
// Sınır tarihleri
eq("21 Mart → Koç", computeBurc("2000-03-21"), "Koç");
eq("20 Mart → Balık", computeBurc("2000-03-20"), "Balık");
eq("19 Nisan → Koç", computeBurc("2000-04-19"), "Koç");
eq("20 Nisan → Boğa", computeBurc("2000-04-20"), "Boğa");
eq("22 Aralık → Oğlak", computeBurc("2000-12-22"), "Oğlak");
eq("19 Ocak → Oğlak", computeBurc("2000-01-19"), "Oğlak");
eq("20 Ocak → Kova", computeBurc("2000-01-20"), "Kova");
eq("18 Şubat → Kova", computeBurc("2000-02-18"), "Kova");
eq("19 Şubat → Balık", computeBurc("2000-02-19"), "Balık");
// null davranışı
eq("boş → null", computeBurc(""), null);
eq("null → null", computeBurc(null), null);
eq("undefined → null", computeBurc(undefined), null);
eq("bozuk format → null", computeBurc("2000/03/21"), null);

console.log("── ÖDEV (F3) ──");
{
  const today = "2026-08-21";
  // Canonical fixture: devam, devam, tamamlandi, gecikti, iptal (end_date'ler gelecekte/none)
  const rows = [
    { status: "devam", end_date: "2026-09-01" },
    { status: "devam", end_date: null },
    { status: "tamamlandi", end_date: "2026-08-01" },
    { status: "gecikti", end_date: "2026-08-01" },
    { status: "iptal", end_date: "2026-08-01" },
  ];
  const a = aggregateHomeworks(rows, today);
  eq("total", a.total, 5);
  eq("active (devam)", a.active, 2);
  eq("completed", a.completed, 1);
  eq("late (açık gecikti)", a.late, 1);
  eq("cancelled", a.cancelled, 1);
  eq("eligibleTotal (total − iptal)", a.eligibleTotal, 4);
  eq("completionPercent = 1/4 = 25", a.completionPercent, 25);
  eq("overdue (gecikti + devam-past)", a.overdue, 1); // yalnız gecikti; devam'lar geçmişte değil
  // Yalnız iptal → payda 0 → completion 0
  const onlyCancel = aggregateHomeworks([{ status: "iptal" }, { status: "iptal" }], today);
  eq("yalnız iptal: eligible 0", onlyCancel.eligibleTotal, 0);
  eq("yalnız iptal: completion 0", onlyCancel.completionPercent, 0);
  // bekliyor paydada kalır, active değil
  const withPending = aggregateHomeworks([{ status: "bekliyor" }, { status: "tamamlandi" }], today);
  eq("bekliyor: active 0", withPending.active, 0);
  eq("bekliyor: eligible 2 (iptal yok)", withPending.eligibleTotal, 2);
  eq("bekliyor: completion 50", withPending.completionPercent, 50);
  // devam + geçmiş end_date → overdue
  const devamPast = aggregateHomeworks([{ status: "devam", end_date: "2026-08-01" }], today);
  eq("devam+geçmiş → overdue 1", devamPast.overdue, 1);
}
// isHomeworkOverdue
{
  const today = "2026-08-21";
  check("gecikti → overdue", isHomeworkOverdue({ status: "gecikti", end_date: null }, today) === true);
  check("devam+geçmiş → overdue", isHomeworkOverdue({ status: "devam", end_date: "2026-08-20" }, today) === true);
  check("devam+bugün → overdue", isHomeworkOverdue({ status: "devam", end_date: "2026-08-21" }, today) === true);
  check("devam+gelecek → değil", isHomeworkOverdue({ status: "devam", end_date: "2026-08-22" }, today) === false);
  check("devam+end yok → değil", isHomeworkOverdue({ status: "devam", end_date: null }, today) === false);
  check("tamamlandi+geçmiş → değil", isHomeworkOverdue({ status: "tamamlandi", end_date: "2026-08-01" }, today) === false);
  check("iptal+geçmiş → değil", isHomeworkOverdue({ status: "iptal", end_date: "2026-08-01" }, today) === false);
}

console.log("── ISTANBUL TIME (F6) ──");
{
  // Ay ortası ref → doğru ay penceresi (Istanbul 00:00 = UTC -3s)
  const mid = istanbulMonthRange(new Date("2026-08-15T12:00:00Z"));
  eq("Ağustos monthStart = Jul 31 21:00Z (Ist Aug 1 00:00)", mid.monthStart, "2026-07-31T21:00:00.000Z");
  eq("Ağustos monthEnd = Aug 31 21:00Z (Ist Sep 1 00:00)", mid.monthEnd, "2026-08-31T21:00:00.000Z");
  check("monthStart < monthEnd", mid.monthStart < mid.monthEnd);
  // UTC gün/ay SINIRI: UTC 31 Ağu 21:30 = Istanbul 1 Eylül 00:30 → EYLÜL penceresi
  const boundary = istanbulMonthRange(new Date("2026-08-31T21:30:00Z"));
  eq("sınır: monthStart = Aug 31 21:00Z (Ist Sep 1)", boundary.monthStart, "2026-08-31T21:00:00.000Z");
  eq("sınır: monthEnd = Sep 30 21:00Z (Ist Oct 1)", boundary.monthEnd, "2026-09-30T21:00:00.000Z");
  // Yıl geçişi: Istanbul Aralık → Ocak penceresi
  const dec = istanbulMonthRange(new Date("2026-12-10T12:00:00Z"));
  eq("Aralık monthEnd = Dec 31 21:00Z (Ist Jan 1 2027)", dec.monthEnd, "2026-12-31T21:00:00.000Z");
}

console.log("── STATIC INVARIANTS (F1/F2/F4/F5/F7 + FAZ1) ──");
function readF(rel: string): string {
  return readFileSync(rel, "utf8");
}
// F1: Bu Ay Randevu artık iptal hariç (status filtresi var)
{
  const s = readF("app/api/clients/stats/route.ts");
  check("F1: 'Bu ay randevu' iptal hariç filtresi (or status.neq.iptal)", /Bu ay randevu[\s\S]{0,220}status\.neq\.iptal/.test(s));
  check("F2: 'En yakın' tamamlandi de hariç", /status\.neq\.iptal,status\.neq\.tamamlandi|and\(status\.neq\.iptal,status\.neq\.tamamlandi\)/.test(s));
  check("F6: stats server-side Istanbul (istanbulMonthRange)", s.includes("istanbulMonthRange"));
  check("F6: stats artık client monthStart param'ı OKUMUYOR", !s.includes('searchParams.get("monthStart")'));
}
// F6: dashboard artık monthStart göndermiyor
{
  const p = readF("app/danisan-yolculugu/page.tsx");
  check("F6: page.tsx monthStart query GÖNDERMİYOR", !p.includes("monthStart:"));
}
// F5: cascade-delete atomik — manuel child delete YOK, tek clients delete, storage post-commit
{
  const c = readF("app/api/clients/[id]/cascade-delete/route.ts");
  check("F5: MANUAL_DELETE_TABLES kaldırıldı", !c.includes("MANUAL_DELETE_TABLES"));
  check("F5: client_homeworks manuel delete YOK", !/from\("client_homeworks"\)[\s\S]{0,40}\.delete\(\)/.test(c));
  check("F5: client_analyses manuel delete YOK", !/from\("client_analyses"\)[\s\S]{0,40}\.delete\(\)/.test(c));
  check("F5: analiz görsel bucket temizliği eklendi", c.includes("client-analysis-images"));
  check("F5: DB delete öncesi path toplama (collect*Paths)", c.includes("collectAnalysisImagePaths") && c.includes("collectStonePhotoPaths"));
  check("F5: warnings ham error.message İÇERMİYOR", !/warnings\.push\([^)]*\.message/.test(c));
}
// F5 migration
{
  const m = readF("supabase/migrations/20261219000000_client_delete_cascade_integrity.sql");
  check("F5 mig: client_homeworks FK ON DELETE CASCADE", /client_homeworks[\s\S]*REFERENCES public\.clients\(id\) ON DELETE CASCADE/.test(m));
  check("F5 mig: client_analyses FK ON DELETE CASCADE", /client_analyses[\s\S]*REFERENCES public\.clients\(id\) ON DELETE CASCADE/.test(m));
  check("F5 mig: yetim temizliği NOT EXISTS guard", m.includes("NOT EXISTS") && m.includes("client_id IS NOT NULL"));
  check("F5 mig: idempotent (pg_constraint IF NOT EXISTS)", m.includes("pg_constraint"));
}
// F4: hiçbir clients route 500 gövdesinde ham .message dönmüyor (temsili birkaç dosya)
{
  for (const f of [
    "app/api/clients/[id]/notes/route.ts",
    "app/api/clients/[id]/sessions/route.ts",
    "app/api/clients/[id]/stones/route.ts",
    "app/api/clients/word-report-bulk/route.ts",
  ]) {
    const src = readF(f);
    const leak = /json\(\s*\{[^}]*error:\s*[a-zA-Z_.?]+\.message/.test(src);
    check(`F4: ${f} 500 gövdesinde ham .message YOK`, !leak);
    check(`F4: ${f} serverErrorResponse kullanıyor`, src.includes("serverErrorResponse"));
  }
}
// F7: burç server-authoritative
{
  const post = readF("app/api/clients/route.ts");
  check("F7: POST burç server-side computeBurc", post.includes("computeBurc(fields.dogum"));
  const patch = readF("app/api/clients/[id]/route.ts");
  check("F7: PATCH dogum varsa burç recompute", patch.includes('hasOwnProperty.call(fields, "dogum")') && patch.includes("computeBurc"));
  check("F7: PATCH dogum yoksa client burç strip (delete fields.burc)", patch.includes("delete fields.burc"));
}
// FAZ 1 güvenlik invariant: guard'lar korunuyor
{
  const up = readF("app/api/clients/[id]/analyses/upload-image/route.ts");
  const ws = readF("app/api/clients/[id]/word-report/route.ts");
  const wb = readF("app/api/clients/word-report-bulk/route.ts");
  check("FAZ1: upload-image requireModuleAccess", up.includes("requireModuleAccess"));
  check("FAZ1: upload-image getPublicUrl YOK", !up.includes("getPublicUrl"));
  check("FAZ1: word-report requireModuleAccess", ws.includes("requireModuleAccess"));
  check("FAZ1: word-report-bulk requireModuleAccess", wb.includes("requireModuleAccess"));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} DY FAZ 2 harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.error("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
