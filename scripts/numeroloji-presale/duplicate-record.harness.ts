/**
 * D2 (05.11.2026) — Bütüncül Numeroloji mükerrer kayıt uyarısı regresyon kalkanı (SAF; ağ / DB YOK).
 *
 *   • findDuplicateRecords eşleşme matrisi (Owner D2 test matrisi 1–8 + tarih / NFC / tire sınırları).
 *   • DuplicateRecordDialog statik çıktısı: tek / çoklu eşleşme seçenekleri, yeni sekme bağlantıları.
 *   • Statik kurallar: kayıttan ÖNCE kontrol; liste okunamazsa kayıt engellenmez; tenant kapsamlı liste
 *     ucu; Klasik Numeroloji kayıtlarıyla karışmaz.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-presale/duplicate-record.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  findDuplicateRecords,
  normalizeBirthDateKey,
  normalizePersonPart,
  recordDetailHref,
  type DuplicateCandidate,
} from "@/app/numeroloji/helpers/duplicateRecord";
import { DuplicateRecordDialogView } from "@/app/numeroloji/components/DuplicateRecordDialog";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`  ✗ ${label}`);
  }
}

const ROOT = path.resolve(__dirname, "../..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const rec = (id: string, name: string, surname: string, birth_date: string, created_at = "2026-11-04T17:21:00.000Z"): DuplicateCandidate => ({ id, name, surname, birth_date, created_at });
const STORED: DuplicateCandidate[] = [
  rec("a1", "Çağrı Gülşen", "ŞÜKRÜOĞLU", "01.01.1950", "2026-11-04T17:21:00.000Z"),
  rec("b1", "Ayşe Nur", "IŞIK ÖZTÜRK", "29.02.2000"),
  rec("c1", "İlker", "ÖĞÜT", "31/12/1999"),
  rec("d1", "Zeynep", "ÇELİK-UĞUR", "22.07.1977"),
  rec("e1", "Hasan", "ARICI", "14.02.1987", "2026-10-01T10:00:00.000Z"),
  rec("e2", "Hasan", "ARICI", "14/02/1987", "2026-10-30T10:00:00.000Z"),
  rec("f1", "Mehmet Ali", "YILDIZ", "11.11.1988"),
];
const ids = (r: DuplicateCandidate[]) => r.map((x) => x.id).join(",");
const find = (name: string, surname: string, birthDate: string, rows: DuplicateCandidate[] = STORED) => findDuplicateRecords(rows, { name, surname, birthDate });

// ── 1–8: Owner D2 matrisi ──────────────────────────────────────────────────────────────────
ok(find("Çağrı Gülşen", "Şükrüoğlu", "01.01.1950", []).length === 0, "1 ilk kayıt (liste boş) → uyarısız");
ok(ids(find("Mehmet Ali", "Yılmaz", "11.11.1988")) === "", "1b eşleşme yok → uyarısız");
ok(ids(find("Çağrı Gülşen", "ŞÜKRÜOĞLU", "01.01.1950")) === "a1", "2 aynı bilgiler → uyarı");
ok(ids(find("çağrı gülşen", "şükrüoğlu", "01.01.1950")) === "a1", "3 küçük harf → eşleşir");
ok(ids(find("ÇAĞRI GÜLŞEN", "Şükrüoğlu", "01.01.1950")) === "a1", "3b büyük harf → eşleşir");
ok(ids(find("ayşe nur", "ışık öztürk", "29.02.2000")) === "b1", "3c Türkçe I/ı katlaması (IŞIK = ışık)");
ok(ids(find("İLKER", "Öğüt", "31.12.1999")) === "c1", "3d İ/i katlaması (İLKER = İlker)");
ok(ids(find("Cagri Gulsen", "Sukruoglu", "01.01.1950")) === "", "4 Ç/C, Ğ/G, Ş/S, Ü/U AYRI → eşleşmez");
ok(ids(find("Ayşe Nur", "ISIK ÖZTÜRK", "29.02.2000")) === "", "4b Ş/S ayrı → eşleşmez");
ok(ids(find("Ilker", "Öğüt", "31.12.1999")) === "", "4c I/İ ayrı (Ilker ≠ İlker) → eşleşmez");
ok(ids(find("Ayşe Nur", "İŞİK ÖZTÜRK", "29.02.2000")) === "", "4d İ ≠ I → eşleşmez");
ok(ids(find("Zeynep", "Çelik Uğur", "22.07.1977")) === "", "4e tire korunur (Çelik-Uğur ≠ Çelik Uğur)");
ok(ids(find("  Çağrı   Gülşen ", "  ŞÜKRÜOĞLU  ", " 01.01.1950 ")) === "a1", "5 fazla boşluk → normalize eşleşir");
ok(ids(find("Çağrı Gülşen", "ŞÜKRÜOĞLU", "02.01.1950")) === "", "6 aynı isim, farklı doğum → farklı kişi");
ok(ids(find("Çağrı Gülşen", "ŞÜKRÜOĞULLARI", "01.01.1950")) === "", "7 aynı tarih, farklı soyad → farklı kişi");
ok(ids(find("Çağrı", "ŞÜKRÜOĞLU", "01.01.1950")) === "", "7b ad eksik parça → farklı (alan bazlı tam eşleşme)");
ok(ids(find("Hasan", "Arıcı", "14.02.1987")) === "e2,e1", "8 birden fazla eski kayıt → hepsi, en yeni önce");

// ── tarih biçimleri / geçersiz girdi ───────────────────────────────────────────────────────
ok(ids(find("İlker", "ÖĞÜT", "31-12-1999")) === "c1" && ids(find("İlker", "ÖĞÜT", "31.12.1999")) === "c1", "tarih: 31/12/1999 = 31.12.1999 = 31-12-1999");
ok(ids(find("Çağrı Gülşen", "ŞÜKRÜOĞLU", "1.1.1950")) === "a1", "tarih: sıfır dolgusuz 1.1.1950 = 01.01.1950");
ok(normalizeBirthDateKey("01.01.50") === null && normalizeBirthDateKey("aa.bb.cccc") === null && normalizeBirthDateKey("") === null && normalizeBirthDateKey("01.13.1990") === null, "tarih: geçersiz → null");
ok(find("", "ŞÜKRÜOĞLU", "01.01.1950").length === 0 && find("Çağrı Gülşen", "", "01.01.1950").length === 0 && find("Çağrı Gülşen", "ŞÜKRÜOĞLU", "").length === 0, "boş alan → eşleşme üretmez");
ok(find("Çağrı Gülşen", "ŞÜKRÜOĞLU", "01.01.1950", [rec("x", "", "", "")]).length === 0, "boş kayıtlı satır → eşleşmez");
ok(findDuplicateRecords(null, { name: "a", surname: "b", birthDate: "01.01.2000" }).length === 0, "liste null → boş");
// NFC: ayrık "I + U+0307" = birleşik "İ"
const decomposedI = "I" + String.fromCharCode(0x307);
ok(normalizePersonPart(`${decomposedI}lker`) === normalizePersonPart("İlker"), "NFC: ayrık İ = birleşik İ");
ok(ids(find(`${decomposedI}LKER`, "ÖĞÜT", "31.12.1999")) === "c1", "NFC: ayrık İ ile girilen ad eşleşir");
ok(normalizePersonPart("  Ayşe \t Nur ") === "ayşe nur", "boşluk / sekme tek boşluğa iner");
ok(recordDetailHref("a1") === "/numeroloji/liste/a1" && recordDetailHref("a/../b") === "/numeroloji/liste/a%2F..%2Fb", "kayıt bağlantısı güvenli kodlanır");
// Girdi dizisi değişmez
const before = JSON.stringify(STORED);
find("Hasan", "Arıcı", "14.02.1987");
ok(JSON.stringify(STORED) === before, "girdi listesi değiştirilmez (sıralama kopyada)");

// ── pencere statik çıktısı ─────────────────────────────────────────────────────────────────
const render = (matches: DuplicateCandidate[], open = true) =>
  renderToStaticMarkup(createElement(DuplicateRecordDialogView, { open, matches, saving: false, onSaveAnyway: () => {}, onCancel: () => {} }));
const one = render([STORED[0]]);
ok(one.includes("Mevcut Kaydı Aç") && one.includes("Yine de Yeni Kaydet") && one.includes("Vazgeç"), "tek eşleşme: üç seçenek");
ok(one.includes("Bu isim, soyisim ve doğum tarihiyle daha önce kaydedilmiş bir analiziniz bulunuyor"), "tek eşleşme: Owner uyarı metni");
ok(one.includes('href="/numeroloji/liste/a1"') && one.includes('target="_blank"') && one.includes("noopener"), "Mevcut Kaydı Aç yeni sekmede (çalışma korunur)");
ok(one.includes('role="dialog"') && one.includes('aria-modal="true"') && one.includes("aria-labelledby"), "erişilebilir diyalog");
const many = render([STORED[5], STORED[4]]);
ok(!many.includes("Mevcut Kaydı Aç") && (many.match(/Bu Kaydı Aç/g) ?? []).length === 2 && many.includes("2 analiziniz"), "çoklu eşleşme: kullanıcı kaydı seçer (satır başına Aç)");
ok(many.includes('href="/numeroloji/liste/e2"') && many.includes('href="/numeroloji/liste/e1"'), "çoklu eşleşme: her kayda ayrı bağlantı");
ok(render([STORED[0]], false) === "" && render([], true) === "", "kapalı / eşleşmesiz → çizilmez");
const savingHtml = renderToStaticMarkup(createElement(DuplicateRecordDialogView, { open: true, matches: [STORED[0]], saving: true, onSaveAnyway: () => {}, onCancel: () => {} }));
ok(savingHtml.includes("Kaydediliyor…") && (savingHtml.match(/disabled=""/g) ?? []).length >= 2, "kayıt sürerken Yine de Kaydet / Vazgeç pasif (çift kayıt yok)");

// ── statik kurallar ────────────────────────────────────────────────────────────────────────
const btn = src("app/numeroloji/components/SaveAnalysisButton.tsx");
const iCheck = btn.indexOf("findDuplicateRecords(");
const iHandle = btn.indexOf("async function handleClick");
const iSaveFn = btn.indexOf("async function save(");
ok(iCheck > iHandle && iCheck < iSaveFn, "kontrol, kayıttan ÖNCE handleClick içinde");
ok(/list\.error \? \[\]/.test(btn) && /catch \{\s*matches = \[\];/.test(btn), "liste okunamazsa / hata → kayıt engellenmez (eşleşme yok sayılır)");
ok(btn.includes("useSubmitLock") && /disabled =\s*\n\s*busy \|\| duplicate !== null/.test(btn), "çift tık kilidi korunur; diyalog açıkken buton pasif");
ok(!/deleteNumerology|PATCH|method: "DELETE"/.test(btn), "otomatik silme / üzerine yazma yok");
const dlgSrc = src("app/numeroloji/components/DuplicateRecordDialog.tsx");
ok(/createPortal\(<DuplicateRecordDialogView/.test(dlgSrc) && /document\.body/.test(dlgSrc), "diyalog document.body'ye portal ile çizilir (transform'lu kartta kırpılmaz)");
const kayit = src("app/numeroloji/helpers/numerolojiKayit.ts");
ok(/numApi\("\/api\/numeroloji\/analyses\?fields=summary"\)/.test(kayit), "liste ucu: tenant istemciden gönderilmez");
const route = src("app/api/numeroloji/analyses/route.ts");
ok(/requireModuleAccess\(req, "numerology"\)/.test(route) && /\.eq\("tenant_id", tenantId\)/.test(route), "sunucu listesi oturum tenant'ı ile süzülür (RLS/tenant)");
ok(/birth_date/.test(route.slice(route.indexOf("SUMMARY_COLUMNS ="), route.indexOf("SUMMARY_COLUMNS =") + 200)), "özet sütunları ad/soyad/doğum içerir");
const helper = src("app/numeroloji/helpers/duplicateRecord.ts");
const dialog = src("app/numeroloji/components/DuplicateRecordDialog.tsx");
ok(![helper, dialog, btn].some((s) => /numeroloji-klasik|numerology_classic/.test(s)), "iki motor karışmaz: Klasik kayıtları sorgulanmaz");

console.log(`\nD2 mükerrer kayıt harness: ${pass} geçti, ${fail} kaldı`);
if (failures.length) console.log(failures.join("\n"));
process.exit(fail ? 1 : 0);
