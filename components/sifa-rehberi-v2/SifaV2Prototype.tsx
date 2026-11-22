"use client";

/**
 * Şifa Rehberi V2 — İLK ÇALIŞAN PROTOTİP (yalnız sentetik veri; tarayıcı belleğinde saklanır).
 *
 * Felsefe: "Başlamak için bir konu adı yeterli; derinleşmek için sınır yok."
 *  - Kategori/organ/klasör seçimi ZORUNLU DEĞİL.
 *  - Her konu sınırsız alt başlık + sınırsız bağımsız içerik kutusu taşır.
 *  - Kayıt yalnız "Kaydet" ile; otomatik kayıt YOK; kaydedilmemiş değişiklikte çıkış uyarısı.
 *  - Silme = Çöp Kutusu (geri yüklenebilir).
 * Mevcut Şifa Rehberi düzeni korunur: sol konu menüsü + sağ geniş içerik + aynı kart/renk dili.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { useSifaLinkLeaveGuard } from "@/components/sifa-rehberi/useSifaLinkLeaveGuard";
import { SIFA_LEAVE_CONFIRM } from "@/lib/sifa-rehberi/leaveGuard";
import { TopicTree } from "@/components/sifa-rehberi-v2/TopicTree";
import { BlockCard } from "@/components/sifa-rehberi-v2/BlockCard";
import { ReadingView } from "@/components/sifa-rehberi-v2/ReadingView";
import LegacyGuides from "@/components/sifa-rehberi-v2/LegacyGuides";
import { ensureHistoryBase, historyEntry, navHref, readNav, resolveSelection, writeHistory, type ContentTab, type ViewMode } from "@/components/sifa-rehberi-v2/navigation";
import { PromptDialog, btnDanger, btnGhost, btnPrimary } from "@/components/sifa-rehberi-v2/Modal";
import { LinkDialog, MoveDialog, NewTopicDialog, TrashDialog } from "@/components/sifa-rehberi-v2/Dialogs";
import { applyTemplate, missingTemplateCount, templateEntry } from "@/lib/sifa-rehberi-v2/template";
import { addRelatedSection, isRelatedSection, linkRelated, relatedEntries, relatedSectionOf, RELATED_SECTION_TITLE } from "@/lib/sifa-rehberi-v2/related";
import { rootOf } from "@/lib/sifa-rehberi-v2/reading";
import { PrototypeRepo } from "@/lib/sifa-rehberi-v2/repo";
import { PROTO_OWNERS, seedWorkspace } from "@/lib/sifa-rehberi-v2/seed";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { Conflict } from "@/lib/sifa-rehberi-v2/changeset";
import { ConflictDialog, rebaseOnto, SharedBadge, SharedBanner, UNMATCHED_KEY } from "@/components/sifa-rehberi-v2/scopeUi";
import { sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";
import { applySaveResult, buildChangeset, isEmptyChangeset } from "@/lib/sifa-rehberi-v2/changeset";
import {
  addBlock, addLink, addNode, blocksOf, childrenOf, linksFrom, linksTo, moveNode, nodeById, pathOf,
  removeLink, renameNode, reorderBlock, reorderNode, restoreBatch, searchWorkspace, softDeleteBlock,
  softDeleteNode, subtreeIds, summarizeChanges, trashEntries, TEMPLATE_LOCKED, type BlockPatch, type Ctx,
} from "@/lib/sifa-rehberi-v2/tree";
import type { OpResult, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

const LAST_OWNER_KEY = "sifa-v2-prototip:son-kullanici";
/** Görünüm yalnız EKRAN tercihidir (kişisel kolaylık); veri/taslak/kayıt ile hiçbir ilgisi yoktur. */
const VIEW_KEY = "sifa-v2-prototip:gorunum";
export type { ContentTab, ViewMode };
const BOX_SUGGESTIONS = ["Notlar", "Genel Bilgiler", "Bilimsel Araştırmalar", "Geleneksel Yaklaşımlar", "Refleksoloji Notları", "Uzmanın Kendi Notları"] as const;

type DialogState =
  | null
  | { kind: "newRoot" }
  | { kind: "newChild"; parentId: string }
  | { kind: "rename"; nodeId: string }
  | { kind: "newBlock"; nodeId: string }
  | { kind: "move"; nodeId: string }
  | { kind: "link"; nodeId: string }
  | { kind: "linkRelated"; sectionId: string }
  | { kind: "trash" };

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Canlı mod: V1 ile AYNI oturum başlıkları (lib/sifa-rehberi/healingGuideLiveData.ts authHeaders). */
function liveAuthHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

/**
 * mode="prototip": yerel / izole test (sentetik kullanıcılar, ?depo=db ile geçici PostgreSQL).
 * mode="canli"   : gerçek sayfa (app/sifa-rehberi-v2) — kullanıcı OTURUMDAN, API /api/sifa-rehberi-v2.
 */
export default function SifaV2Prototype({ mode = "prototip" }: { mode?: "prototip" | "canli" } = {}) {
  const live = mode === "canli";
  const apiBase = live ? "/api/sifa-rehberi-v2" : "/api/prototip/sifa-rehberi-v2";
  const apiHeaders = useCallback(
    (owner: string, json = false): Record<string, string> => ({
      ...(json ? { "content-type": "application/json" } : {}),
      ...(live ? liveAuthHeaders() : { "x-sifa-proto-owner": owner }),
    }),
    [live],
  );
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const ctx: Ctx = useMemo(
    () => ({
      get now() {
        return new Date().toISOString();
      },
      newId: () => crypto.randomUUID(),
    }),
    [],
  );

  const repoRef = useRef<PrototypeRepo | null>(null);
  /**
   * Depo: "yerel" = tarayıcı belleği (önceki aşamalar) · "db" = KALICI kayıt (?depo=db) —
   * izole testte yerel geçici PostgreSQL; gerçek üründe aynı işleyicili /api/sifa-rehberi-v2.
   */
  const storeRef = useRef<"yerel" | "db">("yerel");
  const [store, setStore] = useState<"yerel" | "db">("yerel");
  const savedRef = useRef<Workspace | null>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ items: Conflict[] } | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Workspace | null>(null);
  const [draft, setDraftState] = useState<Workspace | null>(null);
  const draftRef = useRef<Workspace | null>(null);
  const setDraft = useCallback((ws: Workspace) => {
    draftRef.current = ws;
    setDraftState(ws);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  // Varsayılan: Basit Görünüm. Görünüm değişimi draft/saved/editing'e DOKUNMAZ (tek veri sistemi).
  const [view, setView] = useState<ViewMode>("basit");
  const simple = view === "basit";
  // Sekme değişimi de yalnız ekranı değiştirir: taslak, düzenlenen kutular ve Kaydet durumu korunur.
  const [tab, setTab] = useState<ContentTab>("notlar");
  // Tarayıcı geçmişi dinleyicisi güncel değerleri ref'ten okur (yeniden kurulmadan).
  const ownerIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const tabRef = useRef<ContentTab>("notlar");
  const dirtyRef = useRef(false);
  const currentUrlRef = useRef("");
  const changeView = useCallback((v: ViewMode) => {
    setView(v);
    try {
      safeStorage()?.setItem(VIEW_KEY, v);
    } catch {
      /* yoksay */
    }
  }, []);

  // ── Yükleme: yerel depo (tarayıcı) veya kalıcı kayıt (API → DB) ──────────────
  const loadOwner = useCallback(
    async (id: string): Promise<Workspace | null> => {
      const local = safeStorage();
      let ws: Workspace;
      if (storeRef.current === "db") {
        // Yükleme sürerken ÖNCEKİ kullanıcının verisi ekranda kalmaz (yanlış sahibe düzenleme yok).
        draftRef.current = null;
        savedRef.current = null;
        setDraftState(null);
        setSaved(null);
        try {
          const res = await fetch(`${apiBase}/workspace`, { headers: apiHeaders(id), cache: "no-store" });
          const j = (await res.json().catch(() => null)) as { ok?: boolean; workspace?: Workspace; error?: string } | null;
          if (!res.ok || !j?.ok || !j.workspace) throw new Error(j?.error ?? `HTTP ${res.status}`);
          ws = j.workspace;
        } catch (e) {
          const msg = `Kayıtlar yüklenemedi: ${(e as Error).message}`;
          setLoadError(msg);
          showToast({ message: msg, type: "error" });
          return null;
        }
      } else {
        if (!repoRef.current) {
          const mem = new Map<string, string>();
          repoRef.current = new PrototypeRepo(
            local ?? { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
            seedWorkspace,
          );
        }
        ws = repoRef.current.load(id);
      }
      try {
        local?.setItem(LAST_OWNER_KEY, id);
      } catch {
        /* yoksay */
      }
      setLoadError(null);
      ownerIdRef.current = id;
      savedRef.current = ws;
      setOwnerId(id);
      setSaved(ws);
      setDraft(ws);
      setSelectedId(null);
      selectedIdRef.current = null;
      setEditing(new Set());
      setExpanded(new Set());
      setLastSavedAt(null);
      return ws;
    },
    [setDraft, showToast, apiBase, apiHeaders],
  );

  /** Ekranda seçimi gösterir (adres çubuğuna dokunmaz). null = Ana Konularım. */
  const showSelection = useCallback((ws: Workspace, id: string | null, nextTab: ContentTab) => {
    const t: ContentTab = id ? nextTab : "notlar";
    selectedIdRef.current = id;
    tabRef.current = t;
    setSelectedId(id);
    setTab(t);
    setDrawer(false);
    setSearchOpen(false);
    if (id) {
      const ids = pathOf(ws, id).map((n) => n.id);
      setExpanded((prev) => new Set([...prev, ...ids]));
    }
  }, []);

  useEffect(() => {
    const nav = readNav(window.location.href);
    const useDb = live || new URL(window.location.href).searchParams.get("depo") === "db";
    let initial = live ? (readYasamUser()?.id ?? null) : nav.ownerId;
    if (!initial) {
      try {
        initial = safeStorage()?.getItem(LAST_OWNER_KEY) ?? null;
      } catch {
        initial = null;
      }
    }
    if (live && !initial) {
      const t0 = window.setTimeout(() => setLoadError("Oturum bulunamadı. Lütfen yeniden giriş yapın."), 0);
      return () => window.clearTimeout(t0);
    }
    if (!live && (!initial || !PROTO_OWNERS.some((o) => o.id === initial))) initial = "proto-ayse";
    if (!initial) return;
    const ownerToLoad = initial;
    let viewToUse: ViewMode | null = nav.view;
    if (!viewToUse) {
      try {
        const stored = safeStorage()?.getItem(VIEW_KEY);
        viewToUse = stored === "gelismis" ? "gelismis" : stored === "basit" ? "basit" : null;
      } catch {
        viewToUse = null;
      }
    }
    // localStorage yalnız tarayıcıda okunabilir; yükleme ilk boyamadan sonra (SSR uyumu) yapılır.
    const t = window.setTimeout(() => {
      if (viewToUse) setView(viewToUse);
      if (useDb) {
        storeRef.current = "db";
        setStore("db");
      }
      void (async () => {
        const ws = await loadOwner(ownerToLoad);
        if (!ws) return;
        // Doğrudan bağlantı / yenileme: adresteki konu yalnız kimlik + üst-alt ilişkisiyle doğrulanır.
        const sel = resolveSelection(ws, nav.rootId, nav.nodeId);
        showSelection(ws, sel, nav.tab);
        const url = navHref(window.location.href, { ownerId: ownerToLoad, rootId: sel ? pathOf(ws, sel)[0].id : null, nodeId: sel, tab: nav.tab });
        ensureHistoryBase(url);
        currentUrlRef.current = url;
      })();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadOwner, showSelection, live]);

  const changes = useMemo(() => (saved && draft ? summarizeChanges(saved, draft) : { total: 0, nodes: 0, blocks: 0, links: 0 }), [saved, draft]);
  const dirty = changes.total > 0;

  const discard = useCallback(() => {
    if (saved) setDraft(saved);
    setEditing(new Set());
  }, [saved, setDraft]);

  // Mevcut Şifa çıkış korumaları: sekme kapatma/yenileme + uygulama-içi bağlantılar AYNEN.
  // Geri/ileri: V2'de ekranlar arası geçiş geçmişe yazılır ve taslağı SİLMEZ; bu yüzden mevcut
  // useBackNavigationGuard (her geri basışta "ayrıl?" sorar) yerine yalnız SAYFADAN AYRILIRKEN soran
  // taban-giriş koruması kullanılır (bkz. navigation.ts).
  useUnsavedGuard(dirty);
  useSifaLinkLeaveGuard(dirty, discard);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const onPop = async () => {
      const entry = historyEntry();
      if (!entry) return; // bu sayfanın girişi değil (başka sayfaya geçiliyor)
      if (entry.base) {
        if (dirtyRef.current && !window.confirm(SIFA_LEAVE_CONFIRM.message)) {
          window.history.forward(); // kal
          return;
        }
        window.history.back(); // sayfadan ayrıl
        return;
      }
      const nav = readNav(window.location.href);
      let ws = draftRef.current;
      if (nav.ownerId && nav.ownerId !== ownerIdRef.current) {
        // Başka sentetik kullanıcıya dönüş: taslak o kullanıcıya ait değildir → onay.
        if (dirtyRef.current && !window.confirm(SIFA_LEAVE_CONFIRM.message)) {
          writeHistory(currentUrlRef.current, "push");
          return;
        }
        ws = await loadOwner(nav.ownerId);
      }
      if (!ws || !ownerIdRef.current) return;
      const sel = resolveSelection(ws, nav.rootId, nav.nodeId);
      showSelection(ws, sel, nav.tab);
      const url = navHref(window.location.href, { ownerId: ownerIdRef.current, rootId: sel ? pathOf(ws, sel)[0].id : null, nodeId: sel, tab: nav.tab });
      if (url !== window.location.href) writeHistory(url, "replace");
      currentUrlRef.current = url;
    };
    const handler = () => void onPop();
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [loadOwner, showSelection]);

  // ── İşlem yardımcıları ──────────────────────────────────────────────────────
  const run = useCallback(
    <T,>(fn: (ws: Workspace) => OpResult<T>, pick: (v: T) => Workspace): T | null => {
      const cur = draftRef.current;
      if (!cur) return null;
      const r = fn(cur);
      if (!r.ok) {
        showToast({ message: r.error, type: "error" });
        return null;
      }
      setDraft(pick(r.value));
      return r.value;
    },
    [setDraft, showToast],
  );
  const runWs = useCallback((fn: (ws: Workspace) => OpResult) => run(fn, (v) => v), [run]);

  /** Ekran değiştirir ve adres çubuğuna/geçmişe yazar. id null = Ana Konularım. */
  const go = useCallback(
    (id: string | null, opts: { tab?: ContentTab; mode?: "push" | "replace" } = {}) => {
      const ws = draftRef.current;
      const owner = ownerIdRef.current;
      if (!ws || !owner) return;
      const nextTab = opts.tab ?? tabRef.current;
      showSelection(ws, id, nextTab);
      const rootId = id ? (pathOf(ws, id)[0]?.id ?? null) : null;
      const url = navHref(window.location.href, { ownerId: owner, rootId, nodeId: id, tab: nextTab });
      if (url !== window.location.href) writeHistory(url, opts.mode ?? "push");
      currentUrlRef.current = url;
    },
    [showSelection],
  );

  const select = useCallback(
    (id: string | null, nextTab?: ContentTab) => {
      go(id, { tab: nextTab });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [go],
  );
  const changeTab = useCallback((t: ContentTab) => go(selectedIdRef.current, { tab: t }), [go]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onPatch = useCallback(
    (id: string, patch: BlockPatch) => {
      const cur = draftRef.current;
      if (!cur) return;
      const b = cur.blocks.find((x) => x.id === id);
      if (!b) return;
      const next: Workspace = { ...cur, blocks: cur.blocks.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: ctx.now } : x)) };
      if (patch.title !== undefined && !patch.title.trim()) return;
      setDraft(next);
    },
    [ctx, setDraft],
  );
  const onMoveBlock = useCallback((id: string, dir: "up" | "down") => runWs((ws) => reorderBlock(ws, id, dir, ctx)), [runWs, ctx]);
  const onToggleEdit = useCallback((id: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const onDeleteBlock = useCallback(
    async (id: string) => {
      const b = draftRef.current?.blocks.find((x) => x.id === id);
      if (!b) return;
      const ok = await confirm({
        title: "İçerik kutusu silinsin mi?",
        message: `“${b.title}” kutusu Çöp Kutusu'na taşınacak. Kaydet'e bastığınızda kesinleşir ve Çöp Kutusu'ndan geri yüklenebilir.`,
        confirmText: "Çöp Kutusu'na taşı",
        cancelText: "Vazgeç",
        tone: "danger",
      });
      if (!ok) return;
      run((ws) => softDeleteBlock(ws, id, ctx), (v) => v.ws);
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [confirm, run, ctx],
  );

  const save = useCallback(async () => {
    const cur = draftRef.current;
    if (!cur || !ownerId || savingRef.current) return;
    const clean: Workspace = { ...cur, blocks: cur.blocks.map((b) => ({ ...b, contentJson: sanitizeContent(b.contentJson) })) };
    if (storeRef.current === "db") {
      // KALICI KAYIT: yalnız değişen satırlar, TEK sunucu işlemi; hata → hiçbir şey yazılmaz,
      // başarı mesajı yalnız sunucu onayından sonra (sahte başarı YOK).
      const base = savedRef.current;
      if (!base) return;
      const body = buildChangeset(base, clean);
      if (isEmptyChangeset(body)) {
        savedRef.current = clean;
        setSaved(clean);
        setDraft(clean);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        const res = await fetch(`${apiBase}/workspace`, {
          method: "POST",
          headers: apiHeaders(ownerId, true),
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: { topics: Record<string, number>; blocks: Record<string, number> }; error?: string; conflicts?: Conflict[] } | null;
        if (!res.ok || !j?.ok || !j.result) {
          showToast({ message: j?.error ?? `Kaydedilemedi (HTTP ${res.status}). Hiçbir değişiklik yazılmadı; değişiklikleriniz ekranda duruyor.`, type: "error" });
          // Çakışma: kullanıcıya hangi kayıtların değiştiğini gösteren ÇÖZÜM penceresi.
          if (res.status === 409 && j?.conflicts?.length) setConflict({ items: j.conflicts });
          return;
        }
        const next = applySaveResult(clean, j.result);
        savedRef.current = next;
        setSaved(next);
        const latest = draftRef.current;
        setDraft(!latest || latest === cur ? next : applySaveResult(latest, j.result));
        setLastSavedAt(new Date().toISOString());
        showToast({ message: "Değişiklikler kaydedildi.", type: "success" });
      } catch {
        showToast({ message: "Sunucuya ulaşılamadı. Hiçbir değişiklik kaydedilmedi; değişiklikleriniz ekranda duruyor.", type: "error" });
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      return;
    }
    if (!repoRef.current) return;
    const r = repoRef.current.save(ownerId, clean);
    if (!r.ok) {
      showToast({ message: r.error, type: "error" });
      return;
    }
    savedRef.current = clean;
    setSaved(clean);
    setDraft(clean);
    setLastSavedAt(r.savedAt);
    showToast({ message: "Değişiklikler kaydedildi.", type: "success" });
  }, [ownerId, setDraft, showToast, apiBase, apiHeaders]);

  /** Çakışma çözümü: sunucudaki son hâli yükler; "üstüne uygula" seçilirse KENDİ değişiklikleri son hâlin üstüne yeniden konur (yine Kaydet gerekir). */
  const resolveConflict = useCallback(
    async (choice: "uygula" | "birak") => {
      const owner = ownerIdRef.current;
      const base = savedRef.current;
      const mine = draftRef.current;
      if (!owner || !base || !mine) return;
      let server: Workspace;
      try {
        const res = await fetch(`${apiBase}/workspace`, { headers: apiHeaders(owner), cache: "no-store" });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; workspace?: Workspace; error?: string } | null;
        if (!res.ok || !j?.ok || !j.workspace) throw new Error(j?.error ?? `HTTP ${res.status}`);
        server = j.workspace;
      } catch (e) {
        showToast({ message: `Son kayıt alınamadı: ${(e as Error).message}`, type: "error" });
        return;
      }
      setConflict(null);
      savedRef.current = server;
      setSaved(server);
      if (choice === "birak") {
        setDraft(server);
        setEditing(new Set());
        showToast({ message: "Son kayıt yüklendi; bu penceredeki kaydedilmemiş değişiklikler bırakıldı.", type: "info" });
        return;
      }
      setDraft(rebaseOnto(base, mine, server));
      showToast({ message: "Değişiklikleriniz son kaydın üstüne yeniden uygulandı. Kontrol edip Kaydet'e basın.", type: "info" });
    },
    [apiBase, apiHeaders, setDraft, showToast],
  );

  /** Kurum ortak kaydından KİŞİSEL KOPYA (özgün kayda dokunulmaz). */
  const copyToPersonal = useCallback(
    async (rootId: string) => {
      const owner = ownerIdRef.current;
      if (!owner) return;
      if (dirtyRef.current) {
        showToast({ message: "Önce kaydedilmemiş değişikliklerinizi kaydedin ya da vazgeçin.", type: "warning" });
        return;
      }
      try {
        const res = await fetch(`${apiBase}/copy`, { method: "POST", headers: apiHeaders(owner, true), body: JSON.stringify({ rootId }) });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; rootId?: string; created?: boolean; error?: string } | null;
        if (!res.ok || !j?.ok || !j.rootId) {
          showToast({ message: j?.error ?? `Kopya oluşturulamadı (HTTP ${res.status}).`, type: "error" });
          return;
        }
        const ws = await loadOwner(owner);
        if (!ws) return;
        go(j.rootId, { tab: "notlar" });
        showToast({ message: j.created ? "Kişisel kopyanız oluşturuldu; özgün kurum kaydı değişmedi." : "Bu kaydın kişisel kopyası zaten vardı; o açıldı.", type: "success" });
      } catch {
        showToast({ message: "Kopya oluşturulamadı: sunucuya ulaşılamadı.", type: "error" });
      }
    },
    [apiBase, apiHeaders, loadOwner, showToast, go],
  );

  /** Word: yalnız KAYDEDİLMİŞ veriden (sunucu üretir; uzmanın kendi verisi). */
  const downloadWord = useCallback(
    async (rootId: string) => {
      if (!ownerId) return;
      try {
        const res = await fetch(`${apiBase}/word`, {
          method: "POST",
          headers: apiHeaders(ownerId, true),
          body: JSON.stringify({ rootId }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          showToast({ message: j?.error ?? `Word oluşturulamadı (HTTP ${res.status}).`, type: "error" });
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("content-disposition") ?? "";
        const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? "sifa-rehberi.docx");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch {
        showToast({ message: "Word oluşturulamadı: sunucuya ulaşılamadı.", type: "error" });
      }
    },
    [ownerId, showToast, apiBase, apiHeaders],
  );

  const askDiscard = useCallback(async () => {
    const ok = await confirm({
      title: "Değişiklikler geri alınsın mı?",
      message: "Son kayıttan bu yana yaptığınız tüm değişiklikler silinecek.",
      confirmText: "Değişiklikleri geri al",
      cancelText: "Vazgeç",
      tone: "warning",
    });
    if (ok) discard();
  }, [confirm, discard]);

  const switchOwner = useCallback(
    async (id: string) => {
      if (id === ownerId) return;
      if (dirty) {
        const ok = await confirm({ ...SIFA_LEAVE_CONFIRM });
        if (!ok) return;
      }
      const ws = await loadOwner(id);
      if (!ws) return;
      showSelection(ws, null, "notlar");
      const url = navHref(window.location.href, { ownerId: id, rootId: null, nodeId: null, tab: "notlar" });
      writeHistory(url, "push");
      currentUrlRef.current = url;
    },
    [confirm, dirty, loadOwner, ownerId, showSelection],
  );

  const resetSynthetic = useCallback(async () => {
    if (!ownerId || !repoRef.current || storeRef.current !== "yerel") return;
    const ok = await confirm({
      title: "Sentetik veriyi sıfırla",
      message: "Bu prototip kullanıcısının tarayıcıdaki örnek verisi başlangıç hâline döner. Gerçek kayıtlar etkilenmez.",
      confirmText: "Sıfırla",
      cancelText: "Vazgeç",
      tone: "warning",
    });
    if (!ok) return;
    repoRef.current.reset(ownerId);
    await loadOwner(ownerId);
    go(null, { mode: "replace" });
  }, [confirm, loadOwner, ownerId, go]);

  const deleteNode = useCallback(
    async (id: string) => {
      const ws = draftRef.current;
      const node = ws ? nodeById(ws, id) : null;
      if (!ws || !node) return;
      const ids = subtreeIds(ws, id);
      const blockCount = ws.blocks.filter((b) => !b.deletedAt && ids.has(b.nodeId)).length;
      const ok = await confirm({
        title: "Başlık silinsin mi?",
        message:
          `“${node.title}”` +
          (ids.size > 1 ? ` ve altındaki ${ids.size - 1} başlık` : "") +
          ` (${blockCount} içerik kutusu) Çöp Kutusu'na taşınacak.\nKaydet'e bastığınızda kesinleşir; Çöp Kutusu'ndan geri yüklenebilir.`,
        confirmText: "Çöp Kutusu'na taşı",
        cancelText: "Vazgeç",
        tone: "danger",
        ...(ids.size > 1 ? { requireText: "SİL" } : {}),
      });
      if (!ok) return;
      const r = run((w) => softDeleteNode(w, id, ctx), (v) => v.ws);
      if (r) {
        select(node.parentId);
        showToast({ message: "Çöp Kutusu'na taşındı. Kalıcı olması için Kaydet'e basın.", type: "info" });
      }
    },
    [confirm, run, ctx, select, showToast],
  );

  if (!draft || !saved || !ownerId) {
    return (
      <div className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] p-6" data-testid="sifa-v2-loading">
        {loadError ? (
          <p className="mx-auto mt-20 max-w-[560px] rounded-2xl border border-rose-200 bg-white p-5 text-[14px] font-bold text-rose-800" role="alert" data-testid="load-error">
            {loadError}
          </p>
        ) : store === "db" ? (
          <p className="mx-auto mt-20 max-w-[560px] text-center text-[14px] font-bold text-slate-500" role="status">
            Kayıtlar yükleniyor…
          </p>
        ) : null}
      </div>
    );
  }

  const liveUser = live ? readYasamUser() : null;
  const owner = live ? { id: ownerId, name: liveUser?.full_name || liveUser?.name || "" } : PROTO_OWNERS.find((o) => o.id === ownerId)!;
  const selected = nodeById(draft, selectedId);
  // Açık ana konu: seçili başlığın KÖKÜ (üst-alt ilişkisi; başlık metnine bakılmaz).
  const openRoot = selected ? rootOf(draft, selected.id) : null;
  const roots = childrenOf(draft, null);
  const liveNodeCount = draft.nodes.filter((n) => !n.deletedAt).length;
  const liveBlockCount = draft.blocks.filter((b) => !b.deletedAt && nodeById(draft, b.nodeId)).length;
  const trashCount = trashEntries(draft).length;
  const hits = searchOpen && q.trim() ? searchWorkspace(draft, q) : [];

  /** Şablonu (production hazır başlıkları) bir konuya ekler — idempotent, mevcut içeriğe dokunmaz. */
  const addTemplate = (nodeId: string, announce = true) => {
    const r = run((ws) => applyTemplate(ws, nodeId, ctx), (v) => v.ws);
    if (!r) return;
    const ws = draftRef.current;
    const groupIds = ws ? childrenOf(ws, nodeId).filter((c) => c.templateKey?.startsWith("grup:")).map((c) => c.id) : [];
    setExpanded((prev) => new Set([...prev, nodeId, ...groupIds]));
    if (announce) {
      showToast({
        message: r.added ? `${r.added} hazır başlık eklendi. Kalıcı olması için Kaydet'e basın.` : "Bütün hazır başlıklar zaten mevcut.",
        type: r.added ? "success" : "info",
      });
    }
  };

  const createRoot = (title: string, withTemplate = false) => {
    const r = run((ws) => addNode(ws, { parentId: null, title }, ctx), (v) => v.ws);
    if (!r) return null;
    if (withTemplate) addTemplate(r.node.id, false);
    select(r.node.id, "notlar"); // yeni konu yazmak için Notlarım'da açılır
    return r;
  };

  return (
    <main
      className={`sifa-v2 min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] pb-28 text-slate-950 ${simple ? "" : "lg:pb-10"}`}
      data-view={view}
      data-store={store}
      data-testid="sifa-v2-root"
    >
      <div className="mx-auto max-w-[1500px] px-4 pt-4 lg:px-6">
        {/* ── Üst kart (mevcut Şifa Rehberi başlık kartı düzeni) ── */}
        <section className="rounded-[28px] border border-white/80 bg-white/86 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {live ? null : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800">
                  ★ Şifa Rehberi · V2 Prototip
                </span>
              )}
              <h1 className="mt-2 text-[34px] font-black leading-none tracking-tight text-slate-950 sm:text-[44px]">Şifa Rehberi</h1>
              <p className="mt-2 text-[15px] font-medium text-slate-600">Başlamak için bir konu adı yeterli; derinleşmek için sınır yok.</p>
              <ViewSwitch view={view} onChange={changeView} />
            </div>
            <div className="grid grid-cols-3 gap-2" aria-label="Özet">
              {[
                { n: roots.length, l: "Ana konu" },
                { n: liveNodeCount, l: "Başlık" },
                { n: liveBlockCount, l: "Kutu" },
              ].map((x) => (
                <div key={x.l} className="min-w-[78px] rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-center shadow-sm">
                  <div className="text-[22px] font-black leading-7">{x.n}</div>
                  <div className="text-[11px] font-bold text-slate-500">{x.l}</div>
                </div>
              ))}
            </div>
          </div>
          {live ? null : (
          <>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[12px] font-semibold text-amber-900" role="note">
            <span className="font-black">PROTOTİP</span>
            {store === "db" ? (
              <span data-testid="store-badge">🗄 Kalıcı kayıt · İZOLE TEST VERİTABANI (yerel geçici PostgreSQL) · yalnız sentetik veri · canlı sisteme bağlı değildir.</span>
            ) : (
              <span>Yalnız sentetik veri · tarayıcınızda saklanır · canlı sisteme ve gerçek kayıtlara bağlı değildir.</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Sentetik kullanıcı:</span>
            {PROTO_OWNERS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => void switchOwner(o.id)}
                aria-pressed={o.id === ownerId}
                data-testid={`owner-${o.id}`}
                className={`min-h-[40px] rounded-2xl border px-3 text-[13px] font-bold transition ${
                  o.id === ownerId ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o.kind === "basit" ? "👩" : "🧑‍⚕️"} {o.name} <span className="font-semibold opacity-70">({o.kind})</span>
              </button>
            ))}
            {store === "yerel" ? (
              <button type="button" onClick={() => void resetSynthetic()} className="ml-auto text-[12px] font-bold text-slate-500 underline">
                Sentetik veriyi sıfırla
              </button>
            ) : null}
          </div>
          </>
          )}
        </section>

        {/* ── Yapışkan araç çubuğu: arama + yeni konu + çöp + Kaydet ── */}
        <div className="sticky top-0 z-30 -mx-4 mt-3 px-4 lg:-mx-6 lg:px-6" data-testid="toolbar">
          <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-white/80 bg-white/92 p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/90 backdrop-blur max-lg:rounded-2xl">
            {selected ? (
              <button type="button" className={`${btnGhost} lg:hidden`} onClick={() => setDrawer(true)} data-testid="open-drawer" aria-label="Bu konunun başlıklar menüsünü aç">
                ☰ Başlıklar
              </button>
            ) : null}
            <div className="relative min-w-[180px] flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Konu, başlık veya içerikte ara…"
                className="h-11 w-full rounded-2xl border border-emerald-100 bg-white pl-9 pr-3 text-[14px] font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                data-testid="search-input"
                aria-label="Ara"
              />
              {searchOpen && q.trim() ? (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.18)]" data-testid="search-results">
                  {hits.length ? (
                    hits.map((h) => (
                      <button
                        key={h.nodeId}
                        type="button"
                        onClick={() => {
                          select(h.nodeId);
                          setQ("");
                        }}
                        className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-emerald-50"
                        data-testid="search-hit"
                        data-node-id={h.nodeId}
                      >
                        <span className="block text-[14px] font-black text-slate-900">{h.path[h.path.length - 1]}{draft && pathOf(draft, h.nodeId)[0]?.scope === "kurum" ? <span className="ml-1.5 align-middle"><SharedBadge compact /></span> : null}</span>
                        <span className="block truncate text-[11px] font-semibold text-slate-500">
                          {h.path.length > 1 ? h.path.slice(0, -1).join(" › ") + " · " : ""}
                          {h.where === "başlık" ? "başlıkta" : h.where === "kutu adı" ? `kutu: ${h.blockTitle}` : `içerik: ${h.blockTitle}`}
                        </span>
                        {h.snippet ? <span className="mt-0.5 block line-clamp-2 text-[12px] text-slate-600">{h.snippet}</span> : null}
                      </button>
                    ))
                  ) : (
                    <p className="p-3 text-[13px] font-semibold text-slate-500">“{q}” için sonuç yok.</p>
                  )}
                </div>
              ) : null}
            </div>
            <button type="button" className={btnPrimary} onClick={() => setDialog({ kind: "newRoot" })} data-testid="new-topic">
              + Yeni Konu Ekle
            </button>
            <button type="button" className={btnGhost} onClick={() => setDialog({ kind: "trash" })} data-testid="open-trash">
              🗑 Çöp Kutusu{trashCount ? ` (${trashCount})` : ""}
            </button>
            <div className="flex items-center gap-2 max-lg:hidden">
              <SaveStatus dirty={dirty} total={changes.total} lastSavedAt={lastSavedAt} />
              {dirty ? (
                <button type="button" className={btnGhost} onClick={() => void askDiscard()} data-testid="discard">
                  Vazgeç
                </button>
              ) : null}
              <button type="button" className={`${btnPrimary} min-w-[120px]`} onClick={() => void save()} disabled={!dirty || saving} data-testid="save">
                💾 {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Ana alan: sol konu menüsü + sağ içerik ── */}
        <div className={`mt-3 grid gap-4 ${selected && openRoot ? "lg:grid-cols-[300px_minmax(0,1fr)]" : ""}`} data-screen={selected ? "konu" : "ana-konular"} data-testid="screen">
          {selected && openRoot ? (
            <aside className="max-lg:hidden" data-testid="tree-aside">
              <div className="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-y-auto rounded-[26px] border border-white/80 bg-white/86 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90">
                <TreePanel ws={draft} rootId={openRoot.id} simple={simple} selectedId={selectedId} expanded={expanded} onToggle={toggle} onSelect={select} onAllTopics={() => select(null)} />
              </div>
            </aside>
          ) : null}

          <section className="min-w-0 rounded-[26px] border border-white/80 bg-white/86 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90 sm:p-6 max-md:rounded-2xl max-md:p-3" data-testid="content">
            {selected && openRoot ? (
              <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2" data-testid="topic-header">
                <button
                  type="button"
                  onClick={() => select(null)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                  data-testid="all-topics"
                >
                  ← Tüm Konularım
                </button>
                <span className="min-w-0 truncate text-[12px] font-black uppercase tracking-[0.14em] text-slate-500" data-testid="open-root-title">
                  {openRoot.title}
                </span>
              </div>
            ) : null}
            {selected ? <ContentTabs tab={tab} onChange={changeTab} rootTitle={openRoot?.title ?? selected.title} /> : null}
            {selected && tab === "okuma" ? (
              <ReadingView
                ws={draft}
                rootId={rootOf(draft, selected.id)?.id ?? selected.id}
                focusId={selected.parentId ? selected.id : null}
                dirty={dirty}
                onOpenNode={(id) => select(id, "notlar")}
                onBackToNotes={() => changeTab("notlar")}
                onWord={store === "db" ? (rootId) => void downloadWord(rootId) : undefined}
              />
            ) : selected ? (
              <NodeView
                simple={simple}
                ws={draft}
                nodeId={selected.id}
                editing={editing}
                onSelect={select}
                onHome={() => select(null)}
                onNewChild={() => setDialog({ kind: "newChild", parentId: selected.id })}
                onRename={() => setDialog({ kind: "rename", nodeId: selected.id })}
                onMoveDialog={() => setDialog({ kind: "move", nodeId: selected.id })}
                onReorder={(dir) => runWs((ws) => reorderNode(ws, selected.id, dir, ctx))}
                onDelete={() => void deleteNode(selected.id)}
                onApplyTemplate={() => addTemplate(selected.id)}
                onNewBlock={() => setDialog({ kind: "newBlock", nodeId: selected.id })}
                onQuickNote={() => {
                  const r = run((ws) => addBlock(ws, { nodeId: selected.id, title: "Notlar" }, ctx), (v) => v.ws);
                  if (r) setEditing((prev) => new Set([...prev, r.block.id]));
                }}
                onLinkDialog={() => setDialog({ kind: "link", nodeId: selected.id })}
                onAddRelatedSection={() => {
                  const r = run((ws) => addRelatedSection(ws, selected.id, ctx), (v) => v.ws);
                  if (r) {
                    setExpanded((prev) => new Set([...prev, selected.id]));
                    select(r.sectionId);
                    showToast({ message: `“${RELATED_SECTION_TITLE}” bölümü eklendi. Kalıcı olması için Kaydet'e basın.`, type: "info" });
                  }
                }}
                onLinkRelated={() => setDialog({ kind: "linkRelated", sectionId: selected.id })}
                onCopy={store === "db" ? (rootId) => void copyToPersonal(rootId) : undefined}
                onUnlink={(linkId) => runWs((ws) => removeLink(ws, linkId))}
                blockProps={{ simple, onToggleEdit, onPatch, onMove: onMoveBlock, onDelete: (id) => void onDeleteBlock(id), newId: ctx.newId }}
              />
            ) : (
              <HomeView
                ws={draft}
                ownerName={owner.name}
                quickTitle={quickTitle}
                setQuickTitle={setQuickTitle}
                onQuickCreate={(withTemplate) => {
                  if (createRoot(quickTitle, withTemplate)) setQuickTitle("");
                }}
                onOpen={select}
              />
            )}
            {live && !selected ? <LegacyGuides /> : null}
            <p className="mt-6 border-t border-slate-100 pt-3 text-[11.5px] font-semibold leading-5 text-slate-500" data-testid="disclaimer">
              Bu alandaki içerikler uzmanın kişisel araştırma notlarıdır; tıbbi tanı veya tedavi önerisi değildir. Sınıf etiketleri (Bilimsel / Geleneksel / Dinî / Uzman Notu) yalnızca düzen içindir, kanıt düzeyi belirtmez.
            </p>
          </section>
        </div>
      </div>

      {/* ── Mobil: alt yapışkan Kaydet çubuğu ── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur ${simple ? "" : "lg:hidden"}`}
        data-testid="mobile-savebar"
      >
        <div className="mx-auto flex max-w-[640px] items-center gap-2">
          <div className="min-w-0 flex-1">
            <SaveStatus dirty={dirty} total={changes.total} lastSavedAt={lastSavedAt} compact />
          </div>
          {dirty ? (
            <button type="button" className={btnGhost} onClick={() => void askDiscard()}>
              Vazgeç
            </button>
          ) : null}
          <button type="button" className={`${btnPrimary} min-w-[110px] ${simple ? "lg:min-w-[180px] lg:text-[15px]" : ""}`} onClick={() => void save()} disabled={!dirty || saving} data-testid="save-mobile">
            💾 {simple && dirty ? "Notlarımı Kaydet" : "Kaydet"}
          </button>
        </div>
      </div>

      {/* ── Mobil: konu ağacı çekmecesi ── */}
      {drawer && selected && openRoot ? (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Başlıklar" data-testid="drawer">
          <button type="button" className="absolute inset-0 bg-slate-950/40" aria-label="Kapat" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,380px)] flex-col bg-[linear-gradient(180deg,#f6fffb_0%,#ffffff_100%)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">{openRoot.title}</span>
              <button type="button" className={btnGhost} onClick={() => setDrawer(false)} data-testid="close-drawer">
                Kapat ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24">
              <TreePanel ws={draft} rootId={openRoot.id} simple={simple} selectedId={selectedId} expanded={expanded} onToggle={toggle} onSelect={select} onAllTopics={() => select(null)} />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Pencereler ── */}
      {dialog?.kind === "newRoot" ? (
        <NewTopicDialog
          onCancel={() => setDialog(null)}
          onSubmit={(title, withTemplate) => {
            if (createRoot(title, withTemplate)) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "newChild" ? (
        <PromptDialog
          title="Alt başlık ekle"
          subtitle={`“${nodeById(draft, dialog.parentId)?.title ?? ""}” altına eklenecek.`}
          label="Alt başlık adı"
          confirmText="Ekle"
          testId="new-child-dialog"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            const r = run((ws) => addNode(ws, { parentId: dialog.parentId, title: v }, ctx), (x) => x.ws);
            if (r) {
              setDialog(null);
              setExpanded((prev) => new Set([...prev, dialog.parentId]));
            }
          }}
        />
      ) : null}
      {dialog?.kind === "rename" ? (
        <PromptDialog
          title="Yeniden adlandır"
          label="Başlık"
          initial={nodeById(draft, dialog.nodeId)?.title ?? ""}
          confirmText="Uygula"
          testId="rename-dialog"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            if (runWs((ws) => renameNode(ws, dialog.nodeId, v, ctx))) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "newBlock" ? (
        <PromptDialog
          title="İçerik kutusu ekle"
          subtitle="Kutuya istediğiniz adı verin. Önerilenler yalnız kolaylık içindir."
          label="Kutu adı"
          placeholder="Ör. Refleksoloji Notları"
          suggestions={BOX_SUGGESTIONS}
          confirmText="Kutuyu ekle"
          testId="new-block-dialog"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            const r = run((ws) => addBlock(ws, { nodeId: dialog.nodeId, title: v }, ctx), (x) => x.ws);
            if (r) {
              setDialog(null);
              setEditing((prev) => new Set([...prev, r.block.id]));
            }
          }}
        />
      ) : null}
      {dialog?.kind === "move" && nodeById(draft, dialog.nodeId) ? (
        <MoveDialog
          ws={draft}
          node={nodeById(draft, dialog.nodeId)!}
          onCancel={() => setDialog(null)}
          onMove={(parentId) => {
            if (runWs((ws) => moveNode(ws, dialog.nodeId, parentId, ctx))) {
              setDialog(null);
              select(dialog.nodeId);
              showToast({ message: "Başlık taşındı. Kalıcı olması için Kaydet'e basın.", type: "info" });
            }
          }}
        />
      ) : null}
      {dialog?.kind === "link" && nodeById(draft, dialog.nodeId) ? (
        <LinkDialog
          ws={draft}
          node={nodeById(draft, dialog.nodeId)!}
          onCancel={() => setDialog(null)}
          onLink={(toId) => {
            if (runWs((ws) => addLink(ws, dialog.nodeId, toId, ctx))) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "linkRelated" && nodeById(draft, dialog.sectionId) ? (
        <LinkDialog
          ws={draft}
          node={nodeById(draft, dialog.sectionId)!}
          title="Var olan bir rahatsızlığa bağla"
          subtitle="Aslı başka konuda duran kayıt buraya BAĞLANIR: kopyalanmaz, yerinden taşınmaz, mükerrer kayıt oluşmaz."
          extraExclude={new Set([...childrenOf(draft, dialog.sectionId).map((n) => n.id), ...pathOf(draft, dialog.sectionId).map((n) => n.id)])}
          onCancel={() => setDialog(null)}
          onLink={(toId) => {
            if (runWs((ws) => linkRelated(ws, dialog.sectionId, toId, ctx))) {
              setDialog(null);
              showToast({ message: "Bağlantı eklendi (kayıt kopyalanmadı). Kalıcı olması için Kaydet'e basın.", type: "info" });
            }
          }}
        />
      ) : null}
      {conflict ? (
        <ConflictDialog
          items={conflict.items}
          onApplyMine={() => void resolveConflict("uygula")}
          onTakeTheirs={() => void resolveConflict("birak")}
          onClose={() => setConflict(null)}
        />
      ) : null}
      {dialog?.kind === "trash" ? (
        <TrashDialog
          ws={draft}
          onCancel={() => setDialog(null)}
          onRestore={(e) => {
            const r = run((ws) => restoreBatch(ws, e.batchId, ctx), (v) => v.ws);
            if (r) {
              showToast({
                message: r.movedToRoot ? "Geri yüklendi (eski yeri silindiği için en üst seviyeye). Kaydet'e basın." : "Geri yüklendi. Kalıcı olması için Kaydet'e basın.",
                type: "success",
              });
            }
          }}
        />
      ) : null}
    </main>
  );
}

function SaveStatus({ dirty, total, lastSavedAt, compact }: { dirty: boolean; total: number; lastSavedAt: string | null; compact?: boolean }) {
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-800 ring-1 ring-amber-200" data-testid="dirty-indicator">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        {compact ? <span className="sm:hidden">{total} değişiklik</span> : null}
        <span className={compact ? "max-sm:hidden" : undefined}>{total} kaydedilmemiş değişiklik</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-700" data-testid="saved-indicator">
      ✓ {lastSavedAt ? `Kaydedildi ${new Date(lastSavedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : "Tüm değişiklikler kayıtlı"}
    </span>
  );
}

/** Konu ayrıntısının sol menüsü: YALNIZ açık ana konunun başlık ağacı (diğer ana konular burada yok). */
function TreePanel(props: {
  ws: Workspace;
  rootId: string;
  simple: boolean;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAllTopics: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={props.onAllTopics}
        className="mb-2 flex min-h-[40px] w-full items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 text-[12.5px] font-black text-emerald-800 hover:bg-emerald-50"
        data-testid="tree-home"
      >
        ← Tüm Konularım
      </button>
      <p className="mb-1.5 px-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Bu konunun başlıkları</p>
      <TopicTree ws={props.ws} rootId={props.rootId} simple={props.simple} selectedId={props.selectedId} expanded={props.expanded} onToggle={props.onToggle} onSelect={props.onSelect} />
    </>
  );
}

function HomeView({
  ws,
  ownerName,
  quickTitle,
  setQuickTitle,
  onQuickCreate,
  onOpen,
}: {
  ws: Workspace;
  ownerName: string;
  quickTitle: string;
  setQuickTitle: (v: string) => void;
  onQuickCreate: (withTemplate: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const roots = childrenOf(ws, null);
  return (
    <div data-testid="home-view">
      <div className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/50 to-cyan-50/40 p-5 sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Hoş geldiniz, {ownerName}</p>
        <h2 className="mt-1 text-[24px] font-black leading-tight sm:text-[28px]">Yeni bir konu başlatın</h2>
        <p className="mt-1 text-[14px] font-medium text-slate-600">Konunun adını yazmanız yeterli. İsterseniz Şifa Rehberi&apos;nin hazır başlıklarıyla (şablon) başlayabilirsiniz; zorunlu değildir.</p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            onQuickCreate(false);
          }}
        >
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Ör. Şiddetli Öksürük"
            maxLength={200}
            className="h-12 flex-1 rounded-2xl border border-emerald-200 bg-white px-4 text-[16px] font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            aria-label="Konu adı"
            data-testid="quick-title"
          />
          <button type="submit" className={`${btnPrimary} h-12 px-6 text-[14px]`} disabled={!quickTitle.trim()} data-testid="quick-create">
            Boş Konu Oluştur
          </button>
          <button
            type="button"
            className={`${btnGhost} h-12 border-emerald-200 px-4 text-emerald-800`}
            disabled={!quickTitle.trim()}
            onClick={() => onQuickCreate(true)}
            data-testid="quick-create-template"
          >
            📋 Şablonla Başla
          </button>
        </form>
      </div>

      <h2 className="mb-1 mt-7 text-[22px] font-black tracking-tight text-slate-950" data-testid="root-list-title">
        Ana Konularım <span className="text-slate-400">({roots.length})</span>
      </h2>
      <p className="mb-3 text-[13px] font-medium text-slate-500">Her ana konu kendi ekranında, yalnız kendi başlıklarıyla açılır.</p>
      {roots.length ? (
        <RootGroups ws={ws} roots={roots} onOpen={onOpen} />
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-5 text-[14px] font-semibold text-slate-500">Henüz konunuz yok. Yukarıya bir ad yazıp başlayın.</p>
      )}
    </div>
  );
}

/** Kurum kaydı yoksa liste tek parça (önceki görünüm); varsa "Kişisel" ve "Kurum Ortak" ayrı bölümler. */
function RootGroups({ ws, roots, onOpen }: { ws: Workspace; roots: TopicNode[]; onOpen: (id: string) => void }) {
  const shared = roots.filter((n) => n.scope === "kurum");
  const personal = roots.filter((n) => n.scope !== "kurum");
  const grid = (list: TopicNode[]) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((n) => (
        <RootCard key={n.id} ws={ws} n={n} onOpen={onOpen} />
      ))}
    </div>
  );
  if (!shared.length) return grid(personal);
  return (
    <div className="space-y-6">
      <section data-testid="personal-roots">
        <h3 className="mb-2 text-[12px] font-black uppercase tracking-[0.14em] text-emerald-800">👤 Kişisel Konularım ({personal.length})</h3>
        <p className="mb-2 text-[12.5px] font-medium text-slate-500">Yalnız siz görürsünüz.</p>
        {personal.length ? grid(personal) : <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-[13px] font-semibold text-slate-500">Henüz kişisel konunuz yok.</p>}
      </section>
      <section data-testid="shared-roots">
        <h3 className="mb-2 text-[12px] font-black uppercase tracking-[0.14em] text-indigo-800">🏛 Kurum Ortak Kayıtları ({shared.length})</h3>
        <p className="mb-2 text-[12.5px] font-medium text-slate-500">Eski Şifa Rehberi&apos;nden aktarıldı · kurumunuzdaki uzmanlar okur · salt-okunur.</p>
        {grid(shared)}
      </section>
    </div>
  );
}

function RootCard({ ws, n, onOpen }: { ws: Workspace; n: TopicNode; onOpen: (id: string) => void }) {
            const sub = subtreeIds(ws, n.id).size - 1;
            const boxes = ws.blocks.filter((b) => !b.deletedAt && subtreeIds(ws, n.id).has(b.nodeId)).length;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onOpen(n.id)}
                className="group rounded-[22px] border border-white/80 bg-white p-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-emerald-200"
                data-testid="root-card"
                data-node-id={n.id}
                data-scope={n.scope ?? "kisisel"}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-block rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-2.5 py-0.5 text-[11px] font-black text-white">
                    {sub} alt başlık · {boxes} kutu
                  </span>
                  {n.scope === "kurum" ? <SharedBadge compact /> : null}
                </span>
                <span className="mt-2 block break-words text-[18px] font-black uppercase leading-6 text-slate-950">{n.title}</span>
                <span className="mt-3 block text-[13px] font-black text-emerald-700 group-hover:underline">Aç →</span>
              </button>
            );
}

type BlockHandlers = {
  simple: boolean;
  onToggleEdit: (id: string) => void;
  onPatch: (id: string, patch: BlockPatch) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDelete: (id: string) => void;
  newId: () => string;
};

const actBtn =
  "inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-bold text-slate-700 shadow-sm transition hover:bg-emerald-50 disabled:opacity-35";

function NodeView({
  simple,
  ws,
  nodeId,
  editing,
  onSelect,
  onHome,
  onNewChild,
  onRename,
  onMoveDialog,
  onReorder,
  onDelete,
  onApplyTemplate,
  onNewBlock,
  onQuickNote,
  onLinkDialog,
  onUnlink,
  onAddRelatedSection,
  onLinkRelated,
  onCopy,
  blockProps,
}: {
  simple: boolean;
  ws: Workspace;
  nodeId: string;
  editing: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onHome: () => void;
  onNewChild: () => void;
  onRename: () => void;
  onMoveDialog: () => void;
  onReorder: (dir: "up" | "down") => void;
  onDelete: () => void;
  onApplyTemplate: () => void;
  onNewBlock: () => void;
  onQuickNote: () => void;
  onLinkDialog: () => void;
  onUnlink: (linkId: string) => void;
  onAddRelatedSection: () => void;
  onLinkRelated: () => void;
  /** Kurum kaydından kişisel kopya (yalnız kalıcı kayıtta). */
  onCopy?: (rootId: string) => void;
  blockProps: BlockHandlers;
}) {
  const node = nodeById(ws, nodeId)!;
  const path = pathOf(ws, nodeId);
  const kids = childrenOf(ws, nodeId);
  const blocks = blocksOf(ws, nodeId);
  const siblings = childrenOf(ws, node.parentId);
  const idx = siblings.findIndex((s) => s.id === nodeId);
  const isRel = isRelatedSection(node);
  // KURUM ortak kaydı: salt-okunur — hiçbir düzenleme aracı gösterilmez (sunucu da reddeder).
  const ro = node.scope === "kurum";
  // İlişkili Rahatsızlıklar bölümünün bağlantıları kendi panelinde gösterilir (iki kez listelenmez).
  const outgoing = isRel ? [] : linksFrom(ws, nodeId);
  const relatedLinked = isRel ? relatedEntries(ws, nodeId).filter((e) => e.kind === "bagli") : [];
  const canAddRelated = !simple && !ro && node.parentId === null && !relatedSectionOf(ws, nodeId);
  const tpl = templateEntry(node.templateKey);
  // Kilit: hazır başlık VEYA sistem bölümü (kararlı anahtarlı) — adı/yeri korunur.
  const locked = Boolean(node.templateKey);
  const missingTpl = locked ? 0 : missingTemplateCount(ws, nodeId);
  const hasTpl = kids.some((k) => templateEntry(k.templateKey));
  const lockTitle = locked ? TEMPLATE_LOCKED : undefined;
  const incoming = linksTo(ws, nodeId);

  return (
    <div data-testid="node-view" data-node-id={nodeId}>
      <nav aria-label="Konum" className="-mx-1 flex items-center gap-1 overflow-x-auto pb-1 text-[12px] font-bold text-slate-500" data-testid="breadcrumb">
        <button type="button" onClick={onHome} className="shrink-0 rounded-lg px-1.5 py-1 hover:bg-emerald-50 hover:text-emerald-800">
          Konularım
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="flex shrink-0 items-center gap-1">
            <span aria-hidden>›</span>
            {i === path.length - 1 ? (
              <span className="rounded-lg px-1.5 py-1 text-slate-900" aria-current="page">{p.title}</span>
            ) : (
              <button type="button" onClick={() => onSelect(p.id)} className="rounded-lg px-1.5 py-1 hover:bg-emerald-50 hover:text-emerald-800">
                {p.title}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {simple ? null : (
            <span className="mr-1.5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800" data-testid="level-badge">
              {path.length === 1 ? "Ana konu" : `${path.length}. seviye başlık`}
            </span>
          )}
          {tpl ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-800" data-testid="template-badge">
              📋 Hazır başlık{!simple && tpl.groupLabel !== tpl.label ? ` · ${tpl.groupLabel}` : ""}
            </span>
          ) : null}
          {ro ? <SharedBadge /> : null}
          {isRel ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-800" data-testid="system-section-badge">
              🩺 Sistem bölümü
            </span>
          ) : null}
          <h2 className="mt-1.5 break-words text-[28px] font-black leading-tight tracking-tight text-slate-950 sm:text-[34px]" data-testid="node-title">
            {tpl ? <span className="mr-2" aria-hidden data-testid="node-title-icon">{tpl.icon}</span> : null}
            <span data-testid="node-title-text">{node.title}</span>
          </h2>
        </div>
      </div>
      {ro ? <SharedBanner onCopy={onCopy && path[0] ? () => onCopy(path[0].id) : undefined} /> : (
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="node-actions">
        {simple ? null : (
          <>
            <button type="button" className={`${btnPrimary} min-h-[40px]`} onClick={onNewChild} data-testid="add-child">
              + Alt Başlık
            </button>
          </>
        )}
        {simple && locked ? null : (
          <button type="button" className={actBtn} onClick={onRename} disabled={locked} title={lockTitle} data-testid="rename">
            ✎ Yeniden Adlandır
          </button>
        )}
        {simple ? null : (
          <>
            <button type="button" className={actBtn} onClick={() => onReorder("up")} disabled={idx <= 0} data-testid="node-up" aria-label="Başlığı yukarı taşı">
              ↑ Yukarı
            </button>
            <button type="button" className={actBtn} onClick={() => onReorder("down")} disabled={idx >= siblings.length - 1} data-testid="node-down" aria-label="Başlığı aşağı taşı">
              ↓ Aşağı
            </button>
            <button type="button" className={actBtn} onClick={onMoveDialog} disabled={locked} title={lockTitle} data-testid="move">
              ⇄ Taşı
            </button>
          </>
        )}
        {simple && locked ? null : (
          <button type="button" className={btnDanger} onClick={onDelete} disabled={locked} title={lockTitle} data-testid="delete-node">
            🗑 Sil
          </button>
        )}
        {canAddRelated ? (
          <button type="button" className={`${actBtn} border-rose-200 text-rose-800`} onClick={onAddRelatedSection} data-testid="add-related-section">
            🩺 {RELATED_SECTION_TITLE} bölümü ekle
          </button>
        ) : null}
        {!tpl && !isRel && missingTpl > 0 ? (
          <button type="button" className={`${actBtn} border-cyan-200 text-cyan-800`} onClick={onApplyTemplate} data-testid="apply-template">
            📋 {hasTpl ? `Eksik hazır başlıkları ekle (${missingTpl})` : "Şifa Rehberi Şablonunu Ekle"}
          </button>
        ) : null}
      </div>
      )}
      {tpl && !simple && !ro ? (
        <p className="mt-2 rounded-xl bg-cyan-50/70 px-3 py-2 text-[12px] font-semibold text-cyan-900" data-testid="template-lock-note">
          🔒 Hazır Şifa Rehberi başlığı: adı ve yeri korunur. Bu başlığa doğrudan not yazabilir, altına istediğiniz kadar başlık ve içerik kutusu ekleyebilirsiniz.
        </p>
      ) : null}

      {isRel ? (
        <section className="mt-4 rounded-[22px] border border-rose-100 bg-rose-50/40 p-4" aria-label={RELATED_SECTION_TITLE} data-testid="related-panel">
          <p className="text-[13px] font-semibold leading-5 text-rose-950/80">
            🩺 Bu bölümde <b>{path[0]?.title}</b> ile ilişkili rahatsızlıklar durur. Aslı burada olan rahatsızlıklar alt başlık olarak açılır; aslı başka
            konuda olanlar ise kopyalanmadan <b>bağlanır</b> ve aynı özgün kaydı açar.
          </p>
          {relatedLinked.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-800/70">Başka konudan bağlananlar ({relatedLinked.length})</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {relatedLinked.map((e) =>
                  e.kind === "bagli" ? (
                    <span key={e.link.id} className="inline-flex max-w-full items-center overflow-hidden rounded-full border border-teal-200 bg-teal-50 text-[12.5px] font-bold text-teal-900">
                      <button type="button" onClick={() => onSelect(e.node.id)} className="min-w-0 px-3 py-1.5 text-left hover:bg-teal-100" data-testid="related-linked-chip" data-node-id={e.node.id}>
                        🔗 {e.node.title}
                        {e.originPath.length > 1 ? <span className="ml-1 font-semibold opacity-75">· aslı: {e.originPath.slice(0, -1).join(" › ")}</span> : null}
                      </button>
                      {simple || ro ? null : (
                        <button type="button" onClick={() => onUnlink(e.link.id)} className="shrink-0 border-l border-teal-200 px-2 py-1.5 text-teal-700 hover:bg-teal-100" aria-label={`${e.node.title} bağlantısını kaldır`} data-testid="related-unlink">
                          ✕
                        </button>
                      )}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
          {simple || ro ? null : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" className={`${btnPrimary} min-h-[40px]`} onClick={onNewChild} data-testid="related-new">
                + Yeni rahatsızlık
              </button>
              <button type="button" className={actBtn} onClick={onLinkRelated} data-testid="related-link">
                🔗 Var olan rahatsızlığa bağla
              </button>
            </div>
          )}
        </section>
      ) : null}

      {/* Alt başlıklar */}
      <section className={`mt-6 ${simple && !kids.length ? "hidden" : ""}`} aria-label="Alt başlıklar">
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{simple ? "Bu konunun bölümleri" : `Alt başlıklar (${kids.length})`}</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {kids.map((k) => {
            const kk = childrenOf(ws, k.id).length;
            const kb = blocksOf(ws, k.id).length;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => onSelect(k.id)}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3.5 py-2.5 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
                data-testid="child-card"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[14px]" aria-hidden>
                  {templateEntry(k.templateKey)?.icon ?? (isRelatedSection(k) ? "🩺" : k.templateKey === UNMATCHED_KEY ? "⚠️" : kk ? "📂" : "📄")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[14px] font-black leading-5 text-slate-900" data-testid="child-title">{k.title}</span>
                  <span className="block text-[11px] font-semibold text-slate-500">
                    {simple ? (
                      <>{kb ? "📝 not var" : "henüz not yok"}{kk ? ` · ${kk} bölüm` : ""}</>
                    ) : (
                      <>
                        {k.templateKey ? "hazır · " : ""}
                        {kk ? `${kk} alt başlık` : "alt başlık yok"} · {kb} kutu
                      </>
                    )}
                  </span>
                </span>
                <span className="text-slate-300" aria-hidden>›</span>
              </button>
            );
          })}
          {simple || ro ? null : (
            <button
              type="button"
              onClick={onNewChild}
              className="flex min-h-[56px] items-center justify-center rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/30 px-3 text-[13px] font-black text-emerald-800 hover:bg-emerald-50"
            >
              + Alt başlık ekle
            </button>
          )}
        </div>
      </section>

      {/* İçerik kutuları */}
      <section className="mt-6" aria-label={simple ? "Notlarım" : "İçerik kutuları"}>
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{simple ? "Notlarım" : `İçerik kutuları (${blocks.length})`}</h3>
        {blocks.length ? (
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <BlockCard key={b.id} block={b} index={i} count={blocks.length} editing={editing.has(b.id)} {...blockProps} readOnly={ro} />
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-emerald-200 bg-white/70 p-5 text-center">
            <p className="text-[14px] font-semibold text-slate-600">{ro ? "Bu bölümde not yok." : simple ? "Bu konuya henüz not yazmadınız." : "Bu başlıkta henüz içerik yok."}</p>
            {ro ? null : (
              <button type="button" onClick={onQuickNote} className={`${btnPrimary} mt-3 ${simple ? "min-h-[48px] px-6 text-[15px]" : ""}`} data-testid="quick-note">
                ✍️ {simple ? "Not yaz" : "Not yazmaya başla"}
              </button>
            )}
          </div>
        )}
        {simple || ro ? null : (
          <button
            type="button"
            onClick={onNewBlock}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-dashed border-emerald-300 bg-white/70 text-[13.5px] font-black text-emerald-800 hover:bg-emerald-50"
            data-testid="add-block"
          >
            + İçerik Kutusu Ekle
          </button>
        )}
        {simple && !ro ? (
          <button type="button" onClick={onNewChild} className="mt-4 text-[12.5px] font-bold text-emerald-800 underline decoration-emerald-300 underline-offset-4" data-testid="add-child-simple">
            + İsterseniz bu konuya bir bölüm (alt başlık) ekleyin
          </button>
        ) : null}
      </section>

      {/* İlgili konular */}
      <section
        className={`mt-6 rounded-[22px] border border-slate-100 bg-white/80 p-4 ${simple && !outgoing.length && !incoming.length ? "hidden" : ""}`}
        aria-label="İlgili konular"
        data-testid="links"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">İlgili konular</h3>
          {simple || ro ? null : (
            <button type="button" onClick={onLinkDialog} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[12px] font-bold text-emerald-800 hover:bg-emerald-50" data-testid="add-link">
              🔗 Konu Bağla
            </button>
          )}
        </div>
        {simple ? null : <p className="mt-1 text-[12px] font-medium text-slate-500">Bağlantı içerik kopyalamaz; tıklayınca aynı kayıt açılır.</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {outgoing.map(({ link, node: n }) => (
            <span key={link.id} className="inline-flex items-center overflow-hidden rounded-full border border-teal-200 bg-teal-50 text-[12.5px] font-bold text-teal-900">
              <button type="button" onClick={() => onSelect(n.id)} className="px-3 py-1.5 hover:bg-teal-100" data-testid="link-chip" data-node-id={n.id}>
                → {n.title}
              </button>
              {simple || ro ? null : (
                <button type="button" onClick={() => onUnlink(link.id)} className="border-l border-teal-200 px-2 py-1.5 text-teal-700 hover:bg-teal-100" aria-label={`${n.title} bağlantısını kaldır`}>
                  ✕
                </button>
              )}
            </span>
          ))}
          {!outgoing.length && !simple ? <span className="text-[12px] font-semibold text-slate-400">Bağlı konu yok.</span> : null}
        </div>
        {incoming.length ? (
          <div className="mt-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Bu konuya bağlananlar</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {incoming.map(({ link, node: n }) => (
                <button key={link.id} type="button" onClick={() => onSelect(n.id)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50" data-testid="backlink-chip">
                  ← {n.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Görünüm seçici — yalnız ekranı değiştirir; kayıtları silmez, taşımaz, çoğaltmaz. */
function ViewSwitch({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts: { id: ViewMode; label: string; hint: string }[] = [
    { id: "basit", label: "🌿 Basit Görünüm", hint: "Sade not yazma" },
    { id: "gelismis", label: "📚 Gelişmiş Görünüm", hint: "Tüm araştırma araçları" },
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-emerald-100 bg-white p-1 shadow-sm sm:inline-grid" role="radiogroup" aria-label="Görünüm" data-testid="view-switch">
      {opts.map((o) => {
        const active = o.id === view;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            data-testid={`view-${o.id}`}
            className={`flex min-h-[44px] flex-col items-start justify-center rounded-xl px-3.5 py-1 text-left transition [forced-color-adjust:none] ${
              active ? "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)]" : "text-slate-700 hover:bg-emerald-50"
            }`}
          >
            <span className="text-[13.5px] font-black leading-5">{o.label}</span>
            <span className={`text-[10.5px] font-semibold leading-4 ${active ? "text-white/85" : "text-slate-500"}`}>{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Seçili konu için sekmeler — her iki görünümde de aynı; görünüm seçicisinden bağımsız. */
function ContentTabs({ tab, onChange, rootTitle }: { tab: ContentTab; onChange: (t: ContentTab) => void; rootTitle: string }) {
  const opts: { id: ContentTab; label: string }[] = [
    { id: "notlar", label: "📝 Notlarım" },
    { id: "okuma", label: "📖 Bütüncül Okuma" },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="content-tabs">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 max-sm:w-full sm:inline-grid" role="tablist" aria-label="Konu sekmeleri">
        {opts.map((o) => {
          const active = o.id === tab;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.id)}
              data-testid={`tab-${o.id}`}
              className={`min-h-[42px] whitespace-nowrap rounded-xl px-4 text-[13.5px] font-black transition [forced-color-adjust:none] max-sm:px-2 max-sm:text-[12.5px] ${
                active ? "bg-white text-emerald-800 shadow-[0_4px_14px_rgba(15,23,42,0.08)] ring-1 ring-emerald-200" : "text-slate-600 hover:bg-white/70"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {tab === "okuma" ? <span className="min-w-0 truncate text-[12px] font-semibold text-slate-500">“{rootTitle}” konusunun tamamı</span> : null}
    </div>
  );
}
