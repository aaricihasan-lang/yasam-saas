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
import type { ConnectionDynamic } from "./connection";
import type { HdCenterCode } from "../types";
import { toAppDefinitionCode } from "../normalize/hdAppCodes";
import { localeTranslator } from "@/lib/i18n/serverMessages";

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

/** Açıklama dili (I18N). "tr" = bugünkü Türkçe üretim BİREBİR (Word raporu ve mevcut ekran); diğerleri katalogdan. */
export type ExplanationLang = "tr" | "en";

export function connectionExplanations(r: HdConnectionResult, nameA: string, nameB: string, lang: ExplanationLang = "tr"): ExplanationSection[] {
  if (lang !== "tr") return connectionExplanationsWith(explainKit(lang), r, nameA, nameB);
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

export function pentaExplanations(r: HdPentaResult, names: string[], lang: ExplanationLang = "tr"): ExplanationSection[] {
  if (lang !== "tr") return pentaExplanationsWith(explainKit(lang), r, names);
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

// ─── Dil kataloğu ile üretim (I18N-F1-R5 HD) ─────────────────────────────────────────────────────────────────
// Aynı kurallar ve aynı sıra; metin kalıpları hd.relations.explain, terimler hd.terms / hd.relations katalogundan.
// TR katalog kalıpları yukarıdaki Türkçe üretimin eşdeğeridir (scripts/hd-i18n/relations-catalog.harness.ts
// fixture'larda TR katalog üretimi = Türkçe üretim olduğunu doğrular); TR ekranı / Word yine yukarıdaki kodu kullanır.

type Txt = (key: string, values?: Record<string, string | number>) => string;
export type ExplainKit = {
  t: Txt;
  dynamic: (d: ConnectionDynamic) => string;
  dynamicDef: (d: ConnectionDynamic) => string;
  pentaPosition: (p: "upper" | "lower") => string;
  pentaPositionDef: (p: "upper" | "lower") => string;
  coreNote: string;
  gapNote: string;
  shortCenter: (c: HdCenterCode) => string;
  channel: (id: string, fallbackName: string) => string;
  definition: (kind: string) => string;
  gate: (g: number) => string;
};

/** Dil için açıklama araç takımı (sunucu; istisna fırlatmaz — çevirici kaynak dile düşer). */
export function explainKit(lang: ExplanationLang): ExplainKit {
  const t = localeTranslator(lang, "hd.relations.explain");
  const rel = localeTranslator(lang, "hd.relations");
  const terms = localeTranslator(lang, "hd.terms");
  const term = (k: string, fallback: string) => (terms.has(k) ? terms(k) : fallback);
  const isTr = lang === "tr";
  return {
    t,
    dynamic: (d) => rel(`dynamic.${d}`),
    dynamicDef: (d) => rel(`dynamicDef.${d}`),
    pentaPosition: (p) => rel(`pentaPosition.${p}`),
    pentaPositionDef: (p) => rel(`pentaPositionDef.${p}`),
    coreNote: rel("note.pentaCore"),
    gapNote: rel("note.pentaGap"),
    shortCenter: (c) => (isTr ? short(c) : term(`center.${c}`, c).replace(/\s*\(.*\)$/, "")),
    channel: (id, fallbackName) => {
      if (isTr) return relationChannelLabel(id, fallbackName);
      const l = term(`channel.${id}`, id);
      return l && l !== id ? l : `${id} ${fallbackName}`;
    },
    definition: (kind) => {
      if (isTr) return combinedDefinitionLabel(kind);
      const code = toAppDefinitionCode(kind);
      return code ? term(`definition.${code}`, kind) : kind;
    },
    // Kapı kısa adları (gateTechnicalData) yalnız Türkçe → diğer dillerde yalnız numara (uydurma ad yok).
    gate: (g) => {
      const info = isTr ? GATE_TECHNICAL_DATA[g]?.kisa_bilgi : undefined;
      return info ? t("gateNamed", { g, name: info.replace(/\s*kapısı$/i, "") }) : t("gate", { g });
    },
  };
}

function listWith(k: ExplainKit, a: string[]): string {
  return a.length <= 1 ? a.join("") : k.t("listAnd", { head: a.slice(0, -1).join(", "), last: a[a.length - 1] });
}

export function connectionExplanationsWith(k: ExplainKit, r: HdConnectionResult, nameA: string, nameB: string): ExplanationSection[] {
  const { t } = k;
  const out: ExplanationSection[] = [];
  const counts = DYNAMIC_ORDER.map((d) => `${k.dynamic(d)}: ${r.summary[d.toLowerCase() as keyof HdConnectionResult["summary"]]}`).join(" · ");
  out.push({
    key: "summary",
    title: t("overview"),
    items: [{ title: t("countsTitle"), text: t("countsText", { nameA, nameB, total: r.totalChannels, counts, definition: k.definition(r.combinedDefinition) }) }],
  });
  for (const d of DYNAMIC_ORDER) {
    const list = r.channels.filter((c) => c.dynamic === d);
    if (!list.length) continue;
    out.push({
      key: `dyn-${d}`,
      title: `${k.dynamic(d)} — ${list.length}`,
      items: list.map((c) => {
        const cc = channelCenterCodes(c.id);
        const centers = cc ? t("centersPair", { a: k.shortCenter(cc[0]), b: k.shortCenter(cc[1]) }) : t("twoCenters");
        const a = c.personAGates.map(k.gate);
        const b = c.personBGates.map(k.gate);
        let how: string;
        if (d === "Electromagnetic") how = t("howEm", { nameA, a: listWith(k, a), nameB, b: listWith(k, b) });
        else if (d === "Companionship") how = t("howCompanion", { a: listWith(k, a) });
        else {
          const full = c.personAGates.length === 2 ? nameA : nameB;
          const other = full === nameA ? nameB : nameA;
          const otherGates = full === nameA ? b : a;
          how = d === "Dominance" ? t("howDominance", { full, other }) : t("howCompromise", { full, other, gates: listWith(k, otherGates) });
        }
        return { title: k.channel(c.id, c.name), text: t("channelText", { how, centers, def: k.dynamicDef(d) }) };
      }),
    });
  }
  const newly = r.centers.filter((c) => c.defined && c.definedBy.length === 0);
  const fromOne = r.centers.filter((c) => c.defined && c.definedBy.length === 1);
  const both = r.centers.filter((c) => c.definedBy.length === 2);
  const open = r.centers.filter((c) => !c.defined);
  const items: ExplanationItem[] = [];
  if (newly.length) items.push({ title: t("newlyTitle"), text: t("newlyText", { list: listWith(k, newly.map((c) => k.shortCenter(c.code))) }) });
  if (fromOne.length) items.push({ title: t("fromOneTitle"), text: fromOne.map((c) => `${k.shortCenter(c.code)} — ${c.definedBy[0] === "A" ? nameA : nameB}`).join("; ") + "." });
  if (both.length) items.push({ title: t("bothTitle"), text: `${listWith(k, both.map((c) => k.shortCenter(c.code)))}.` });
  if (open.length) items.push({ title: t("openTitle"), text: `${listWith(k, open.map((c) => k.shortCenter(c.code)))}.` });
  if (items.length) out.push({ key: "centers", title: t("centersSection"), items });
  return out;
}

export function pentaExplanationsWith(k: ExplainKit, r: HdPentaResult, names: string[]): ExplanationSection[] {
  const { t } = k;
  const who = (idx: number[]) => listWith(k, idx.map((i) => names[i] ?? t("member", { n: i + 1 })));
  const out: ExplanationSection[] = [];
  out.push({
    key: "summary",
    title: t("overview"),
    items: [
      { title: t("groupTitle"), text: t("groupText", { count: r.memberCount, defined: r.summary.definedChannels, filled: r.summary.filledGates }) },
      { title: t("coreTitle"), text: `${r.summary.coreDefined ? t("coreDefined") : t("coreUndefined")} ${k.coreNote}` },
    ],
  });
  for (const pos of ["upper", "lower"] as const) {
    out.push({
      key: `penta-${pos}`,
      title: k.pentaPosition(pos),
      items: r.channels.filter((c) => c.position === pos).map((c) => ({
        title: k.channel(c.id, c.name) + (c.isCore ? t("coreSuffix") : ""),
        text: c.defined
          ? t("strongText", { gA: k.gate(c.gateA), whoA: who(c.gateAHeldBy), gB: k.gate(c.gateB), whoB: who(c.gateBHeldBy), def: k.pentaPositionDef(pos) })
          : t("gapText", {
              parts: [
                c.gateAHeldBy.length ? t("carriedBy", { g: k.gate(c.gateA), who: who(c.gateAHeldBy) }) : t("nobodyHas", { g: k.gate(c.gateA) }),
                c.gateBHeldBy.length ? t("carriedBy", { g: k.gate(c.gateB), who: who(c.gateBHeldBy) }) : t("nobodyHas", { g: k.gate(c.gateB) }),
              ].join("; "),
            }),
      })),
    });
  }
  const gaps = r.gates.filter((g) => !g.filled);
  out.push({
    key: "gaps",
    title: t("gapsSection"),
    items: gaps.length
      ? gaps.map((g) => ({ title: k.gate(g.gate), text: t("gapItem", { note: k.gapNote }) }))
      : [{ title: t("noGapTitle"), text: t("noGapText") }],
  });
  out.push({
    key: "members",
    title: t("membersSection"),
    items: names.map((n, i) => {
      const gates = r.gates.filter((g) => g.heldBy.includes(i)).map((g) => k.gate(g.gate));
      return { title: `${i + 1}. ${n}`, text: gates.length ? t("memberGates", { gates: listWith(k, gates) }) : t("memberNone") };
    }),
  });
  return out;
}
