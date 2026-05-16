import { PROTOCOL_CATALOG } from "../data/protocolCatalog";
import type { ProtocolOrgan, ProtocolOrganDraft, ProtocolProblem, ProtocolProblemDraft } from "../types";
import { PROTOCOL_ACCENT_PRESETS } from "../types";

export const PROTOCOL_STORAGE_KEY = "yasam-refleksoloji-protokoller-v1";

function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "protokol";
}

export function createProtocolId(title: string, existingIds: Set<string>): string {
  let id = slugifyTitle(title);
  if (!existingIds.has(id)) return id;
  let n = 2;
  while (existingIds.has(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

export function createOrganId(): string {
  return `organ-${crypto.randomUUID().slice(0, 8)}`;
}

function pickAccentClass(index: number): string {
  return PROTOCOL_ACCENT_PRESETS[index % PROTOCOL_ACCENT_PRESETS.length];
}

export function draftToOrgan(
  draft: ProtocolOrganDraft,
  previous?: ProtocolOrgan,
): ProtocolOrgan {
  return {
    id: draft.id ?? previous?.id ?? createOrganId(),
    name: draft.name.trim(),
    protocolSummary: draft.protocolSummary.trim(),
    applicationNotes: draft.applicationNotes.trim(),
    footView: draft.footView,
    footSide: draft.footSide,
    fallbackRegions: previous?.fallbackRegions ?? [],
  };
}

export function draftToProblem(
  draft: ProtocolProblemDraft,
  options: {
    id?: string;
    accentClass?: string;
    previous?: ProtocolProblem;
    existingIds: Set<string>;
  },
): ProtocolProblem | null {
  const title = draft.title.trim();
  if (!title) return null;

  const organs = draft.organs
    .map((o) => {
      const prev = options.previous?.organs.find((p) => p.id === o.id);
      const organ = draftToOrgan(o, prev);
      return organ.name ? organ : null;
    })
    .filter((o): o is ProtocolOrgan => o != null);

  if (organs.length === 0) return null;

  const id =
    options.id ??
    options.previous?.id ??
    createProtocolId(title, options.existingIds);

  return {
    id,
    title,
    shortDescription: draft.shortDescription.trim(),
    accentClass: options.accentClass ?? options.previous?.accentClass ?? pickAccentClass(options.existingIds.size),
    organs,
  };
}

export function problemToDraft(problem: ProtocolProblem): ProtocolProblemDraft {
  return {
    title: problem.title,
    shortDescription: problem.shortDescription,
    organs: problem.organs.map((o) => ({
      id: o.id,
      name: o.name,
      protocolSummary: o.protocolSummary,
      applicationNotes: o.applicationNotes,
      footView: o.footView,
      footSide: o.footSide,
    })),
  };
}

export function loadProtocolsFromStorage(): ProtocolProblem[] {
  if (typeof window === "undefined") return structuredClone(PROTOCOL_CATALOG);

  try {
    const raw = window.localStorage.getItem(PROTOCOL_STORAGE_KEY);
    if (!raw) {
      const seed = structuredClone(PROTOCOL_CATALOG);
      saveProtocolsToStorage(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = structuredClone(PROTOCOL_CATALOG);
      saveProtocolsToStorage(seed);
      return seed;
    }
    return parsed as ProtocolProblem[];
  } catch {
    const seed = structuredClone(PROTOCOL_CATALOG);
    saveProtocolsToStorage(seed);
    return seed;
  }
}

export function saveProtocolsToStorage(protocols: ProtocolProblem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROTOCOL_STORAGE_KEY, JSON.stringify(protocols));
}
