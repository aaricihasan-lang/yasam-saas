/**
 * Doğum öncesi analiz (owner kararı 06.11.2026) — SUNUM harness'i.
 *
 * Gelecekteki doğum tarihi yasaklanmaz; referans tarih doğumdan önceyse ekran ve Word:
 *   • "Yaş -1" yazmaz, "şu anda içinde bulunulan" aktif kişisel yıl dönemi göstermez,
 *   • "şu anki" yaşam evresini vurgulamaz, bunun yerine doğum öncesi açıklaması gösterir.
 * Doğum sonrası (normal) çıktı aynen kalır; motor sayıları değişmez.
 *
 * Çalıştır: npx tsx scripts/numeroloji-presale/prebirth.harness.ts
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeCycleTiming, computePersonalTiming } from "@/lib/numeroloji/timing";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import { isPreBirth, preBirthActiveYearText, preBirthEvreText, preBirthNote } from "@/app/numeroloji/utils/preBirth";
import { buildNumerolojiWordChildren } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { NumerolojiZamanlamaGelisimTab } from "@/app/numeroloji/components/NumerolojiZamanlamaGelisimTab";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
}

const REF = { year: 2026, month: 11, day: 6 };
console.log("— isPreBirth (takvim sınırları)");
ok(isPreBirth(computeCycleTiming("15.03.2027", REF)), "doğum gelecek yıl → doğum öncesi");
ok(isPreBirth(computeCycleTiming("07.11.2026", REF)), "doğum yarın → doğum öncesi");
ok(!isPreBirth(computeCycleTiming("06.11.2026", REF)), "doğum bugün → doğum öncesi DEĞİL (yaş 0)");
ok(!isPreBirth(computeCycleTiming("05.11.2026", REF)), "doğum dün → doğum öncesi DEĞİL");
ok(!isPreBirth(computeCycleTiming("18.02.1987", REF)), "geçmiş doğum → doğum öncesi DEĞİL");
ok(!isPreBirth(computeCycleTiming("31.02.2027", REF)), "geçersiz tarih → doğum öncesi DEĞİL (ayrı uyarı yolu)");
ok(computeCycleTiming("15.03.2027", REF).age === -1 && computePersonalTiming("15.03.2027", REF).personalYear.active.periodStart.year === 2026, "motor değişmedi: yaş -1 ve aktif dönem 2026 (yalnız sunum katmanı gizler)");

console.log("— metinler");
const b = { year: 2027, month: 3, day: 15 };
ok(preBirthNote(b, REF).includes("15.03.2027") && preBirthNote(b, REF).includes("06.11.2026") && /Doğum öncesi analiz/.test(preBirthNote(b, REF)), "bağlam notu doğum + referans tarihini yazar");
ok(/henüz aktif kişisel yıl yok/.test(preBirthActiveYearText(b)) && preBirthActiveYearText(b).includes("15.03.2027"), "aktif kişisel yıl açıklaması");
ok(preBirthEvreText(7) === "Doğum öncesi — yaşam evresi doğumla başlar. İlk evre: Evre 1 (enerji 7).", "evre açıklaması (PIN ilk hane)");

console.log("— Word (gerçek builder, Zamanlama bölümü)");
function word(bd: string, ref = REF): string {
  const row = { id: "r1", name: "Deniz", surname: "YILMAZ", birth_date: bd, created_at: "2026-11-06T10:00:00Z", analysis_data: { version: 1, motor: hesaplaNumeroloji({ firstName: "Deniz", lastName: "YILMAZ", birthDate: bd }), summary: "X" } };
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  const sections = { summary: false, plain: false, detailed: false, tas: false, zamanlama: true } as never;
  return JSON.stringify(buildNumerolojiWordChildren([row] as never, sections, shared as never, new Map(), ref, new Date("2026-11-06T09:00:00+03:00")).children);
}
const wf = word("15.03.2027");
ok(wf.includes("Doğum öncesi analiz") && wf.includes("henüz aktif kişisel yıl yok") && wf.includes("yaşam evresi doğumla başlar"), "doğum öncesi: üç açıklama Word'de");
ok(!/Yaş -\d/.test(wf), "doğum öncesi: 'Yaş -1' yok");
ok(!wf.includes("Aktif Dönem:"), "doğum öncesi: doğumdan önceki 'Aktif Dönem' yazılmaz");
ok(wf.includes("Nominal Kişisel Yıl (2026)") && wf.includes("Güncel Yıl Çakrası"), "doğum öncesi: takvim hesapları ve isim/sayı bölümleri korunur");
const wp = word("18.02.1987");
ok(wp.includes("Aktif Dönem:") && /Evre \d · Yaş 39/.test(wp) && !wp.includes("Doğum öncesi"), "doğum sonrası: önceki Word çıktısı (aktif dönem + evre/yaş) aynen");
const w0 = word("06.11.2026");
ok(!w0.includes("Doğum öncesi") && /Evre 1 · Yaş 0/.test(w0), "doğum günü = referans: doğum öncesi DEĞİL (Yaş 0)");

console.log("— Ekran (Zamanlama & Gelişim sekmesi, sunucu render)");
const nextYear = new Date().getFullYear() + 1;
const htmlF = renderToStaticMarkup(createElement(NumerolojiZamanlamaGelisimTab, { firstName: "Deniz", lastName: "YILMAZ", birthDate: `15.03.${nextYear}` }));
ok(htmlF.includes("noj-prebirth-note") && htmlF.includes("Doğum öncesi analiz"), "doğum öncesi: bağlam notu");
ok(!/Yaş -\d/.test(htmlF), "doğum öncesi: 'Yaş -1' yok");
ok(!htmlF.includes("Şu anda içinde bulunulan dönem"), "doğum öncesi: 'Şu anda içinde bulunulan dönem' yok");
ok(htmlF.includes("henüz aktif kişisel yıl yok") && htmlF.includes("noj-prebirth-evre"), "doğum öncesi: aktif yıl + evre açıklamaları");
ok(!htmlF.includes("border-emerald-400"), "doğum öncesi: hiçbir evre 'şu an' olarak vurgulanmaz");
const htmlP = renderToStaticMarkup(createElement(NumerolojiZamanlamaGelisimTab, { firstName: "Deniz", lastName: "YILMAZ", birthDate: "18.02.1987" }));
ok(htmlP.includes("Şu anda içinde bulunulan dönem") && /Evre \d · Yaş \d+/.test(htmlP) && !htmlP.includes("noj-prebirth"), "doğum sonrası: önceki ekran (aktif dönem + evre/yaş + vurgu) aynen");
ok(htmlP.includes("border-emerald-400"), "doğum sonrası: şu anki evre vurgusu korunur");

console.log(`\nprebirth harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
