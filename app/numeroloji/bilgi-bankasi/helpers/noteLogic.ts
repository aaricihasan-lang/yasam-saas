/**
 * NKB-V2-H — Danışan analiz yorumu + liste özeti SAF mantığı (DB/React yok; harness ile test).
 * content_sections canonical; kulvar dışı türlerde legacy description korunur.
 * source/display_label/bibliyografik/internal_note DANIŞAN görünümüne GİRMEZ.
 */
import { analizTuruLabel } from "./bilgiBankaLabels";
import { isKulvarAnalysisType } from "./knowledgeSections";
import { kulvarSectionsForWord } from "./wordKulvarLogic";

export type ViewSection = { label: string; body: string };

/** Yorum kartı başlığı: "Ana Kulvar — 19", "Yan Kulvar — 8". */
export function noteHeading(analysisType: string, value: string): string {
  return `${analizTuruLabel(analysisType)} — ${value}`;
}

/**
 * Bir notu danışan görünümü bölümlerine çözer:
 *  - ana/yan kulvar: content_sections KANONİK sıra + yalnız DOLU bölümler; yoksa legacy overview.
 *  - diğer türler: legacy description tek bölüm (label boş → alt başlık gösterilmez).
 * Boş bölümler dışlanır; content_sections varsa description tekrarlanmaz.
 */
export function resolveNoteSectionsForView(note: {
  analysisType: string;
  content_sections?: unknown;
  description?: string | null;
}): ViewSection[] {
  if (isKulvarAnalysisType(note.analysisType)) {
    return kulvarSectionsForWord({ content_sections: note.content_sections, description: note.description ?? null });
  }
  const d = (note.description ?? "").trim();
  return d ? [{ label: "", body: note.description as string }] : [];
}

function snippet(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Liste "Bilgi Kaynağı / Açıklama" özeti. Öncelik:
 *  1) yapılandırılmış kaynak display_label
 *  2) content_sections Genel Açıklama (overview) snippet
 *  3) legacy source/description (mevcut davranış korunur)
 *  4) "—"
 * internal_note / tam bibliyografik alan ASLA girmez.
 */
export function buildListSummary(
  input: {
    displayLabels?: string[] | null;
    content_sections?: unknown;
    source?: string | null;
    description?: string | null;
  },
  maxLen = 140,
): string {
  const dl = (input.displayLabels ?? []).filter((x): x is string => typeof x === "string" && x.trim() !== "");
  if (dl.length) return dl.join(", ");

  const cs = input.content_sections;
  if (Array.isArray(cs)) {
    const ov = cs.find((s) => s && typeof s === "object" && (s as { key?: unknown }).key === "overview") as
      | { body?: unknown }
      | undefined;
    const body = ov && typeof ov.body === "string" ? ov.body.trim() : "";
    if (body) return snippet(body, maxLen);
  }

  const legacy = [input.source, input.description]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" — ");
  return legacy ? snippet(legacy, maxLen) : "—";
}
