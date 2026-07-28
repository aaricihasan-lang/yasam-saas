/**
 * NKB-V2 — Kişi/analiz Word raporu docx içerik üretimi (server-only; route + kabul testi ortak).
 * İçerik ekrandaki gerçek sekmelerle BİREBİR: buildPlainAnalizFull, kayıtlı summary, Bilgi Bankası
 * yorumları + kaynak notları, taş atamaları, gerçek görsel PNG. İliski/Ev-İş kayıtlı içerik taşımaz.
 */

import { Document, Packer } from "docx";
import {
  bodyText,
  buildFooter,
  embedImageParagraph,
  fieldInline,
  h1Colored,
  h3,
  muted,
  spacer,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  WORD_TAB_LABELS,
  WORD_TAB_ORDER,
  personSourceNotesForRecords,
  tabCanHaveSavedContent,
  type MatchedNoteRef,
  type PersonSourceNoteGroup,
  type WordPersonSections,
  type WordTabKey,
} from "./wordPersonSections";
import { buildKnowledgeLookupPlan, pickNotesForType, type KnowledgeNote } from "./knowledgeLookup";
import { noteHeading, resolveNoteSectionsForView } from "./noteLogic";
import type { SourceEntryRow } from "./sourceEntryUiLogic";
import type { KnowledgeRecordRow } from "./bilgiBankaKayit";
import { extractMotorFromAnalysisJson, extractSummaryFromAnalysisData } from "../../utils/analysisJson";
import { buildPlainAnalizFull } from "../../utils/numerolojiPlainMetin";

const C_NR = "4c1d95";

const ANALIZ_LABELS: Record<string, string> = {
  "ana-kulvar": "Ana Kulvar",
  "yan-kulvar": "Yan Kulvar",
  "ifade-sayisi": "İfade Sayısı",
  "hayat-yolu": "Hayat Yolu",
  "cakra-omurga": "Çakra Omurga",
  element: "Element",
  diger: "Diğer",
};
const analizLabel = (k: string): string => ANALIZ_LABELS[k] ?? k;

export type WordRecordRow = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  analysis_data: unknown;
  created_at: string;
};

export type WordStoneRow = { id: string; analysis_type: string; value: string; reason: string | null; stones: unknown };

export type WordSharedData = {
  knowledgeRows: KnowledgeRecordRow[];
  entries: SourceEntryRow[];
  sourceLabelById: Map<string, string>;
  stoneRows: WordStoneRow[];
};

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

/** data:image/...;base64,XXXX → Buffer (yalnız görsel data-URL). */
export function dataUrlToBuffer(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  try {
    const buf = Buffer.from(m[1]!, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function knowledgeNoteText(note: KnowledgeNote): { label: string; body: string }[] {
  return resolveNoteSectionsForView(note).map((s) => ({ label: s.label, body: (s.body || "").trim() }));
}

/** Bir kişinin seçilen sekmelerini sadık içerikle üretir; boş sekmeleri atlar + raporlar. */
export function buildPersonSections(
  row: WordRecordRow,
  sections: WordPersonSections,
  shared: WordSharedData,
  gorselBuf: Buffer | null,
): { children: ReportChild[]; emptyTabs: WordTabKey[] } {
  const children: ReportChild[] = [];
  const emptyTabs: WordTabKey[] = [];
  const motor = extractMotorFromAnalysisJson(row.analysis_data);
  const summary = extractSummaryFromAnalysisData(row.analysis_data);

  const matchedNotes: KnowledgeNote[] = [];
  if (motor && sections.detailed) {
    const seen = new Set<string>();
    for (const p of buildKnowledgeLookupPlan(motor)) {
      for (const nt of pickNotesForType(shared.knowledgeRows, p.analysisType, p.values, seen)) {
        matchedNotes.push(nt);
      }
    }
  }

  const addSection = (tab: WordTabKey, blocks: ReportChild[]) => {
    if (blocks.length === 0) {
      emptyTabs.push(tab);
      return;
    }
    children.push(muted(WORD_TAB_LABELS[tab]));
    for (const b of blocks) children.push(b);
  };

  for (const tab of WORD_TAB_ORDER) {
    if (!sections[tab]) continue;

    if (!tabCanHaveSavedContent(tab)) {
      emptyTabs.push(tab); // İlişki / Ev-İş: canlı giriş gerekir → kayıtlı içerik yok
      continue;
    }

    if (tab === "summary") {
      addSection(tab, summary ? [bodyText(summary)] : []);
    } else if (tab === "plain") {
      const txt = motor ? buildPlainAnalizFull(motor).trim() : "";
      addSection(tab, txt ? [bodyText(txt)] : []);
    } else if (tab === "detailed") {
      const blocks: ReportChild[] = [];
      const base = motor ? buildPlainAnalizFull(motor).trim() : "";
      if (base) blocks.push(bodyText(base));
      const matchedRefs: MatchedNoteRef[] = matchedNotes.map((n) => ({ id: n.id, analysisType: n.analysisType, value: n.value }));
      const noteGroups: PersonSourceNoteGroup[] = personSourceNotesForRecords(matchedRefs, shared.entries, shared.sourceLabelById);
      const groupById = new Map(noteGroups.map((g) => [g.ref.id, g]));
      const yorumBlocks: ReportChild[] = [];
      for (const note of matchedNotes) {
        const secs = knowledgeNoteText(note).filter((s) => s.body !== "");
        const grp = groupById.get(note.id);
        if (secs.length === 0 && (!grp || grp.notes.length === 0)) continue;
        yorumBlocks.push(h3(noteHeading(note.analysisType, note.value)));
        for (const s of secs) yorumBlocks.push(bodyText(s.label ? `${s.label}: ${s.body}` : s.body, 20));
        if (grp) for (const nt of grp.notes) yorumBlocks.push(bodyText(`[${nt.label}] ${nt.body.trim()}`, 20));
      }
      if (yorumBlocks.length > 0) {
        blocks.push(muted("Bilgi Bankası Yorumları"));
        blocks.push(...yorumBlocks);
      }
      addSection(tab, blocks);
    } else if (tab === "tas") {
      const blocks: ReportChild[] = [];
      if (motor) {
        const seen = new Set<string>();
        for (const p of buildKnowledgeLookupPlan(motor)) {
          for (const value of p.values) {
            const st = shared.stoneRows.find((s) => s.analysis_type === p.analysisType && s.value === value);
            if (!st) continue;
            const key = `${st.analysis_type}::${st.value}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const stones = parseStones(st.stones);
            if (!st.reason?.trim() && stones.length === 0) continue;
            blocks.push(h3(`${analizLabel(st.analysis_type)} — ${st.value}`));
            if (st.reason?.trim()) blocks.push(bodyText(st.reason.trim(), 20));
            if (stones.length > 0) blocks.push(bodyText(`Taşlar: ${stones.join(", ")}`, 20));
          }
        }
      }
      addSection(tab, blocks);
    } else if (tab === "gorsel") {
      addSection(tab, gorselBuf ? [embedImageParagraph(gorselBuf, 620)] : []);
    }
  }

  return { children, emptyTabs };
}

/** Tüm kişiler için docx child listesi + boş sekmeler + içerik var mı. Gereksiz kapak/özet/TOC YOK. */
export function buildNumerolojiWordChildren(
  rows: WordRecordRow[],
  sections: WordPersonSections,
  shared: WordSharedData,
  gorselBuf: Buffer | null,
): { children: ReportChild[]; emptyTabs: WordTabKey[]; anyContent: boolean } {
  const isSingle = rows.length === 1;
  const all: ReportChild[] = [];
  const emptyTabSet = new Set<WordTabKey>();
  let anyContent = false;

  rows.forEach((row, i) => {
    const adSoyad = `${row.name} ${row.surname}`.trim() || "—";
    all.push(h1Colored(i === 0 ? "Yaşam Sistemi — Numeroloji Raporu" : `${i + 1}. ${adSoyad}`, C_NR, i > 0));
    if (i === 0 && isSingle) all.push(h3(adSoyad));
    else if (i === 0 && !isSingle) all.push(h3(adSoyad));
    all.push(fieldInline("Doğum Tarihi", row.birth_date || "—"));
    all.push(fieldInline("Analiz Tarihi", new Date(row.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })));
    all.push(spacer());

    const { children, emptyTabs } = buildPersonSections(row, sections, shared, gorselBuf);
    for (const t of emptyTabs) emptyTabSet.add(t);
    if (children.length > 0) {
      anyContent = true;
      all.push(...children);
    }
  });

  return { children: all, emptyTabs: Array.from(emptyTabSet), anyContent };
}

/** docx child listesini gerçek .docx buffer'ına paketler. */
export async function packNumerolojiDocx(children: ReportChild[], nowStr: string): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Numeroloji Raporu · Yaşam Sistemi") },
      children: [...children, spacer(), muted(`Oluşturma: ${nowStr}`)],
    }],
  });
  return Packer.toBuffer(doc);
}
