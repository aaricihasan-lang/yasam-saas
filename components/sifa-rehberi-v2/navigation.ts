/**
 * Şifa Rehberi V2 — ekran gezinmesi (Ana Konularım ⇄ Konu Ayrıntısı) ve adres çubuğu.
 *
 * Adres: ?kullanici=<ayse|uzman>&konu=<ana konu id>&baslik=<başlık id>&sekme=okuma[&gorunum=…]
 *  - konu yoksa → Ana Konularım listesi.
 *  - Seçim YALNIZ kayıt kimliği + üst-alt ilişkisiyle çözülür (başlık metnine bakılmaz):
 *    başlık, adresteki ana konunun alt ağacında değilse kabul edilmez.
 * Geçmiş: Next.js yerel `history.pushState` desteğiyle (router ile senkron) her ekran bir giriştir.
 * Ayrıca sayfanın en altına tek bir "taban" girişi konur: geri tuşu oraya ulaşırsa kullanıcı
 * prototip sayfasından AYRILMAK üzeredir → kaydedilmemiş değişiklik varsa onay sorulur.
 * Sayfa içi konu değişimi taslağı silmez; bu yüzden orada onay sorulmaz.
 */
import { nodeById, pathOf } from "@/lib/sifa-rehberi-v2/tree";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

export type ViewMode = "basit" | "gelismis";
/** Seçili konu için sekme: düzenleme (Notlarım) veya salt-okunur Bütüncül Okuma. Kullanıcı modu DEĞİL. */
export type ContentTab = "notlar" | "okuma";

const SLUG_TO_OWNER: Record<string, string> = { ayse: "proto-ayse", uzman: "proto-uzman" };
const OWNER_TO_SLUG: Record<string, string> = Object.fromEntries(Object.entries(SLUG_TO_OWNER).map(([k, v]) => [v, k]));

export type NavFromUrl = { ownerId: string | null; rootId: string | null; nodeId: string | null; tab: ContentTab; view: ViewMode | null };

export function readNav(href: string): NavFromUrl {
  const u = new URL(href);
  const p = u.searchParams;
  const v = p.get("gorunum");
  return {
    ownerId: SLUG_TO_OWNER[p.get("kullanici") ?? ""] ?? null,
    rootId: p.get("konu"),
    nodeId: p.get("baslik"),
    tab: p.get("sekme") === "okuma" ? "okuma" : "notlar",
    view: v === "basit" || v === "gelismis" ? v : null,
  };
}

/** Diğer parametreleri (ör. gorunum) koruyarak gezinme parametrelerini yazar. */
export function navHref(href: string, nav: { ownerId: string; rootId: string | null; nodeId: string | null; tab: ContentTab }): string {
  const u = new URL(href);
  const p = u.searchParams;
  for (const k of ["kullanici", "konu", "baslik", "sekme"]) p.delete(k);
  const slug = OWNER_TO_SLUG[nav.ownerId];
  if (slug) p.set("kullanici", slug);
  if (nav.rootId) {
    p.set("konu", nav.rootId);
    if (nav.nodeId && nav.nodeId !== nav.rootId) p.set("baslik", nav.nodeId);
    if (nav.tab === "okuma") p.set("sekme", "okuma");
  }
  u.search = p.toString();
  return u.toString();
}

/**
 * Adresteki seçim bu çalışma alanında güvenli mi? Başlık, adresteki ana konunun alt ağacında
 * olmalı (kimlik + üst-alt ilişkisi). Değilse ana konu, o da yoksa Ana Konularım (null).
 */
export function resolveSelection(ws: Workspace, rootId: string | null, nodeId: string | null): string | null {
  const root = nodeById(ws, rootId);
  if (!root || root.parentId !== null) return null;
  if (nodeId && nodeById(ws, nodeId) && pathOf(ws, nodeId)[0]?.id === root.id) return nodeId;
  return root.id;
}

// ── Tarayıcı geçmişi ─────────────────────────────────────────────────────────
const KEY = "sifaV2";
type Entry = { i: number; base?: boolean };

export function historyEntry(): Entry | null {
  const st = typeof window !== "undefined" ? (window.history.state as Record<string, unknown> | null) : null;
  const e = st?.[KEY] as Entry | undefined;
  return e && typeof e.i === "number" ? e : null;
}

export function writeHistory(url: string, mode: "push" | "replace") {
  const cur = historyEntry();
  const i = mode === "push" ? (cur?.i ?? 0) + 1 : (cur?.i ?? 1);
  const state = { [KEY]: { i } };
  if (mode === "push") window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
}

/** İlk açılışta (ve yalnız bir kez) taban girişi kurar; yenilemede mevcut giriş korunur. */
export function ensureHistoryBase(url: string) {
  if (historyEntry()) {
    window.history.replaceState({ [KEY]: historyEntry() }, "", url);
    return;
  }
  window.history.replaceState({ [KEY]: { i: 0, base: true } }, "", url);
  window.history.pushState({ [KEY]: { i: 1 } }, "", url);
}
