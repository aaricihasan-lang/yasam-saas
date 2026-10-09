/**
 * WT7 unit harness — saf mantık + gerçek DOCX üretimi (DB yok).
 *   A) Ödev "Kaç gün sonra?" (takvim aritmetiği, sınırlar, son-işlem-kazanır, düzenleme)
 *   B) Ödeme durumu yardımcıları (eski/NULL kayıt rozet üretmez)
 *   C) Toplu Word kapsam çözümü (tek dinamik buton)
 *   D) Toplu Word içerik: her danışan = tekli raporun TAM gövdesi; sayfa sonu; Türkçe; kesilme yok
 *
 * Çalıştır: npx tsx scripts/wt7/unit.harness.ts   (TZ=America/New_York vb. ile de)
 */
import JSZip from "jszip";
import { Packer, type Document } from "docx";
import {
  addCalendarDays,
  applyDateFieldChange,
  calendarDaysBetween,
  initDateFields,
  parseDurationDays,
  HOMEWORK_MAX_DAYS,
  type HomeworkDateFields,
} from "@/lib/danisan/homeworkDuration";
import { validateHomeworkDates } from "@/lib/danisan/homeworkDates";
import { isPaymentStatus, paymentStatusLabelTR, readPaymentStatus, summarizeUnpaid } from "@/lib/danisan/chargePayment";
import { BULK_WORD_MAX_CLIENTS, resolveBulkWordScope } from "@/lib/danisan/bulkWord";
import { buildClientFullReport, buildClientsBulkFullReport } from "@/app/api/clients/[id]/word-report/clientReportBuilder";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { LONG_TAIL, makeDataset } from "./fixtures";

let pass = 0;
let fail = 0;
function check(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}
function section(s: string) { console.log(`\n── ${s} ──`); }

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function xmlText(xml: string): string {
  return xml.split("</w:p>")
    .map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join(""))
    .join("\n");
}
async function render(doc: Document): Promise<{ text: string; raw: string; size: number }> {
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return { text: xmlText(raw), raw, size: buf.length };
}

const NOW = new Date("2026-09-26T22:30:00Z");

async function main() {
  console.log(`[ortam] TZ=${process.env.TZ ?? "(yok)"} · Intl=${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  // ═════ A) Ödev — Kaç gün sonra? ═══════════════════════════════════════════
  section("A1 takvim aritmetiği");
  const cases: [string, number, string][] = [
    ["2026-10-09", 1, "2026-10-10"], ["2026-10-09", 7, "2026-10-16"], ["2026-10-09", 10, "2026-10-19"],
    ["2026-10-09", 21, "2026-10-30"], ["2026-10-09", 30, "2026-11-08"], ["2026-10-09", 90, "2027-01-07"],
    ["2026-01-31", 1, "2026-02-01"], ["2026-01-31", 30, "2026-03-02"], ["2026-02-28", 1, "2026-03-01"],
    ["2028-02-28", 1, "2028-02-29"], ["2028-02-29", 1, "2028-03-01"], ["2028-02-29", 365, "2029-02-28"],
    ["2026-12-31", 1, "2027-01-01"], ["2026-12-25", 7, "2027-01-01"], ["2026-03-28", 2, "2026-03-30"], // AB DST haftası
    ["2026-10-24", 2, "2026-10-26"], ["2026-10-09", 0, "2026-10-09"], ["2026-10-09", 3650, "2036-10-06"],
  ];
  for (const [s, n, e] of cases) check(`${s} + ${n} = ${e}`, addCalendarDays(s, n) === e, addCalendarDays(s, n));
  check("geçersiz tarih → null", addCalendarDays("2026-02-30", 1) === null && addCalendarDays("", 1) === null);
  check("calendarDaysBetween 2028-02-28→2028-03-01 = 2", calendarDaysBetween("2028-02-28", "2028-03-01") === 2);
  check("calendarDaysBetween yıl sonu", calendarDaysBetween("2026-12-31", "2027-01-01") === 1);

  section("A2 girdi doğrulama");
  const pd = (s: string) => parseDurationDays(s);
  check("'' → empty", pd("").kind === "empty" && pd("   ").kind === "empty");
  check("'0' → ok 0 (aynı gün)", (pd("0") as { days?: number }).days === 0);
  check("'7' ve ' 21 ' → ok", (pd("7") as { days?: number }).days === 7 && (pd(" 21 ") as { days?: number }).days === 21);
  check("'-1' → negative", (pd("-1") as { reason?: string }).reason === "negative");
  check("'1.5' / '1,5' / 'abc' / '1e3' → notInteger", ["1.5", "1,5", "abc", "1e3", "+3"].every((x) => (pd(x) as { reason?: string }).reason === "notInteger"));
  check(`'${HOMEWORK_MAX_DAYS}' ok, '${HOMEWORK_MAX_DAYS + 1}' → tooLarge`, pd(String(HOMEWORK_MAX_DAYS)).kind === "ok" && (pd(String(HOMEWORK_MAX_DAYS + 1)) as { reason?: string }).reason === "tooLarge");
  check("'99999999999999999999' → tooLarge", (pd("99999999999999999999") as { reason?: string }).reason === "tooLarge");
  check("N=0 sonucu bitiş<başlangıç kuralını ihlal etmez", validateHomeworkDates({ start_date: "2026-10-09", end_date: addCalendarDays("2026-10-09", 0) }) === null);

  section("A3 son işlem kazanır");
  let f: HomeworkDateFields = { startDate: "2026-10-09", endDate: "", durationDays: "", dateAnchor: "end" };
  f = applyDateFieldChange(f, "durationDays", "21");
  check("N=21 → bitiş 2026-10-30, anchor days", f.endDate === "2026-10-30" && f.dateAnchor === "days", f);
  f = applyDateFieldChange(f, "startDate", "2026-10-15");
  check("anchor days + başlangıç değişti → bitiş yeniden (2026-11-05)", f.endDate === "2026-11-05" && f.durationDays === "21", f);
  f = applyDateFieldChange(f, "endDate", "2026-11-20");
  check("bitiş elle → N gerçek fark (36), anchor end", f.endDate === "2026-11-20" && f.durationDays === "36" && f.dateAnchor === "end", f);
  f = applyDateFieldChange(f, "startDate", "2026-11-01");
  check("anchor end + başlangıç değişti → bitiş KORUNUR, N=19 (eski hesap tekrar uygulanmaz)", f.endDate === "2026-11-20" && f.durationDays === "19", f);
  f = applyDateFieldChange(f, "startDate", "2026-12-01");
  check("başlangıç bitişten sonra → N boşalır, bitiş korunur (kayıtta 'bitiş<başlangıç' engeli)", f.endDate === "2026-11-20" && f.durationDays === "" && validateHomeworkDates({ start_date: f.startDate, end_date: f.endDate }) !== null, f);
  f = applyDateFieldChange({ startDate: "2026-10-09", endDate: "2026-10-12", durationDays: "3", dateAnchor: "end" }, "durationDays", "-4");
  check("negatif N → bitiş DEĞİŞMEZ", f.endDate === "2026-10-12" && f.durationDays === "-4" && f.dateAnchor === "days");
  f = applyDateFieldChange(f, "startDate", "2026-10-20");
  check("geçersiz N iken başlangıç değişimi → N ve bitiş aynen", f.endDate === "2026-10-12" && f.durationDays === "-4");
  f = applyDateFieldChange({ startDate: "", endDate: "", durationDays: "", dateAnchor: "end" }, "durationDays", "7");
  check("başlangıç yok → bitiş üretilmez", f.endDate === "");
  f = applyDateFieldChange(f, "startDate", "2026-10-09");
  check("sonra başlangıç seçilince N=7 uygulanır", f.endDate === "2026-10-16");
  f = applyDateFieldChange(f, "durationDays", "");
  check("N silinince bitiş korunur, anchor end", f.endDate === "2026-10-16" && f.dateAnchor === "end");
  f = applyDateFieldChange({ startDate: "2026-10-09", endDate: "2026-10-30", durationDays: "21", dateAnchor: "days" }, "durationDays", "0");
  check("N=0 → aynı gün", f.endDate === "2026-10-09");

  section("A4 düzenleme");
  const e = initDateFields("2026-02-20", "2026-03-02");
  check("kayıtlı tarihler aynen + N bilgi (10), anchor end", e.startDate === "2026-02-20" && e.endDate === "2026-03-02" && e.durationDays === "10" && e.dateAnchor === "end", e);
  check("kayıtlı bitiş yok → N boş", initDateFields("2026-02-20", "").durationDays === "");
  check("eski bozuk kayıt (bitiş<başlangıç) → N boş, tarihler aynen", JSON.stringify(initDateFields("2026-03-02", "2026-02-20")) === JSON.stringify({ startDate: "2026-03-02", endDate: "2026-02-20", durationDays: "", dateAnchor: "end" }));

  // ═════ B) Ödeme durumu ════════════════════════════════════════════════════
  section("B ödeme durumu");
  check("isPaymentStatus yalnız paid/unpaid", isPaymentStatus("paid") && isPaymentStatus("unpaid") && !isPaymentStatus(null) && !isPaymentStatus("") && !isPaymentStatus("PAID") && !isPaymentStatus(true));
  check("readPaymentStatus bilinmeyen → null", readPaymentStatus("x") === null && readPaymentStatus(undefined) === null);
  check("etiketler", paymentStatusLabelTR("paid") === "Ödendi" && paymentStatusLabelTR("unpaid") === "Ödenmedi" && paymentStatusLabelTR(null) === "Belirtilmemiş");
  const sum = summarizeUnpaid([
    { payment_status: "unpaid", amount: 100.25 }, { payment_status: "unpaid", amount: "200.5" },
    { payment_status: "paid", amount: 999 }, { payment_status: null, amount: 777 }, { amount: 555 },
  ]);
  check("summarizeUnpaid: yalnız unpaid (NULL/eski sayılmaz)", sum.count === 2 && sum.total === 300.75, sum);
  check("yalnız eski kayıtlar → rozet yok", summarizeUnpaid([{ payment_status: null, amount: 5 }, {}]).count === 0);

  // ═════ C) Kapsam ══════════════════════════════════════════════════════════
  section("C toplu Word kapsamı");
  check("0 seçili → count 0", resolveBulkWordScope(0, 40, false).count === 0 && !resolveBulkWordScope(0, 0, false).isAll);
  check("1/40 → seçilenler", JSON.stringify(resolveBulkWordScope(1, 40, false)) === JSON.stringify({ mode: "selected", count: 1, isAll: false }));
  check("40/40 filtre yok → Tümü (sunucuya all)", JSON.stringify(resolveBulkWordScope(40, 40, false)) === JSON.stringify({ mode: "all", count: 40, isAll: true }));
  check("40/40 filtre var → etiket Tümü ama id'ler gider", JSON.stringify(resolveBulkWordScope(40, 40, true)) === JSON.stringify({ mode: "selected", count: 40, isAll: true }));
  check("toplam bilinmiyor → seçilenler", resolveBulkWordScope(5, null, false).mode === "selected");
  check("sınır 100", BULK_WORD_MAX_CLIENTS === 100);

  // ═════ D) Toplu Word içerik ═══════════════════════════════════════════════
  section("D toplu Word = tekli tam gövde");
  const N = 3;
  const items = Array.from({ length: N }, (_, i) => ({ data: makeDataset(i + 1), profileImg: null, analysisImages: [null] }));
  const bulk = await render(buildClientsBulkFullReport(items, { now: NOW, expertName: "ZZ Uzman" }).doc);
  const note = wellnessNote("danisan").full;
  for (let i = 0; i < N; i++) {
    const single = await render(buildClientFullReport(items[i]!, { now: NOW, expertName: "ZZ Uzman" }).doc);
    const a = single.text.indexOf("DANIŞAN PROFİLİ");
    const b = single.text.lastIndexOf("Bilgilendirme", single.text.indexOf(note));
    const body = single.text.slice(a, b);
    check(`danışan ${i + 1}: tekli gövde (profil→yolculuk) toplu dosyada BİREBİR`, a > 0 && b > a && bulk.text.includes(body), { a, b, len: body.length });
    check(`danışan ${i + 1}: "DANIŞAN ${i + 1} / ${N}" etiketi`, bulk.text.includes(`DANIŞAN ${i + 1} / ${N}`));
    check(`danışan ${i + 1}: uzun metin kesilmedi`, bulk.text.includes(`${LONG_TAIL}_${i + 1}`) && bulk.text.includes(`${LONG_TAIL}_${i + 1 + 1000}`));
    for (const h of ["Temel Bilgiler", "Randevular", "Taşlar", "Seanslar", "Ücretlendirme", "Ödevler", "Analizler"]) {
      check(`danışan ${i + 1}: tekli raporda "${h}" var`, single.text.includes(h));
    }
  }
  check("bölüm sırası: danışan 1 < 2 < 3", bulk.text.indexOf("DANIŞAN 1 / 3") < bulk.text.indexOf("DANIŞAN 2 / 3") && bulk.text.indexOf("DANIŞAN 2 / 3") < bulk.text.indexOf("DANIŞAN 3 / 3"));
  check("Türkçe karakterler korunur", /ZZ_Ayşe1 Çiğdem-Işık1/.test(bulk.text) && bulk.text.includes("çğıöşü ÇĞİÖŞÜ"));
  check("özel karakter XML kaçışı (bozuk dosya yok)", bulk.text.includes('"tırnak" & <açı>'));
  check("uzman iç notu varsayılan HARİÇ (tekliyle aynı)", !bulk.text.includes("GIZLI_UZMAN_NOTU_"));
  check("bilgilendirme notu + kapanış bir kez", bulk.text.split(note).length - 1 === 1);
  check("ödeme durumu Word'de: Ödendi/Ödenmedi/Belirtilmemiş", ["Ödendi", "Ödenmedi", "Belirtilmemiş"].every((x) => bulk.text.includes(x)));
  check("ödenmemiş özeti satırı (1 kayıt · 350,5 ₺)", bulk.text.includes("Ödenmemiş") && /1 kayıt · 350,5 ₺/.test(bulk.text));
  const pageBreaks = (bulk.raw.match(/<w:pageBreakBefore\/>/g) ?? []).length;
  const badgeBreaks = items.length;
  check(`her danışan yeni sayfada (pageBreakBefore ≥ ${badgeBreaks})`, pageBreaks >= badgeBreaks, pageBreaks);
  check("dizin: her ad listelenir", items.every((it) => bulk.text.includes(`${it.data.client.ad} ${it.data.client.soyad}`)));

  section("D2 tekli rapor değişmedi (ödeme sütunu hariç yapı)");
  const one = await render(buildClientFullReport(items[0]!, { now: NOW }).doc);
  check("tekli rapor kapak + kapanış korunur", one.text.includes(note) && !one.text.includes("DANIŞAN 1 /"));

  console.log(`\nWT7 unit: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
