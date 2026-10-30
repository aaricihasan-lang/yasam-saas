// Klasik Numeroloji · kaydedilmemiş hesap sonucu (taslak) — istemci tarafı.
// 30.10.2026 owner kararı: "Hesapla" kalıcı kayıt OLUŞTURMAZ. Sonuç bu sekmenin sessionStorage'ında tutulur
// (sekme kapanınca silinir; başka sekme / cihaz görmez). URL'de YALNIZ rastgele taslak anahtarı taşınır —
// ad / doğum tarihi gibi kişisel bilgi URL'ye YAZILMAZ. Sunucu her Kaydet / rapor isteğinde sonucu kendi
// önbelleğinden yeniden kurup `resultHash` ile doğrular; buradaki kopya yalnız görüntüleme içindir.

import type { ClassicAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import type { AnalysisView } from "./types";

/** Sunucuya giden taslak başvurusu (sonucun kendisi gönderilmez). */
export type DraftRef = { request: ClassicAnalysisRequest; referenceDate: string; resultHash: string };

/** POST /hesapla → draft */
export type DraftPayload = DraftRef & { view: Omit<AnalysisView, "id"> & { id: null } };
export type DraftResponse = { ok: true; draft: DraftPayload };

/** Düzenlenen kayıtlı analiz (Bilgileri Düzenle → Yeniden Hesapla): Güncelle kararı için kimlik + sürüm. */
export type DraftSource = { id: string; rowVersion: number; title: string };

export type StoredDraft = DraftPayload & { key: string; source: DraftSource | null; storedAt: string };

/** Sonuç görüntüleme / rapor bileşenlerinin kaynağı: kayıtlı analiz ya da taslak. */
export type ResultSource = { analysisId: string; draft?: undefined } | { analysisId?: undefined; draft: DraftRef };

const PREFIX = "nkTaslak:";
const MAX_DRAFTS = 6;
const KEY_RE = /^[a-z0-9]{12,40}$/;

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function newKey(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export function isDraftKey(v: string | null | undefined): v is string {
  return typeof v === "string" && KEY_RE.test(v);
}

/** Taslağı saklar ve anahtarını döner (en eski taslaklar MAX_DRAFTS sınırında silinir). Depolama yoksa null. */
export function saveDraft(d: DraftPayload, source: DraftSource | null): string | null {
  const s = store();
  if (!s) return null;
  const key = newKey();
  const item: StoredDraft = { ...d, key, source, storedAt: new Date().toISOString() };
  try {
    pruneDrafts(s, MAX_DRAFTS - 1);
    s.setItem(PREFIX + key, JSON.stringify(item));
    return key;
  } catch {
    try {
      pruneDrafts(s, 0);
      s.setItem(PREFIX + key, JSON.stringify(item));
      return key;
    } catch {
      return null;
    }
  }
}

export function loadDraft(key: string | null | undefined): StoredDraft | null {
  if (!isDraftKey(key)) return null;
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredDraft;
    return v && v.key === key && v.request && typeof v.resultHash === "string" && v.view ? v : null;
  } catch {
    return null;
  }
}

/** Kaydedilen / vazgeçilen taslak sekmeden silinir. */
export function dropDraft(key: string | null | undefined): void {
  if (!isDraftKey(key)) return;
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    /* yok say */
  }
}

function pruneDrafts(s: Storage, keep: number): void {
  const items: { k: string; at: string }[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    let at = "";
    try {
      at = (JSON.parse(s.getItem(k) ?? "{}") as { storedAt?: string }).storedAt ?? "";
    } catch {
      /* bozuk → önce silinir */
    }
    items.push({ k, at });
  }
  items.sort((x, y) => (x.at < y.at ? -1 : 1));
  for (const it of items.slice(0, Math.max(0, items.length - keep))) s.removeItem(it.k);
}

export function draftRefOf(d: DraftRef): DraftRef {
  return { request: d.request, referenceDate: d.referenceDate, resultHash: d.resultHash };
}

/** Rapor / taş uçlarına gidecek kaynak gövdesi. */
export function sourceBody(src: ResultSource): { analysisId: string } | { draft: DraftRef } {
  return src.draft ? { draft: draftRefOf(src.draft) } : { analysisId: src.analysisId as string };
}

/** Tür → form adresi (Bilgileri Düzenle). */
export const FORM_PATH: Readonly<Record<string, string>> = Object.freeze({
  person: "/numeroloji-klasik/yeni",
  relationship: "/numeroloji-klasik/iliski",
  business: "/numeroloji-klasik/isletme",
  names: "/numeroloji-klasik/isimler",
});

export function editHref(kind: string, by: { draftKey: string } | { analysisId: string }): string {
  const base = FORM_PATH[kind] ?? FORM_PATH.person;
  return "draftKey" in by ? `${base}?taslak=${encodeURIComponent(by.draftKey)}` : `${base}?kayit=${encodeURIComponent(by.analysisId)}`;
}
