/**
 * KAMPANYA MERKEZİ — D-2: Klasik Numeroloji UYUM ve İŞLETME ADI raporlarının YORUMSUZ (nesnel) Word sürümü. YALNIZ SUNUCU.
 *
 * Uzman kurucuları (buildRelationshipReport / buildBusinessReport) yorum kapalı veride de değerlendirme kartı ("Değerlendirme",
 * renkli rozet), "Uğurlu bileşik", "Uygun sektörler", boş "Yorum" başlıkları basar; uzman koduna dokunmamak için yorum
 * KAPALI iken kampanya bu iki raporu uzman tasarım ögeleriyle (primitives) yalnız NESNEL veriden kurar: girdi, hesaplanan sayılar,
 * adım adım hesap, bağımsız doğrulama, yöntem notu, bilgilendirme. Uyum puanı / sağlayıcı değerlendirmesi / nitelik / gezegen
 * yorumu YOK (Bütüncül ilişki ekranıyla aynı kural: yorum kapalıyken genel puan gösterilmez).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { Document, Packer, type Paragraph, type Table } from "docx";
import { CLASSIC_REPORT_DISCLAIMER, CLASSIC_REPORT_FOOTER } from "@/lib/numeroloji-klasik/report/docx";
import { BODY, FONT, INDIGO, S_BODY, S_SMALL, SECONDARY, coverPage, dataTable, kvTable, noteBox, para, runningFooter, runningHeader, sectionHeading, spacer } from "@/lib/numeroloji-klasik/report/primitives";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import type { BusinessNameResult, CompatibilityResult, Verification } from "@/lib/numeroloji-klasik/model";

assertServerOnly("lib/campaign/visitor/reports/numkObjective");

type Block = Paragraph | Table;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const TR = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const birthTr = (b: unknown) => (isObj(b) && typeof b.day === "number" ? `${String(b.day).padStart(2, "0")}.${String(b.month).padStart(2, "0")}.${b.year}` : "—");
const VER: Record<string, string> = { match: "Bağımsız hesapla aynı", mismatch: "Bağımsız hesapta fark var", unverified: "Bağımsız kontrol yapılamadı" };
const verText = (v: Verification | undefined | null) => VER[v?.status ?? "unverified"] ?? VER.unverified;
const trace = (label: string, calc: unknown): Block[] => (typeof calc === "string" && calc.trim() ? [noteBox(`Nasıl hesaplandı? — ${label}`, [calc.slice(0, 600)])] : []);

function info(): Block[] {
  return [
    sectionHeading("Bilgilendirme"),
    para("Bu rapor, ücretsiz analizde ekranda gösterilen hesap sonucundan aynı anda üretilmiştir; kayıt oluşturulmamıştır. Yorumlar bu kampanyada kapalı olduğundan rapor yalnız hesaplanan değerleri içerir.", { size: S_SMALL, color: SECONDARY }),
    para(wellnessNote("numeroloji").full, { italics: true, size: S_SMALL, color: SECONDARY }),
    para(CLASSIC_REPORT_DISCLAIMER, { italics: true, size: S_SMALL, color: SECONDARY }),
  ];
}

async function pack(children: Block[], title: string): Promise<Buffer> {
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title,
    styles: { default: { document: { run: { font: FONT, size: S_BODY, color: BODY } } } },
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, size: { width: 11906, height: 16838 } } },
      headers: { default: runningHeader(title) },
      footers: { default: runningFooter(CLASSIC_REPORT_FOOTER) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

export async function buildObjectiveRelationshipDocx(input: unknown, c: CompatibilityResult | null, at: Date): Promise<Buffer> {
  const inp = isObj(input) ? input : {};
  const p1 = isObj(inp.person1) ? inp.person1 : {};
  const p2 = isObj(inp.person2) ? inp.person2 : {};
  const n1 = typeof p1.fullName === "string" ? p1.fullName.slice(0, 80) : "1. kişi";
  const n2 = typeof p2.fullName === "string" ? p2.fullName.slice(0, 80) : "2. kişi";
  const children: Block[] = [...coverPage({ heading: "NUMEROLOJİK UYUM — HESAP RAPORU", subtitle: "Pisagor yöntemi · yorumsuz", info: [["1. kişi", `${n1} · ${birthTr(p1.birth)}`], ["2. kişi", `${n2} · ${birthTr(p2.birth)}`], ["Rapor tarihi", TR.format(at)]] })];
  children.push(sectionHeading("Hesaplanan sayılar", true));
  if (c) {
    const pairs = [["Yaşam Yolu", c.lifePath], ["İfade", c.expression], ["Ruh Güdüsü", c.soulUrge]] as const;
    children.push(dataTable(["Sayı", n1, n2], pairs.filter(([, p]) => !!p).map(([l, p]) => [{ text: l, bold: true }, { text: String(p.person1) }, { text: String(p.person2) }]), [34, 33, 33]));
    children.push(spacer(80));
    children.push(kvTable([["Bağımsız kontrol (sayılar)", verText(c.verification)]]));
  } else children.push(para("Bu analizde uyum sonucu bulunmuyor.", { color: SECONDARY }));
  children.push(sectionHeading("Yöntem notu"));
  children.push(para("Yaşam Yolu doğum tarihinden, İfade ve Ruh Güdüsü adın harflerinden Pisagor tablosuyla hesaplanır. Sağlayıcının uyum puanı ve değerlendirmesi yorum kapsamındadır; yorumlar kapalı olduğundan rapora alınmamıştır.", { size: S_SMALL, color: INDIGO }));
  children.push(...info());
  return pack(children, "Numerolojik Uyum — Hesap Raporu");
}

export async function buildObjectiveBusinessDocx(input: unknown, b: BusinessNameResult | null, at: Date): Promise<Buffer> {
  const inp = isObj(input) ? input : {};
  const name = typeof inp.name === "string" ? inp.name.slice(0, 120) : b?.name ?? "—";
  const children: Block[] = [...coverPage({ heading: "İŞLETME ADI — HESAP RAPORU", subtitle: "Kalde yöntemi · yorumsuz", info: [["İşletme adı", name], ["Rapor tarihi", TR.format(at)]] })];
  children.push(sectionHeading("Hesaplanan sayılar", true));
  if (b) {
    children.push(kvTable([
      ["Toplam", String(b.number?.total ?? "—")],
      ["Bileşik sayı", b.number?.compound ? String(b.number.compound) : "—"],
      ["Kök sayı", String(b.number?.root ?? b.number?.value ?? "—")],
      ["Bağımsız kontrol", verText(b.verification ?? b.number?.verification)],
    ]));
    children.push(...trace("İşletme adı (Kalde)", b.number?.calculation));
  } else children.push(para("Bu analizde işletme adı sonucu bulunmuyor.", { color: SECONDARY }));
  children.push(sectionHeading("Yöntem notu"));
  children.push(para("Kalde (Cheiro) yönteminde harflere 1–8 değerleri verilir (9 harfe atanmaz). Harf değerlerinin toplamı bileşik sayıyı, bileşik sayının tek basamağa indirgenmesi kök sayıyı verir. Bileşik sayının adı, niteliği, yönetici gezegeni ve sektör / değerlendirme bilgileri yorum kapsamındadır; yorumlar kapalı olduğundan rapora alınmamıştır.", { size: S_SMALL, color: INDIGO }));
  children.push(...info());
  return pack(children, "İşletme Adı — Hesap Raporu");
}
