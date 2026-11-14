/**
 * F3A — `lib/docx/expertBranding.ts` SAF birim testleri (DB / ağ YOK; sentetik veri).
 *
 *  A normalize: boş → null · temizlik (kontrol karakteri, yalnız vekil) · Türkçe/emoji korunur ·
 *    kırpma YOK · iletişim satırı · PNG doğrulama
 *  B null / boş markalama → yardımcılar HİÇBİR öğe üretmez
 *  C logo ölçekleme (oran korunur, büyütülmez)
 *  D varyant A/B/C içerikleri (gerçek DOCX'e paketlenip XML'den okunur)
 *  E HD kuralı: omitName → ad yazılmaz
 *  F ortak buildFooter: brandLine yok/null → XML birebir
 *  G Kademe A kurucuları: branding null ≡ alan hiç verilmemiş (normalize parça eşitliği)
 *
 * Çalıştır: npx tsx scripts/expert-branding/expertBranding.harness.ts
 */
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import sharp from "sharp";
import {
  DEFAULT_EXPERT_BRANDING_VARIANT,
  expertBrandingFields,
  expertCoverBlock,
  expertCredentialLines,
  expertFooterParagraph,
  expertLogoParagraph,
  expertSignatureBlock,
  fitLogo,
  hasExpertBranding,
  normalizeExpertBranding,
  readPngSize,
  type ExpertBranding,
} from "@/lib/docx/expertBranding";
import { buildFooter, type ReportChild } from "@/lib/docx/reportHelpers";
import { allReportCases } from "./reportCases";
import { normalizeDocx } from "./normalizeDocx";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const section = (t: string) => console.log(`\n── ${t}`);

async function docXml(children: ReportChild[], footer?: ReturnType<typeof buildFooter>): Promise<{ doc: string; footer: string; media: number }> {
  const d = new Document({ sections: [{ footers: footer ? { default: footer } : undefined, children: children.length ? children : [new Paragraph({})] }] });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(d));
  const doc = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const f = Object.keys(zip.files).find((n) => /^word\/footer\d*\.xml$/.test(n));
  return { doc, footer: f ? await zip.file(f)!.async("string") : "", media: Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n]!.dir).length };
}
const text = (xml: string) => Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => m[1]).join("");

async function main() {
  const png = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 15, g: 118, b: 110, alpha: 1 } } }).png().toBuffer();
  const tall = await sharp({ create: { width: 100, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const jpg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  const FULL = normalizeExpertBranding({
    name: "  Ayşe   Yılmaz ", title: "Refleksoloji Uzmanı", organization: "Ayşe Yılmaz Yaşam Merkezi",
    phone: "+90 5xx xxx xx xx (sahte)", email: "ayse@example.invalid", website: "www.ornek.example",
    note: "Birinci satır\r\n\r\n\r\n\r\nİkinci   satır", logoPng: png,
  })!;

  section("A normalize");
  ok("A1 null / undefined / nesne değil → null", normalizeExpertBranding(null) === null && normalizeExpertBranding(undefined) === null && normalizeExpertBranding("x" as never) === null);
  ok("A2 tüm alanlar boş / boşluk / kontrol karakteri → null", normalizeExpertBranding({ name: " ", title: "\u0001\u0002", organization: "", note: "\n \n", phone: "", logoPng: null }) === null);
  ok("A3 iç boşluklar sadeleşir, kenarlar kırpılır", FULL.name === "Ayşe Yılmaz");
  ok("A4 iletişim satırı telefon · e-posta · site", FULL.contactLine === "+90 5xx xxx xx xx (sahte) · ayse@example.invalid · www.ornek.example");
  ok("A5 dipnot: satır sonları korunur, 3+ boş satır → 1 boş satır", FULL.note === "Birinci satır\n\nİkinci satır");
  ok("A6 PNG logo boyutu IHDR'den", FULL.logoPng?.width === 600 && FULL.logoPng?.height === 200);
  ok("A7 PNG olmayan logo (JPEG / çöp) yok sayılır", !normalizeExpertBranding({ name: "x", logoPng: jpg })!.logoPng && !normalizeExpertBranding({ name: "x", logoPng: Buffer.from("not a png") })!.logoPng);
  ok("A8 yalnız logo → markalama var", hasExpertBranding(normalizeExpertBranding({ logoPng: png })));
  const dirty = normalizeExpertBranding({ name: "A\u0000y\u001Fşe 🌿 \uD800x\uDC00 İĞÜŞÖÇ" })!;
  ok("A9 kontrol karakteri + yalnız vekil temizlenir; emoji + Türkçe korunur", dirty.name === "Ayşe 🌿 x İĞÜŞÖÇ", JSON.stringify(dirty.name));
  const long = "Kurum ".repeat(200).trim();
  ok("A10 uzunluk KIRPILMAZ", normalizeExpertBranding({ organization: long })!.organization === long);
  ok("A11 hazır contactLine önceliklidir", normalizeExpertBranding({ contactLine: "tek satır", phone: "123" })!.contactLine === "tek satır");
  ok("A12 readPngSize geçersiz → null", readPngSize(Buffer.alloc(10)) === null && readPngSize(jpg) === null);
  ok("A13 varsayılan varyant tek ve sabit (B)", DEFAULT_EXPERT_BRANDING_VARIANT === "B");

  section("B null / boş → öğe yok");
  const empties: (ExpertBranding | null | undefined)[] = [null, undefined, {}, { name: " ", note: "" }];
  for (const [i, e] of empties.entries()) {
    ok(`B${i + 1} kapak/imza/alt bilgi/logo/kimlik yardımcıları boş`, expertCoverBlock(e).length === 0 && expertSignatureBlock(e).length === 0
      && expertFooterParagraph(e) === null && expertLogoParagraph(e) === null && expertCredentialLines(e).length === 0 && expertBrandingFields(e) === null
      && (["A", "B", "C"] as const).every((v) => expertCoverBlock(e, { variant: v, fallbackName: "X" }).length === 0 && expertSignatureBlock(e, { variant: v, fallbackName: "X" }).length === 0));
  }

  section("C logo ölçekleme");
  const s1 = fitLogo({ data: png, width: 600, height: 200 }, 150, 60);
  ok("C1 yatay logo kutuya sığar, oran korunur", s1.width === 150 && s1.height === 50);
  const s2 = fitLogo({ data: tall, width: 100, height: 400 }, 150, 60);
  ok("C2 dikey logo yükseklikle sınırlanır", s2.height === 60 && s2.width === 15);
  const s3 = fitLogo({ data: png, width: 40, height: 20 }, 150, 60);
  ok("C3 küçük logo BÜYÜTÜLMEZ", s3.width === 40 && s3.height === 20);

  section("D varyantlar");
  const A = await docXml(expertCoverBlock(FULL, { variant: "A" }));
  ok("D1 A kapak: etiket + ad + unvan + kurum + iletişim + logo", ["Hazırlayan Uzman", "Ayşe Yılmaz", "Refleksoloji Uzmanı", "Ayşe Yılmaz Yaşam Merkezi", "ayse@example.invalid"].every((t) => text(A.doc).includes(t)) && A.media === 1);
  const Bc = await docXml(expertCoverBlock(FULL, { variant: "B" }));
  ok("D2 B kapak: ad · unvan + kurum; logo/iletişim YOK", text(Bc.doc).includes("Ayşe Yılmaz") && text(Bc.doc).includes("Refleksoloji Uzmanı") && text(Bc.doc).includes("Yaşam Merkezi") && !text(Bc.doc).includes("example.invalid") && Bc.media === 0);
  const Cc = await docXml(expertCoverBlock(FULL, { variant: "C" }));
  ok("D3 C kapak: ad — unvan (+ küçük logo); kurum/iletişim YOK", text(Cc.doc).includes("Ayşe Yılmaz — Refleksoloji Uzmanı") && !text(Cc.doc).includes("Yaşam Merkezi") && Cc.media === 1);
  const Bs = await docXml(expertSignatureBlock(FULL, { variant: "B" }));
  ok("D4 B imza: kart tablosu + logo + İmza alanı + iletişim + dipnot", Bs.doc.includes("<w:tbl>") && Bs.media === 1 && ["Hazırlayan", "İmza", "ayse@example.invalid", "Uzman Notu", "Birinci satır"].every((t) => text(Bs.doc).includes(t)));
  const As = await docXml(expertSignatureBlock(FULL, { variant: "A" }));
  ok("D5 A imza: metin satırları (tablo/logo YOK) + dipnot", !As.doc.includes("<w:tbl>") && As.media === 0 && text(As.doc).includes("Hazırlayan: Ayşe Yılmaz") && text(As.doc).includes("Refleksoloji Uzmanı · Ayşe Yılmaz Yaşam Merkezi"));
  const Cs = await docXml(expertSignatureBlock(FULL, { variant: "C" }));
  ok("D6 C imza: tek satır ad — unvan + dipnot", text(Cs.doc).includes("Hazırlayan: Ayşe Yılmaz — Refleksoloji Uzmanı") && !Cs.doc.includes("<w:tbl>") && text(Cs.doc).includes("Uzman Notu"));
  const onlyNote = await docXml(expertSignatureBlock({ note: "Yalnız not" }, { variant: "C" }));
  ok("D7 yalnız dipnot → yalnız 'Uzman Notu' (Hazırlayan satırı YOK)", text(onlyNote.doc).includes("Yalnız not") && !text(onlyNote.doc).includes("Hazırlayan"));
  const fb = await docXml(expertSignatureBlock({ title: "Unvan X" }, { variant: "A", fallbackName: "Profil Adı" }));
  ok("D8 profil adı yoksa fallbackName (mevcut Hazırlayan değeri) kullanılır", text(fb.doc).includes("Hazırlayan: Profil Adı") && text(fb.doc).includes("Unvan X"));
  ok("D9 alt bilgi: A/B kurum satırı, C → yok", text((await docXml([expertFooterParagraph(FULL, { variant: "A" })!])).doc) === "Ayşe Yılmaz Yaşam Merkezi" && expertFooterParagraph(FULL, { variant: "C" }) === null);
  ok("D10 alt bilgi: kurum yoksa ad · unvan", text((await docXml([expertFooterParagraph({ name: "Ad", title: "Unvan" })!])).doc) === "Ad · Unvan");
  const esc = await docXml(expertSignatureBlock({ name: "<script>x</script> & 🌿" }, { variant: "A" }));
  ok("D11 özel karakterler kaçışlı düz metin", esc.doc.includes("&lt;script&gt;x&lt;/script&gt; &amp; 🌿") && !esc.doc.includes("<script>"));

  section("E HD kuralı (omitName)");
  const hdCover = await docXml(expertCoverBlock(FULL, { variant: "A", omitName: true }));
  const hdSig = await docXml(expertSignatureBlock(FULL, { variant: "B", omitName: true }));
  ok("E1 omitName → profil adı yazılmaz (kapak + imza)", !text(hdCover.doc).includes("Ayşe Yılmaz Hazırlayan") && !/>Ayşe Yılmaz</.test(hdCover.doc) && !/>Ayşe Yılmaz</.test(hdSig.doc));
  ok("E2 kimlik satırları yalnız unvan + kurum", text((await docXml(expertCredentialLines(FULL))).doc) === "Refleksoloji UzmanıAyşe Yılmaz Yaşam Merkezi");

  section("F ortak buildFooter");
  const f0 = await docXml([], buildFooter("Rapor", { note: "danisan" }));
  const f1 = await docXml([], buildFooter("Rapor", { note: "danisan", brandLine: null }));
  const f2 = await docXml([], buildFooter("Rapor", { note: "danisan", brandLine: expertFooterParagraph(FULL) }));
  ok("F1 brandLine yok / null → footer XML birebir", f0.footer === f1.footer && f0.footer.length > 0);
  ok("F2 brandLine → kurum satırı not ile sayfa numarası arasında", text(f2.footer).indexOf("Yaşam Merkezi") > text(f2.footer).indexOf("tıbbi") && text(f2.footer).indexOf("Yaşam Merkezi") < text(f2.footer).indexOf("Sayfa"));

  section("G Kademe A kurucuları: null ≡ verilmemiş");
  for (const c of await allReportCases()) {
    const a = await normalizeDocx(await c.render({ branding: null }));
    const b = await normalizeDocx(await c.render({} as never));
    ok(`G ${c.name}: branding null ≡ alan yok`, JSON.stringify(a) === JSON.stringify(b));
  }

  if (fails.length) console.log("\nFAILURES:\n" + fails.map((f) => `  - ${f}`).join("\n"));
  console.log(`\nF3A expertBranding: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
