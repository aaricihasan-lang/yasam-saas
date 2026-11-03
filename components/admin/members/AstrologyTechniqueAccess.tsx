"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readSessionToken } from "@/lib/auth/yasamUser";
import {
  ASTRO_GRANT_CATEGORIES,
  ASTRO_GRANT_CATEGORY_LABELS,
  ASTRO_GRANT_ITEMS,
  ASTRO_GRANT_KEYS,
  categoryState,
  type AstroGrantCategory,
  type AstroTechniqueGrants,
} from "@/lib/astrology/access/techniqueGrants";

/**
 * Admin > Üye Detayı > Modül İzinleri · GÖKYÜZÜ ATLASI — TEKNİK İZİNLERİ (owner kararı 2026-11-03).
 *
 * • Astroloji anahtarı AÇILIRKEN modül hemen kaydedilmez: sağdan panel açılır; "İzinleri Kaydet" modülü ve teknikleri TEK
 *   istekte (sunucuda tek işlem) kaydeder. "İptal" / Esc / dış tıklama → hiçbir istek gönderilmez, önceki izinler aynen kalır.
 * • Astroloji açık uzmanda aynı panel "Teknikleri Düzenle" ile yeniden açılır (modül anahtarına dokunulmaz).
 * • Astroloji kapatma mevcut modül anahtarı akışıyla yapılır; teknik seçimi korunur, yeniden açılınca geri gelir.
 * • Tümü seçiliyken kayıt {mode:"all"} olur → ileride yayımlanan teknikler de açılır.
 */

const API = (userId: string) => `/api/admin/users/${encodeURIComponent(userId)}/astrology-techniques`;
const TOTAL = ASTRO_GRANT_KEYS.length;

function headers(adminId: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": adminId };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function selectionOf(grants: AstroTechniqueGrants | null): Set<string> {
  if (!grants) return new Set();
  return new Set(grants.mode === "all" ? ASTRO_GRANT_KEYS : grants.techniques);
}

type Loaded = { grants: AstroTechniqueGrants | null };

function TriCheckbox({
  state,
  onChange,
  label,
  className = "",
  testId,
}: {
  state: "none" | "some" | "all";
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <label className={`flex cursor-pointer select-none items-center gap-2 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5 shrink-0 cursor-pointer accent-violet-600"
        checked={state === "all"}
        aria-checked={state === "some" ? "mixed" : state === "all"}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span>{label}</span>
    </label>
  );
}

export function AstrologyTechniqueAccess({
  userId,
  adminId,
  moduleEnabled,
  openForEnableSignal,
  disabled = false,
  onModuleEnabled,
}: {
  userId: string;
  adminId: string;
  /** Sayfadaki Astroloji anahtarının KAYITLI durumu. */
  moduleEnabled: boolean;
  /** Artırıldıkça panel "Astroloji'yi aç" amacıyla açılır (anahtar kapalıyken açılmak istendi). */
  openForEnableSignal: number;
  disabled?: boolean;
  /** Kayıt modülü de açtıysa sunucunun döndürdüğü güncel izin haritası. */
  onModuleEnabled: (modulePermissions: unknown) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<null | "enable" | "edit">(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastSignal = useRef(openForEnableSignal);

  const load = useCallback(async (): Promise<Loaded | null> => {
    try {
      const res = await fetch(API(userId), { headers: headers(adminId), credentials: "same-origin", cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; grants?: AstroTechniqueGrants | null } | null;
      if (!res.ok || !body?.ok) throw new Error("load");
      const l = { grants: body.grants ?? null };
      setLoaded(l);
      setLoadError(false);
      return l;
    } catch {
      setLoadError(true);
      return null;
    }
  }, [userId, adminId]);

  useEffect(() => {
    if (!userId || !adminId) return;
    void load();
  }, [load, userId, adminId, moduleEnabled]);

  const openPanel = useCallback(
    async (mode: "enable" | "edit") => {
      setWarn(null);
      setMsg(null);
      // Panel her açılışta SUNUCUDAKİ kayıtlı seçimden başlar (yarım kalmış taslak taşınmaz).
      const l = (await load()) ?? loaded;
      if (!l) {
        setMsg({ ok: false, text: "Teknik izinleri okunamadı. Sayfayı yenileyip tekrar deneyin." });
        return;
      }
      setDraft(selectionOf(l.grants));
      setOpen(mode);
    },
    [load, loaded],
  );

  useEffect(() => {
    if (openForEnableSignal === lastSignal.current) return;
    lastSignal.current = openForEnableSignal;
    void openPanel("enable");
  }, [openForEnableSignal, openPanel]);

  const cancel = useCallback(() => {
    if (saving) return;
    setOpen(null);
    setWarn(null);
  }, [saving]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, cancel]);

  const allState: "none" | "some" | "all" = draft.size === 0 ? "none" : draft.size === TOTAL ? "all" : "some";
  const byCategory = useMemo(
    () => ASTRO_GRANT_CATEGORIES.map((c) => ({ c, items: ASTRO_GRANT_ITEMS.filter((i) => i.category === c) })),
    [],
  );

  const setMany = (keys: readonly string[], on: boolean) => {
    setWarn(null);
    setDraft((prev) => {
      const n = new Set(prev);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });
  };

  const save = async () => {
    if (!open || saving) return;
    if (draft.size === 0) {
      setWarn("Hiç teknik seçilmedi. Kaydetmek için en az bir teknik seçin ya da İptal ile çıkın.");
      return;
    }
    const grants: AstroTechniqueGrants =
      draft.size === TOTAL ? { mode: "all" } : { mode: "list", techniques: ASTRO_GRANT_KEYS.filter((k) => draft.has(k)) };
    setSaving(true);
    setWarn(null);
    try {
      const res = await fetch(API(userId), {
        method: "PUT",
        headers: headers(adminId, true),
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ grants, enableModule: open === "enable" }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; grants?: AstroTechniqueGrants | null; moduleEnabled?: boolean; modulePermissions?: unknown }
        | null;
      if (!res.ok || !body?.ok) {
        setWarn(body?.error ?? "Teknik izinleri kaydedilemedi. Önceki izinler değişmedi.");
        return;
      }
      setLoaded({ grants: body.grants ?? null });
      const enabledNow = open === "enable";
      setOpen(null);
      setMsg({
        ok: true,
        text: enabledNow ? "Astroloji açıldı ve teknik izinleri kaydedildi." : "Teknik izinleri kaydedildi.",
      });
      if (enabledNow) onModuleEnabled(body.modulePermissions);
    } catch {
      setWarn("Ağ hatası — kayıt doğrulanamadı. Önceki izinler değişmedi.");
    } finally {
      setSaving(false);
    }
  };

  const saved = loaded?.grants ?? null;
  const savedCount = saved ? (saved.mode === "all" ? TOTAL : saved.techniques.length) : 0;
  const summary = !saved
    ? "Teknik seçilmedi — uzman hiçbir Gökyüzü Atlası tekniğini kullanamaz."
    : saved.mode === "all"
      ? `Tüm teknikler açık (${TOTAL}/${TOTAL}) — ileride yayımlanan teknikler de otomatik açılır.`
      : `${savedCount}/${TOTAL} teknik açık.`;

  return (
    <>
      {moduleEnabled || saved ? (
        <div className="mt-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 p-4 md:p-5" data-astro-tech-summary>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">GÖKYÜZÜ ATLASI — TEKNİK İZİNLERİ</span>
              <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500" data-astro-tech-summary-text>
                {loadError && !loaded
                  ? "Teknik izinleri okunamadı."
                  : moduleEnabled
                    ? summary
                    : `Astroloji kapalı — kayıtlı teknik seçimi korunuyor (${savedCount}/${TOTAL}); erişim engelli. Astroloji yeniden açılınca bu seçim geri gelir.`}
              </span>
            </div>
            {moduleEnabled ? (
              <button
                type="button"
                disabled={disabled || saving}
                onClick={() => void openPanel("edit")}
                className="min-h-[44px] rounded-xl border border-indigo-300 bg-white px-4 text-sm font-bold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                data-astro-tech-edit
              >
                Teknikleri Düzenle
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {msg ? (
        <p role="status" className={`mt-2 text-xs font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`} data-astro-tech-msg>
          {msg.text}
        </p>
      ) : null}

      {/* Portal: üst bölümün backdrop-blur'u fixed konumu kapsayıcıya bağlamasın (panel ekrana göre, sağdan açılır). */}
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[70]" data-astro-tech-drawer-root>
          <div className="absolute inset-0 bg-slate-900/40" aria-hidden onClick={cancel} data-astro-tech-backdrop />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="astro-tech-title"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl outline-none md:w-1/2 md:min-w-[560px] md:max-w-[960px]"
            data-astro-tech-drawer
          >
            <header className="shrink-0 border-b border-slate-200 px-4 pb-3 pt-4 md:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="astro-tech-title" className="text-base font-black tracking-wide text-slate-950 md:text-lg">
                    GÖKYÜZÜ ATLASI — TEKNİK İZİNLERİ
                  </h2>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {open === "enable"
                      ? "Astroloji, izinler kaydedilince açılır. Kaydetmeden çıkarsanız hiçbir şey değişmez."
                      : "Değişiklikler yalnız “İzinleri Kaydet” ile uygulanır."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label="Paneli kapat"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100"
                >
                  ×
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2">
                <TriCheckbox
                  state={allState}
                  onChange={(on) => setMany(ASTRO_GRANT_KEYS, on)}
                  label="TÜMÜNÜ SEÇ"
                  className="text-sm font-black text-violet-900"
                  testId="astro-tech-all"
                />
                <button
                  type="button"
                  onClick={() => setMany(ASTRO_GRANT_KEYS, false)}
                  className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  data-astro-tech-clear
                >
                  SEÇİMİ TEMİZLE
                </button>
                <span className="ml-auto text-xs font-bold text-slate-600" data-astro-tech-count>
                  {draft.size} / {TOTAL} seçili
                </span>
              </div>
              {allState === "all" ? (
                <p className="mt-2 text-[11px] font-medium text-violet-800">
                  Tümü seçili: ileride yayımlanan ve onaylanan yeni teknikler de bu uzmana otomatik açılır.
                </p>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 md:px-6" data-astro-tech-scroll>
              {byCategory.map(({ c, items }) => (
                <section key={c} className="mb-5 last:mb-0" data-astro-tech-category={c}>
                  <div className="sticky top-0 z-[1] -mx-1 flex flex-wrap items-center justify-between gap-2 bg-white px-1 pb-1.5 pt-3">
                    <h3 className="text-xs font-black tracking-wider text-slate-800">
                      {ASTRO_GRANT_CATEGORY_LABELS[c as AstroGrantCategory]} <span className="text-slate-400">({items.length})</span>
                    </h3>
                    <TriCheckbox
                      state={categoryState(draft, c)}
                      onChange={(on) => setMany(items.map((i) => i.key), on)}
                      label={`Tümünü seç (${items.filter((i) => draft.has(i.key)).length}/${items.length})`}
                      className="text-xs font-bold text-slate-700"
                      testId={`astro-tech-cat-${c}`}
                    />
                  </div>
                  <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {items.map((i) => (
                      <label
                        key={i.key}
                        className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                          draft.has(i.key) ? "border-violet-300 bg-violet-50 text-violet-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 cursor-pointer accent-violet-600"
                          checked={draft.has(i.key)}
                          onChange={(e) => setMany([i.key], e.target.checked)}
                          data-astro-tech-item={i.key}
                        />
                        <span className="min-w-0 font-semibold leading-snug">{i.label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 md:px-6">
              {warn ? (
                <p role="alert" className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900" data-astro-tech-warn>
                  {warn}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  data-astro-tech-cancel
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="btn-primary min-h-[44px]"
                  data-astro-tech-save
                >
                  {saving ? "Kaydediliyor…" : "İzinleri Kaydet"}
                </button>
              </div>
            </footer>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
