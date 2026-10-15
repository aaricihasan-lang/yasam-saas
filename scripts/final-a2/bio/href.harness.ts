/**
 * FINAL-A2 — Biyoenerji genel arama sonuç bağlantıları (SAF; DB/ağ YOK).
 * Çalıştır: npx tsx scripts/final-a2/bio/href.harness.ts
 *
 * Kural: hangi bölüm açılırsa açılsın aranan terim bağlantıda taşınır (vurgu için):
 *   - detay rotalı bölümler → `?q=<terim>` (değişmedi)
 *   - liste bölümleri (Enerji Bedenleri, Seanslar) → `?q=<kayıt adı>` liste süzgeci KORUNUR +
 *     `hq=<terim>` (vurgu) + `rid=<kayıt id>` (kayıt seçimi)
 */
import { BIO_GLOBAL_SECTIONS, bioHitHref } from "../../../lib/biyoenerji/globalSearch";
import {
  BIO_SEARCH_RECORD_PARAM,
  BIO_SEARCH_TERM_PARAM,
  bioDetailHrefWithQuery,
  bioHitHrefWithQuery,
  readBioUrlParam,
} from "../../../lib/biyoenerji/searchSession";

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? " → " + detail : ""}`);
}

const TERM = "mide kasılması";
const ID = "e0000000-0000-4000-8000-000000000001";
const TITLE = "ZZ Eterik & Beden";

console.log("── tüm bölümler: terim bağlantıda ──");
for (const sec of BIO_GLOBAL_SECTIONS) {
  const href = bioHitHrefWithQuery({ href: bioHitHref(sec.key, ID, TITLE), id: ID }, TERM);
  const url = new URL(href, "http://x.invalid");
  const isList = sec.key === "enerji-bedenleri" || sec.key === "seanslar";
  const termParam = isList ? BIO_SEARCH_TERM_PARAM : "q";
  ok(url.pathname.startsWith(`/dashboard/biyoenerji/${sec.key}`), `${sec.key}: doğru bölüm yolu`, href);
  ok(url.searchParams.get(termParam) === TERM, `${sec.key}: aranan terim '${termParam}' parametresinde`, href);
  if (isList) {
    ok(url.pathname === `/dashboard/biyoenerji/${sec.key}`, `${sec.key}: liste sayfası (detay rotası yok)`, href);
    ok(url.searchParams.get("q") === TITLE, `${sec.key}: liste süzgeci ?q=<kayıt adı> KORUNDU`, href);
    ok(url.searchParams.get(BIO_SEARCH_RECORD_PARAM) === ID, `${sec.key}: açılacak kayıt rid`, href);
  } else {
    ok(url.pathname === `/dashboard/biyoenerji/${sec.key}/${ID}`, `${sec.key}: kayıt detay rotası`, href);
    ok(!url.searchParams.has(BIO_SEARCH_TERM_PARAM) && !url.searchParams.has(BIO_SEARCH_RECORD_PARAM), `${sec.key}: detayda ek parametre yok`, href);
  }
}

console.log("── kenar durumlar ──");
{
  const raw = bioHitHref("seanslar", ID, TITLE);
  ok(raw === `/dashboard/biyoenerji/seanslar?q=${encodeURIComponent(TITLE)}`, "bioHitHref (sunucu) DEĞİŞMEDİ (WT5 sözleşmesi)", raw);
  ok(bioDetailHrefWithQuery(raw, TERM) === raw, "bioDetailHrefWithQuery liste bağlantısını DEĞİŞTİRMEZ (WT8 sözleşmesi)");
  const empty = new URL(bioHitHrefWithQuery({ href: raw, id: ID }, "   "), "http://x.invalid");
  ok(!empty.searchParams.has(BIO_SEARCH_TERM_PARAM) && empty.searchParams.get(BIO_SEARCH_RECORD_PARAM) === ID && empty.searchParams.get("q") === TITLE, "boş terim → hq yok, q + rid", empty.search);
  const long = "a".repeat(250);
  const h = new URL(bioHitHrefWithQuery({ href: raw, id: ID }, long), "http://x.invalid");
  ok((h.searchParams.get(BIO_SEARCH_TERM_PARAM) ?? "").length === 100, "terim 100 karakterle sınırlı");
  const amp = new URL(bioHitHrefWithQuery({ href: raw, id: ID }, "kalp & mide?#x"), "http://x.invalid");
  ok(amp.searchParams.get(BIO_SEARCH_TERM_PARAM) === "kalp & mide?#x" && amp.hash === "", "özel karakterler kodlanır (&,?,# bağlantıyı bozmaz)");
  ok(bioHitHrefWithQuery({ href: "/dashboard/biyoenerji/sembol-dili/abc", id: "abc" }, TERM) === "/dashboard/biyoenerji/sembol-dili/abc?q=mide%20kas%C4%B1lmas%C4%B1", "detay: WT8 ile birebir aynı");
}

console.log("── readBioUrlParam ──");
ok(readBioUrlParam("?q=ZZ&hq=%20mide%20&rid=abc", "hq") === "mide", "hq okunur + kırpılır");
ok(readBioUrlParam("?q=ZZ", "hq") === "", "yoksa boş");
ok(readBioUrlParam(`?hq=${"b".repeat(300)}`, "hq").length === 100, "varsayılan sınır 100");
ok(readBioUrlParam("?rid=abc", "rid") === "abc", "rid okunur");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
