import type { SavedClinicalNote } from "../types";

export function normalizeNoteSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase("tr-TR");
}

export function noteMatchesSearch(note: SavedClinicalNote, query: string): boolean {
  if (!query) return true;
  const haystack = [note.title, note.content, note.date, ...note.attachments.map((a) => a.displayName)]
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  return haystack.includes(query);
}

export function noteContentPreview(content: string, maxLen = 160): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "İçerik eklenmemiş.";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}
