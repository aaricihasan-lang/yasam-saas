"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — uzman ana sayfası kişiselleştirme durumu (tek kaynak).
 *
 * - Erişim sunucuda karar verilir (bayrak EXPERT_WORKSPACE_DESIGN_ENABLED + Owner / izin listesi / ROLLOUT_ALL).
 *   Uç 404 → status "off": ana sayfa P3 çıktısıyla BİREBİR aynı kalır (hiçbir sınıf / öğe / stil eklenmez).
 * - Tasarım (P1 design: applied / draft / history) ve tercihler (P1 prefs: gizleme, Favorilerim, görünüm modu, okuma)
 *   BAĞIMSIZDIR. "Tasarımımı sıfırla" yalnız tasarımı (applied) sıfırlar; tercihler korunur.
 * - Tasarım modunda çalışılan kopya `working`'tir; ekran onu gösterir. "Uygula"ya kadar kalıcı görünüm değişmez.
 * - Demo hesap: okuma serbest, yazma sunucuda 403 → arayüz düzenlemeyi kapatır (readOnly).
 * - Gizleme / favori yalnız görünürlüktür; modül yetkisi ve kilit kararı çağıranda kalır.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAssetBlobUrl, getDesign, getPrefs, postDesign, putPrefs,
  type ApiResult, type DesignActionBody, type DesignState, type PrefsState,
} from "@/lib/workspace/client";
import { parseDesign, DEFAULT_UI_PREFS, type UiPrefs, type WorkspaceDesign } from "@/lib/workspace/schema";
import { workspaceAssetUrl } from "@/lib/workspace/homeView";

export type PersonalStatus = "off" | "loading" | "on" | "error";
export type Notice = { tone: "ok" | "warn" | "error"; text: string; issues?: unknown } | null;

/** Varsayılan Yaşam Sistemi görünümünün tasarım karşılığı (A · İmza Bandı, karşılama metni, tema yok). */
export function defaultDesign(layout: WorkspaceDesign["layout"] = "A"): WorkspaceDesign {
  const r = parseDesign({ layout }, { allowAssets: true });
  if (!r.ok) throw new Error("default design");
  return r.value;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type PersonalWorkspace = ReturnType<typeof usePersonalWorkspace>;

export function usePersonalWorkspace(opts: { enabled: boolean; readOnly: boolean }) {
  const [loadedStatus, setStatus] = useState<PersonalStatus>("loading");
  const status: PersonalStatus = opts.enabled ? loadedStatus : "off";
  const [design, setDesign] = useState<DesignState | null>(null);
  const [prefs, setPrefsState] = useState<PrefsState | null>(null);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<WorkspaceDesign | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const assetReq = useRef(new Map<string, Promise<void>>());

  // İlk yükleme: erişim yoksa (404) "off" — başka hiçbir istek yapılmaz.
  useEffect(() => {
    if (!opts.enabled) return;
    const ac = new AbortController();
    (async () => {
      try {
        const d = await getDesign(ac.signal);
        if (d.kind === "off") { setStatus("off"); return; }
        if (d.kind !== "ok") { setStatus("error"); return; }
        const p = await getPrefs(ac.signal);
        if (p.kind === "off") { setStatus("off"); return; }
        setDesign(d.value);
        setPrefsState(p.kind === "ok" ? p.value : { ...DEFAULT_UI_PREFS, schemaVersion: 1, version: 0, updatedAt: null });
        setStatus("on");
      } catch {
        /* sayfadan ayrılındı */
      }
    })();
    return () => ac.abort();
  }, [opts.enabled]);

  // Blob URL'ler sayfa kapanınca bırakılır.
  useEffect(() => () => { Object.values(assetUrls).forEach((u) => URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Görsel varyantını (yalnız uuid) blob URL olarak çözer; yüklenene kadar null. */
  const assetSrc = useCallback((assetId: string | null | undefined, variant: "desktop" | "mobile"): string | null => {
    const url = workspaceAssetUrl(assetId, variant);
    if (!url) return null;
    const hit = assetUrls[url];
    if (hit) return hit;
    if (!assetReq.current.has(url)) {
      assetReq.current.set(url, fetchAssetBlobUrl(url).then((b) => {
        if (b) setAssetUrls((m) => ({ ...m, [url]: b }));
        else assetReq.current.delete(url);
      }));
    }
    return null;
  }, [assetUrls]);

  const applied = design?.applied ?? null;
  const viewDesign: WorkspaceDesign | null = editing ? working : applied;
  const dirty = editing && working !== null && !same(working, design?.draft ?? applied ?? defaultDesign());

  const handle = useCallback((r: ApiResult<DesignState>, okText?: string): boolean => {
    if (r.kind === "ok") { setDesign(r.value); if (okText) setNotice({ tone: "ok", text: okText }); return true; }
    if (r.kind === "conflict") {
      if (r.current) setDesign(r.current as DesignState);
      setNotice({ tone: "warn", text: r.error || "Tasarım başka bir sekmede değişti. Güncel hâli yüklendi." });
      return false;
    }
    if (r.kind === "off") { setStatus("off"); setEditing(false); return false; }
    setNotice({ tone: "error", text: r.error, issues: r.issues });
    return false;
  }, []);

  const run = useCallback(async (label: string, body: DesignActionBody, okText?: string): Promise<DesignState | null> => {
    if (!design || opts.readOnly) return null;
    setBusy(label);
    try {
      const r = await postDesign(design.version, body);
      return handle(r, okText) && r.kind === "ok" ? r.value : null;
    } finally {
      setBusy(null);
    }
  }, [design, opts.readOnly, handle]);

  const startEdit = useCallback(() => {
    if (!design || opts.readOnly) return;
    setWorking(clone(design.draft ?? design.applied ?? defaultDesign()));
    setNotice(null);
    setEditing(true);
  }, [design, opts.readOnly]);

  const updateWorking = useCallback((fn: (d: WorkspaceDesign) => WorkspaceDesign | void) => {
    setWorking((cur) => {
      if (!cur) return cur;
      const next = clone(cur);
      return (fn(next) as WorkspaceDesign | undefined) ?? next;
    });
  }, []);

  const saveDraft = useCallback(async () => {
    if (!working) return false;
    return (await run("saveDraft", { action: "saveDraft", draft: working }, "Taslak kaydedildi.")) !== null;
  }, [run, working]);

  const apply = useCallback(async () => {
    if (!working) return false;
    const s = await run("apply", { action: "apply", draft: working }, "Tasarım uygulandı.");
    if (s) { setEditing(false); setWorking(null); }
    return s !== null;
  }, [run, working]);

  /** Vazgeç: kaydedilmemiş değişiklikleri bırakır; sunucudaki taslak da silinir. */
  const discard = useCallback(async () => {
    if (design?.draft) await run("discardDraft", { action: "discardDraft" });
    setEditing(false);
    setWorking(null);
  }, [design?.draft, run]);

  /** Paneli kapatır; sunucudaki kayıtlı taslağa DOKUNMAZ (kaydedilmemiş değişiklik uyarısı panelde sorulur). */
  const closeEdit = useCallback(() => { setEditing(false); setWorking(null); }, []);

  /** Geçmişteki tasarımı TASLAĞA yükler (uygulamaz). */
  const loadHistory = useCallback(async (historyId: string) => {
    const s = await run("loadHistory", { action: "loadHistory", historyId }, "Önceki tasarım taslağa yüklendi.");
    if (s?.draft) setWorking(clone(s.draft));
  }, [run]);

  /** Geçmişteki tasarımı doğrudan UYGULAR. */
  const restore = useCallback(async (historyId: string) => {
    const s = await run("restore", { action: "restore", historyId }, "Önceki tasarıma dönüldü.");
    if (s) { setEditing(false); setWorking(null); }
  }, [run]);

  /** Taslağa varsayılan Yaşam Sistemi görünümünü yükler (uygulamaz). */
  const loadDefaultIntoDraft = useCallback(() => { setWorking(defaultDesign(working?.layout ?? "A")); }, [working?.layout]);

  /** Tasarımımı sıfırla: uygulanan tasarım kaldırılır (varsayılan görünüm). Gizleme / Favorilerim / görünüm modu KORUNUR. */
  const resetDesign = useCallback(async () => {
    const s = await run("reset", { action: "reset" }, "Varsayılan Yaşam Sistemi görünümüne dönüldü. Gizlenen modüller ve Favorilerim korundu.");
    if (s) { setEditing(false); setWorking(null); }
  }, [run]);

  /** Tercihler anında kaydedilir (tasarım taslağından bağımsız). Hata / çakışmada sunucudaki son hâl geri yüklenir. */
  const updatePrefs = useCallback(async (fn: (p: UiPrefs) => UiPrefs) => {
    if (!prefs || opts.readOnly) return false;
    const before = prefs;
    const next = fn({ hiddenModules: [...prefs.hiddenModules], favorites: [...prefs.favorites], cardLevel: prefs.cardLevel, viewMode: prefs.viewMode, reading: { ...prefs.reading } });
    setPrefsState({ ...prefs, ...next });
    const r = await putPrefs(before.version, next);
    if (r.kind === "ok") { setPrefsState(r.value); return true; }
    if (r.kind === "conflict") { setPrefsState((r.current as PrefsState) ?? before); setNotice({ tone: "warn", text: r.error }); return false; }
    if (r.kind === "off") { setStatus("off"); return false; }
    setPrefsState(before);
    setNotice({ tone: "error", text: r.error });
    return false;
  }, [prefs, opts.readOnly]);

  const uiPrefs: UiPrefs = useMemo(() => prefs ?? DEFAULT_UI_PREFS, [prefs]);

  return {
    status, readOnly: opts.readOnly, design, prefs: uiPrefs, prefsLoaded: prefs !== null,
    editing, working, viewDesign, dirty, busy, notice, setNotice,
    startEdit, closeEdit, updateWorking, saveDraft, apply, discard, loadHistory, restore, loadDefaultIntoDraft, resetDesign,
    updatePrefs, assetSrc,
  };
}
