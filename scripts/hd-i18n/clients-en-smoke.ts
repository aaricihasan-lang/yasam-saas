/**
 * I18N-F1-R5 HD — Danışanlar / ortak form bileşenleri: TR çizim kaynak metinle aynı, EN çizimde Türkçe sızıntı yok.
 * Ağ / DB yok. Çalıştırma: npx tsx scripts/hd-i18n/clients-en-smoke.ts
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { GateTechnicalInfo } from "../../app/human-design/components/GateTechnicalInfo";
import { GateKnowledgeNotes } from "../../app/human-design/components/GateKnowledgeNotes";
import { HdBirthDateInput } from "../../app/human-design/components/HdBirthDateInput";
import { HdBirthTimeInput } from "../../app/human-design/components/HdBirthTimeInput";
import trClients from "../../messages/tr/hd.clients.json";
import enClients from "../../messages/en/hd.clients.json";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond || info === undefined ? "" : ` — ${JSON.stringify(info)}`}`);
};
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");

const tech = (l: "tr" | "en") => renderToStaticMarkup(createElement(GateTechnicalInfo, { gates: [1], channels: [] }), l);
ok("TR kapı teknik başlıkları kaynak metin", tech("tr").includes("Kapı Teknik Bilgileri") && tech("tr").includes("Merkez Tipi"));
ok("EN kapı teknik başlıkları İngilizce", tech("en").includes("Gate Technical Details") && tech("en").includes("Center Type") && !tech("en").includes("Kapı Teknik"));

const notes = (l: "tr" | "en") => renderToStaticMarkup(createElement(GateKnowledgeNotes, { groups: [] }), l);
ok("TR bilgi bankası notları boş durum", notes("tr").includes("Bu başlık için henüz Bilgi Bankası yorumu eklenmemiş."));
ok("EN bilgi bankası notları: Türkçe harf yok", !TR_CHARS.test(text(notes("en"))), text(notes("en")));

const date = (l: "tr" | "en") => renderToStaticMarkup(createElement(HdBirthDateInput, { value: "", onChange: () => {} }), l);
const time = (l: "tr" | "en") => renderToStaticMarkup(createElement(HdBirthTimeInput, { value: "", onChange: () => {} }), l);
ok("TR tarih/saat yer tutucu", date("tr").includes('placeholder="GG.AA.YYYY"') && time("tr").includes('placeholder="SS:DD"'));
ok("EN tarih/saat yer tutucu", date("en").includes('placeholder="DD.MM.YYYY"') && time("en").includes('placeholder="HH:MM"'));

// Katalog: TR/EN anahtar ağaçları aynı; EN değerlerde Türkçe harf yalnız marka/özel ad içinde (YAŞAM SİSTEMİ, Selçuklu, Yaşam).
const leaves = (o: unknown, p = "", out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v && typeof v === "object") leaves(v, p ? `${p}.${k}` : k, out);
    else out[p ? `${p}.${k}` : k] = String(v);
  }
  return out;
};
const trL = leaves(trClients);
const enL = leaves(enClients);
ok("hd.clients TR/EN anahtar kümesi eşit", Object.keys(trL).sort().join() === Object.keys(enL).sort().join());
const leak = Object.entries(enL).filter(([, v]) => TR_CHARS.test(v.replace(/YAŞAM SİSTEMİ|Yaşam Sistemi/g, "")));
ok("hd.clients EN değerlerinde Türkçe sızıntı yok (marka hariç)", leak.length === 0, leak);

console.log(`\nHD DANIŞANLAR EN SMOKE: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
