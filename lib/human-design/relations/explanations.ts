// İlişki / Grup — ANALİZ AÇIKLAMALARI (Yaşam Sistemi; SAF, deterministik).
//
// Kaynak YALNIZ kayıtlı, doğrulanmış Connection / Penta sonucu + uygulamanın kapı/kanal/merkez sözlükleri.
// Hesaplama servisinin (sağlayıcı) metni DEĞİLDİR ve öyle gösterilmez. Kurallar:
//   • Kim hangi kapıyı taşıyor, hangi kanal nasıl tamamlanıyor, hangi merkez birlikte tanımlanıyor → açık dille.
//   • İlişki başarısı, evlilik/uyum tahmini, yüzde, puan, kaynağa dayanmayan psikolojik çıkarım ÜRETİLMEZ.

import { hdCenterLabelFromCode } from "../codeHelpers";
import { GATE_TECHNICAL_DATA } from "../gateTechnicalData";
import type { HdConnectionResult } from "./connection";
import { channelCenterCodes } from "./connection";
import type { HdPentaResult } from "./penta";
import { combinedDefinitionLabel, DYNAMIC_DEFINITION, DYNAMIC_LABEL, DYNAMIC_ORDER, PENTA_CORE_NOTE, PENTA_GAP_NOTE, PENTA_POSITION_DEFINITION, PENTA_POSITION_LABEL, relationChannelLabel } from "./labels";

export type ExplanationItem = { title: string; text: string };
export type ExplanationSection = { key: string; title: string; items: ExplanationItem[] };

export const ANALYSIS_EXPLANATION_SOURCE = "Yaşam Sistemi analiz açıklaması — kayıtlı ve doğrulanmış sonuçtan üretilmiştir.";
export const ANALYSIS_EXPLANATION_DISCLAIMER =
  "Bu açıklamalar Human Design mekaniklerini tarif eder; ilişki ya da grup için başarı, uyum yüzdesi veya kesin sonuç tahmini değildir.";

const short = (code: Parameters<typeof hdCenterLabelFromCode>[0]) => hdCenterLabelFromCode(code).replace(/\s*\(.*\)$/, "");
function gateText(g: number): string {
  const info = GATE_TECHNICAL_DATA[g]?.kisa_bilgi;
  return info ? `${g}. kapı (${info.replace(/\s*kapısı$/i, "")})` : `${g}. kapı`;
}
function listTr(a: string[]): string {
  return a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} ve ${a[a.length - 1]}`;
}

export function connectionExplanations(r: HdConnectionResult, nameA: string, nameB: string): ExplanationSection[] {
  const out: ExplanationSection[] = [];
  const counts = DYNAMIC_ORDER.map((d) => `${DYNAMIC_LABEL[d]}: ${r.summary[d.toLowerCase() as keyof HdConnectionResult["summary"]]}`).join(" · ");
  out.push({
    key: "summary",
    title: "Genel Bakış",
    items: [
      {
        title: "Bağlantı sayıları",
        text: `${nameA} ile ${nameB} birlikte ${r.totalChannels} kanalı tamamlıyor (${counts}). Birleşik haritanın tanımı: ${combinedDefinitionLabel(r.combinedDefinition)}.`,
      },
    ],
  });
  for (const d of DYNAMIC_ORDER) {
    const list = r.channels.filter((c) => c.dynamic === d);
    if (!list.length) continue;
    out.push({
      key: `dyn-${d}`,
      title: `${DYNAMIC_LABEL[d]} — ${list.length}`,
      items: list.map((c) => {
        const cc = channelCenterCodes(c.id);
        const centers = cc ? `${short(cc[0])} ile ${short(cc[1])}` : "iki merkez";
        const a = c.personAGates.map(gateText);
        const b = c.personBGates.map(gateText);
        let how: string;
        if (d === "Electromagnetic") how = `${nameA} ${listTr(a)}, ${nameB} ${listTr(b)} taşıyor; kanal yalnız ikisi bir aradayken tamamlanıyor.`;
        else if (d === "Companionship") how = `İkisi de bu kanalın iki kapısını (${listTr(a)}) kendi haritasında taşıyor.`;
        else {
          const full = c.personAGates.length === 2 ? nameA : nameB;
          const other = full === nameA ? nameB : nameA;
          const otherGates = full === nameA ? b : a;
          how = d === "Dominance"
            ? `Kanalın tamamı ${full} tarafından taşınıyor; ${other} bu kanalın hiçbir kapısını taşımıyor.`
            : `Kanalın tamamı ${full} tarafından taşınıyor; ${other} yalnız ${listTr(otherGates)} taşıyor.`;
        }
        return { title: relationChannelLabel(c.id, c.name), text: `${how} Kanal ${centers} merkezlerini birleşik haritada tanımlar. (${DYNAMIC_DEFINITION[d]})` };
      }),
    });
  }
  const newly = r.centers.filter((c) => c.defined && c.definedBy.length === 0);
  const fromOne = r.centers.filter((c) => c.defined && c.definedBy.length === 1);
  const both = r.centers.filter((c) => c.definedBy.length === 2);
  const open = r.centers.filter((c) => !c.defined);
  const items: ExplanationItem[] = [];
  if (newly.length) items.push({ title: "Yalnız birlikteyken tanımlanan merkezler", text: `${listTr(newly.map((c) => short(c.code)))}: iki kişinin de kendi haritasında tanımlı değil; birleşik haritada tanımlı.` });
  if (fromOne.length) items.push({ title: "Bir kişinin tanımladığı merkezler", text: fromOne.map((c) => `${short(c.code)} — ${c.definedBy[0] === "A" ? nameA : nameB}`).join("; ") + "." });
  if (both.length) items.push({ title: "İkisinde de tanımlı merkezler", text: `${listTr(both.map((c) => short(c.code)))}.` });
  if (open.length) items.push({ title: "Birleşik haritada tanımlı olmayan merkezler", text: `${listTr(open.map((c) => short(c.code)))}.` });
  if (items.length) out.push({ key: "centers", title: "Birleşik Merkezler", items });
  return out;
}

export function pentaExplanations(r: HdPentaResult, names: string[]): ExplanationSection[] {
  const who = (idx: number[]) => listTr(idx.map((i) => names[i] ?? `${i + 1}. üye`));
  const out: ExplanationSection[] = [];
  out.push({
    key: "summary",
    title: "Genel Bakış",
    items: [
      { title: "Grup yapısı", text: `${r.memberCount} kişilik grupta 6 Penta kanalından ${r.summary.definedChannels}'i tanımlı (güçlü yön), 12 Penta kapısından ${r.summary.filledGates}'i dolu.` },
      { title: "2/14 çekirdek", text: `${r.summary.coreDefined ? "Çekirdek kanal grupta tanımlı." : "Çekirdek kanal grupta tanımlı değil."} ${PENTA_CORE_NOTE}` },
    ],
  });
  for (const pos of ["upper", "lower"] as const) {
    out.push({
      key: `penta-${pos}`,
      title: PENTA_POSITION_LABEL[pos],
      items: r.channels.filter((c) => c.position === pos).map((c) => ({
        title: relationChannelLabel(c.id, c.name) + (c.isCore ? " · çekirdek" : ""),
        text: c.defined
          ? `Güçlü yön: ${gateText(c.gateA)} ${who(c.gateAHeldBy)} tarafından, ${gateText(c.gateB)} ${who(c.gateBHeldBy)} tarafından taşınıyor. (${PENTA_POSITION_DEFINITION[pos]})`
          : `Boşluk var: ${[c.gateAHeldBy.length ? `${gateText(c.gateA)} ${who(c.gateAHeldBy)} tarafından taşınıyor` : `${gateText(c.gateA)} kimsede yok`, c.gateBHeldBy.length ? `${gateText(c.gateB)} ${who(c.gateBHeldBy)} tarafından taşınıyor` : `${gateText(c.gateB)} kimsede yok`].join("; ")}.`,
      })),
    });
  }
  const gaps = r.gates.filter((g) => !g.filled);
  out.push({
    key: "gaps",
    title: "Eksik İşlevler (Boşluk Kapıları)",
    items: gaps.length
      ? gaps.map((g) => ({ title: gateText(g.gate), text: `Grupta hiçbir üye bu kapıyı taşımıyor. ${PENTA_GAP_NOTE}` }))
      : [{ title: "Boşluk yok", text: "12 Penta kapısının tamamı en az bir üye tarafından taşınıyor." }],
  });
  out.push({
    key: "members",
    title: "Üye Katkıları",
    items: names.map((n, i) => {
      const gates = r.gates.filter((g) => g.heldBy.includes(i)).map((g) => gateText(g.gate));
      return { title: `${i + 1}. ${n}`, text: gates.length ? `Gruba ${listTr(gates)} ile katkı veriyor.` : "Penta kapılarından hiçbirini taşımıyor." };
    }),
  });
  return out;
}
