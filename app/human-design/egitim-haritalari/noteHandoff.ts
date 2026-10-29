"use client";

/**
 * FAZ 10 — "Notlarıma ekle": Hayat Hikâyesi'ndeki bir yaşam olayını eğitmenin KENDİ eğitim notlarına taşır.
 * Yalnız bu sekmede (sessionStorage), yalnız aynı merkezî harita için ve kısa süreliğine tutulur; sunucuya gitmez.
 * Çalışma alanı notu KAYDEDİLMEMİŞ değişiklik olarak ekler — kalıcı olması için eğitmen "Kaydet"e basar (sessiz kayıt YOK).
 */
const KEY = "hd-edu-note-handoff";
const TTL_MS = 10 * 60 * 1000;
const BAD = /[<>]/g;

export function putNoteHandoff(subjectId: string, text: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ subjectId, text: text.replace(BAD, "").slice(0, 1200), at: Date.now() }));
  } catch {
    /* depolama kapalı: ekleme yapılmaz, sayfa yine açılır */
  }
}

/** Bekleyen eklemeyi alır ve siler (yalnız aynı harita + süre dolmamışsa). */
export function takeNoteHandoff(subjectId: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { subjectId?: unknown; text?: unknown; at?: unknown };
    if (v.subjectId !== subjectId || typeof v.text !== "string" || typeof v.at !== "number" || Date.now() - v.at > TTL_MS) return null;
    const t = v.text.replace(BAD, "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/** Mevcut notun sonuna ekler; azami uzunluğu aşmaz. */
export function appendNote(current: string, add: string, max: number): string {
  const joined = current.trim() ? `${current.replace(/\s+$/, "")}\n\n${add}` : add;
  return joined.slice(0, max);
}
