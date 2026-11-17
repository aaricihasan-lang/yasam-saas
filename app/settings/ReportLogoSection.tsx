"use client";

/**
 * Ayarlar → Profilim → "Rapor logosu" (Uzman Profili F2).
 *
 * - Seçenekler: Logo kullanma · Çalışma alanı logomu kullan (uygulanan Kişisel Dijital Ofis tasarımındaki GÜNCEL logo) ·
 *   Raporlar için ayrı logo (yüklenmiş logolarınızdan seçin ya da mevcut yükleme akışıyla yeni logo yükleyin).
 * - Görseller yalnız mevcut Kişisel Dijital Ofis altyapısıyla yüklenir / okunur (lib/workspace/client: uploadAsset,
 *   listAssets, fetchAssetBlobUrl). Ham Storage URL'si istemciye hiç gelmez; önizleme güvenli görsel ucundan blob: URL'dir.
 * - Erişim kapalıysa (bayrak / kademeli açılış) seçenekler gösterilmez; açıklama + (önceden seçim varsa) kaldırma düğmesi.
 * - Seçim ayrı kaydedilir (/api/settings/profile/logo) ama profil ile AYNI sürümü kullanır: ebeveyn sürümü değişince
 *   (ör. profil formu kaydedildi / başka sekmede değişti) durum yeniden okunur; çakışmada 409 → güncel hâl yüklenir.
 * - Önizleme: F3 "B · Uzman İmzalı" yerleşimi — kapakta Yaşam Sistemi logosu + uzman ad · unvan / kurum satırı, rapor
 *   sonunda uzman logolu imza kartı, alt bilgide kurum. Uzman logosu her zaman İKİNCİLDİR (Yaşam Sistemi logosu korunur).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ImageIcon, Loader2, RotateCcw, Upload } from "lucide-react";
import { fetchLogo, saveLogo, type LogoView } from "@/lib/profile/client";
import type { LogoSourceValue } from "@/lib/profile/logoSchema";
import { fetchAssetBlobUrl, listAssets, preflightFile, uploadAsset, type AssetView } from "@/lib/workspace/client";

export type ReportPreviewIdentity = {
  fullName: string | null;
  title: string | null;
  organization: string | null;
  contactLine: string | null;
  brandingEnabled: boolean;
};

type Choice = { source: LogoSourceValue; assetId: string | null };
const variantUrl = (id: string, v: "desktop" | "mobile" = "mobile") => `/api/settings/workspace/assets/${id}?v=${v}`;
const sameChoice = (a: Choice, b: Choice) => a.source === b.source && (a.source !== "custom" || a.assetId === b.assetId);

/** Blob URL önbelleği (yalnız bu bileşenin ömrü; ayrılırken bırakılır). */
function useBlobUrls() {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const ref = useRef<Record<string, string | null>>({});
  const pending = useRef(new Set<string>());
  useEffect(() => () => { for (const u of Object.values(ref.current)) if (u) URL.revokeObjectURL(u); }, []);
  const ensure = useCallback((id: string | null) => {
    if (!id || id in ref.current || pending.current.has(id)) return;
    pending.current.add(id);
    void fetchAssetBlobUrl(variantUrl(id)).then((u) => {
      pending.current.delete(id);
      ref.current = { ...ref.current, [id]: u };
      setUrls(ref.current);
    });
  }, []);
  return { urls, ensure };
}

const OPTION = "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-violet-200";

export function ReportLogoSection({
  readOnly, parentVersion, identity, onSaved, onDirtyChange,
}: {
  readOnly: boolean;
  parentVersion: number;
  identity: ReportPreviewIdentity;
  /** Başarılı kayıt: önceki → yeni sürüm (ebeveyn yalnız kendi sürümü `prev` ise ilerletir). */
  onSaved: (prev: number, next: number, sel: Choice) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const idBase = useId().replace(/:/g, "");
  const [load, setLoad] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready" }>({ status: "loading" });
  const [view, setView] = useState<LogoView | null>(null);
  const [choice, setChoice] = useState<Choice>({ source: "none", assetId: null });
  const [assets, setAssets] = useState<{ status: "idle" | "loading" | "ok" | "error"; items: AssetView[] }>({ status: "idle", items: [] });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [upload, setUpload] = useState<{ busy: boolean; pct: number; error: string | null }>({ busy: false, pct: 0, error: null });
  const [reload, setReload] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { urls: blobUrls, ensure: ensureBlob } = useBlobUrls();
  const knownVersion = useRef(-1);
  const choiceDirty = useRef(false);

  const applyView = useCallback((v: LogoView, keepChoice: boolean) => {
    setView(v);
    knownVersion.current = v.version;
    if (!keepChoice) setChoice({ source: v.logo.source, assetId: v.logo.assetId });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetchLogo(ac.signal)
      .then((r) => {
        if (r.kind === "ok") { applyView(r.value, choiceDirty.current); setLoad({ status: "ready" }); }
        else setLoad({ status: "error", message: r.kind === "error" && r.code === "PROFILE_UNAVAILABLE" ? "Rapor logosu bölümü henüz kullanıma açılmadı." : "Rapor logosu bilgisi yüklenemedi." });
      })
      .catch(() => { /* ayrılındı */ });
    return () => ac.abort();
  }, [reload, applyView]);

  // Ebeveyn (profil formu) sürümü bizim bildiğimizden ileriyse durumu yeniden oku (bekleyen seçim korunur).
  useEffect(() => {
    if (knownVersion.current >= 0 && parentVersion > knownVersion.current) setReload((n) => n + 1);
  }, [parentVersion]);

  const access = view?.workspace.access === true;
  // "idle" + erişim açık = yükleniyor (istek bir kez gönderilir; yeniden denemede durum yeniden "idle" olur).
  const assetsReq = useRef(false);
  useEffect(() => {
    if (!access || assets.status !== "idle" || assetsReq.current) return;
    assetsReq.current = true;
    void listAssets().then((r) => {
      assetsReq.current = false;
      setAssets(r.kind === "ok" ? { status: "ok", items: r.value.filter((a) => a.kind === "logo") } : { status: "error", items: [] });
    });
  }, [access, assets.status]);

  const saved: Choice = view ? { source: view.logo.source, assetId: view.logo.assetId } : { source: "none", assetId: null };
  const dirty = !!view && !sameChoice(choice, saved);
  useEffect(() => { choiceDirty.current = dirty; onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const wsLogo = view?.workspace.logoAssetId ?? null;
  // Erişim kapalıyken görsel ucuna hiç istek gönderilmez.
  const previewId = !access ? null : choice.source === "workspace" ? wsLogo : choice.source === "custom" ? choice.assetId : null;
  useEffect(() => { ensureBlob(previewId); }, [previewId, ensureBlob]);
  useEffect(() => { for (const a of assets.items) ensureBlob(a.id); }, [assets.items, ensureBlob]);
  const previewUrl = previewId ? blobUrls[previewId] ?? null : null;
  const previewBroken = !!previewId && previewId in blobUrls && blobUrls[previewId] === null;

  const disabled = readOnly || saving || upload.busy;

  async function persist(next: Choice) {
    if (!view || readOnly) return;
    setSaving(true);
    setNotice(null);
    const expected = Math.max(view.version, parentVersion);
    try {
      const r = await saveLogo(expected, next.source, next.source === "custom" ? next.assetId : null);
      if (r.kind === "ok") {
        applyView(r.value, false);
        onSaved(expected, r.value.version, { source: r.value.logo.source, assetId: r.value.logo.assetId });
        setNotice({ tone: "ok", text: next.source === "none" ? "Rapor logosu kaldırıldı." : "Rapor logosu seçiminiz kaydedildi." });
      } else if (r.kind === "conflict") {
        applyView(r.current, true);
        setNotice({ tone: "warn", text: "Profiliniz başka bir sekmede ya da cihazda değişti. Güncel hâl yüklendi; seçiminizi kontrol edip yeniden kaydedin." });
      } else if (r.kind === "demo") {
        setNotice({ tone: "error", text: "Demo hesapta rapor logosu değiştirilemez." });
      } else {
        if (r.code === "LOGO_ASSET_INVALID") setAssets({ status: "idle", items: [] });
        setNotice({ tone: "error", text: r.error });
      }
    } finally {
      setSaving(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const pre = preflightFile(file, "logo");
    if (!pre.ok) { setUpload({ busy: false, pct: 0, error: pre.message }); return; }
    setUpload({ busy: true, pct: 0, error: null });
    setNotice(null);
    try {
      const r = await uploadAsset(file, "logo", (p) => setUpload((u) => ({ ...u, pct: p.phase === "chunk" ? Math.round((p.done / Math.max(1, p.total)) * 100) : p.phase === "process" ? 100 : 0 })));
      if (r.kind === "ok") {
        setAssets((a) => ({ status: "ok", items: [r.value, ...a.items.filter((x) => x.id !== r.value.id)] }));
        setChoice({ source: "custom", assetId: r.value.id });
        setUpload({ busy: false, pct: 0, error: null });
        setNotice({ tone: "warn", text: "Logo yüklendi ve seçildi. Raporlarda kullanmak için “Seçimi kaydet”e basın." });
      } else {
        setUpload({ busy: false, pct: 0, error: r.kind === "off" ? "Görsel alanına şu an erişilemiyor." : r.error });
      }
    } catch {
      setUpload({ busy: false, pct: 0, error: "Logo yüklenemedi. Lütfen yeniden deneyin." });
    }
  }

  if (load.status === "loading") {
    return <p className="flex items-center gap-2 text-sm text-slate-500" role="status" data-testid="report-logo-loading"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Rapor logosu yükleniyor…</p>;
  }
  if (load.status === "error" || !view) {
    return (
      <div className="space-y-2" data-testid="report-logo-error">
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{load.status === "error" ? load.message : "Rapor logosu bilgisi yüklenemedi."}
        </p>
        <button type="button" onClick={() => { setLoad({ status: "loading" }); setReload((n) => n + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RotateCcw className="h-4 w-4" aria-hidden /> Yeniden dene
        </button>
      </div>
    );
  }

  const status = view.logo.status;
  const name = `${idBase}-logo-src`;

  return (
    <div className="space-y-4" data-testid="report-logo" data-status={status}>
      <div>
        <h4 id={`${idBase}-logo-h`} className="text-sm font-black text-slate-900">Rapor logosu</h4>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Yaşam Sistemi logosu raporun kapağında aynen kalır; logonuz rapor sonundaki imza kartında ikincil olarak yer alır.
          {!identity.brandingEnabled && " Raporda görünmesi için yukarıdaki “Raporlarımda kurumsal bilgilerimi göster” anahtarı da açık olmalıdır."}
        </p>
      </div>

      {status === "missing" && !view.checkFailed && (
        <p role="alert" data-testid="report-logo-missing" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Logo bulunamadı, yeniden seçin. Seçtiğiniz logo silinmiş ya da artık kullanılamıyor; o zamana kadar raporlarınız logosuz üretilir.
        </p>
      )}
      {view.checkFailed && (
        <p role="alert" data-testid="report-logo-check-failed" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Logo durumu şu an doğrulanamadı. Biraz sonra yeniden deneyin.
        </p>
      )}

      {!access ? (
        <div className="space-y-3 rounded-xl bg-slate-50/80 p-3 sm:p-4" data-testid="report-logo-access-off">
          <p className="text-sm leading-relaxed text-slate-600">
            Rapor logosu, Kişisel Dijital Ofis görsel alanındaki logolarınızı kullanır. Bu alan hesabınızda şu an açık olmadığı için
            raporlarınız logosuz üretilir.
          </p>
          {saved.source !== "none" && !readOnly && (
            <button type="button" disabled={disabled} onClick={() => void persist({ source: "none", assetId: null })} data-testid="report-logo-clear"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Önceki logo seçimini kaldır
            </button>
          )}
        </div>
      ) : (
        <fieldset className="space-y-2" disabled={disabled} aria-labelledby={`${idBase}-logo-h`}>
          <label className={`${OPTION} ${choice.source === "none" ? "border-violet-300 bg-violet-50/60" : "border-slate-200 bg-white"}`}>
            <input type="radio" name={name} value="none" checked={choice.source === "none"} onChange={() => { setChoice({ source: "none", assetId: null }); setNotice(null); }} className="mt-1 h-4 w-4 accent-violet-600" data-testid="report-logo-opt-none" />
            <span className="min-w-0"><span className="block text-sm font-bold text-slate-800">Logo kullanma</span><span className="block text-xs text-slate-500">Raporlarınız logosuz üretilir.</span></span>
          </label>
          <label className={`${OPTION} ${choice.source === "workspace" ? "border-violet-300 bg-violet-50/60" : "border-slate-200 bg-white"}`}>
            <input type="radio" name={name} value="workspace" checked={choice.source === "workspace"} onChange={() => { setChoice({ source: "workspace", assetId: null }); setNotice(null); }} className="mt-1 h-4 w-4 accent-violet-600" data-testid="report-logo-opt-workspace" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800">Çalışma alanı logomu kullan</span>
              <span className="block text-xs text-slate-500">
                {wsLogo ? "Ana ekranınızdaki güncel logo kullanılır; tasarımda logoyu değiştirirseniz raporlarınız da değişir." : "Uygulanan çalışma alanı tasarımınızda şu an logo yok; bu seçenekte raporlar logosuz üretilir."}
              </span>
            </span>
            {wsLogo && (
              <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-[#F6F7F9]">
                {blobUrls[wsLogo] ? <img src={blobUrls[wsLogo]!} alt="" className="max-h-10 max-w-14 object-contain" /> : <ImageIcon className="h-4 w-4 text-slate-300" aria-hidden />}
              </span>
            )}
          </label>
          <div className={`${OPTION} flex-col ${choice.source === "custom" ? "border-violet-300 bg-violet-50/60" : "border-slate-200 bg-white"}`}>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="radio" name={name} value="custom" checked={choice.source === "custom"}
                onChange={() => { setChoice((c) => ({ source: "custom", assetId: c.source === "custom" ? c.assetId : saved.source === "custom" ? saved.assetId : assets.items[0]?.id ?? null })); setNotice(null); }}
                className="mt-1 h-4 w-4 accent-violet-600" data-testid="report-logo-opt-custom" />
              <span className="min-w-0"><span className="block text-sm font-bold text-slate-800">Raporlar için ayrı logo</span><span className="block text-xs text-slate-500">Yüklediğiniz logolardan birini seçin ya da yeni logo yükleyin.</span></span>
            </label>
            {choice.source === "custom" && (
              <div className="w-full space-y-2 pl-0 sm:pl-7" data-testid="report-logo-assets">
                {(assets.status === "loading" || assets.status === "idle") && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Logolarınız yükleniyor…</p>}
                {assets.status === "error" && <p className="text-xs font-semibold text-rose-600">Logolarınız listelenemedi. <button type="button" className="underline" onClick={() => setAssets({ status: "idle", items: [] })}>Yeniden dene</button></p>}
                {assets.status === "ok" && assets.items.length === 0 && <p className="text-xs text-slate-500">Henüz yüklenmiş logonuz yok.</p>}
                {assets.items.length > 0 && (
                  <div role="radiogroup" aria-label="Yüklenmiş logolarınız" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {assets.items.map((a, i) => {
                      const on = choice.assetId === a.id;
                      return (
                        <button key={a.id} type="button" role="radio" aria-checked={on} aria-label={`Logo ${i + 1} (${a.original.width}×${a.original.height})`}
                          onClick={() => { setChoice({ source: "custom", assetId: a.id }); setNotice(null); }} data-testid="report-logo-asset"
                          className={`flex aspect-[4/3] min-w-0 items-center justify-center rounded-lg border bg-[#F6F7F9] p-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 ${on ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300"}`}>
                          {blobUrls[a.id] ? <img src={blobUrls[a.id]!} alt="" className="max-h-full max-w-full object-contain" /> : <ImageIcon className="h-4 w-4 text-slate-300" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} data-testid="report-logo-file" tabIndex={-1} aria-hidden />
                    <button type="button" disabled={disabled} onClick={() => fileRef.current?.click()} data-testid="report-logo-upload"
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {upload.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
                      {upload.busy ? `Yükleniyor… %${upload.pct}` : "Yeni logo yükle"}
                    </button>
                    <span className="text-[11px] text-slate-500">PNG, JPEG veya WebP · en fazla 2 MB · şeffaf PNG önerilir</span>
                  </div>
                )}
                {upload.error && <p role="alert" className="text-xs font-semibold text-rose-600" data-testid="report-logo-upload-error">{upload.error}</p>}
              </div>
            )}
          </div>
        </fieldset>
      )}

      {access && (
        <ReportLogoPreview identity={identity} logoUrl={previewUrl} logoBroken={previewBroken}
          pending={choice.source === "custom" && !choice.assetId} source={choice.source} workspaceEmpty={choice.source === "workspace" && !wsLogo} />
      )}

      <div aria-live="polite">
        {notice && (
          <p role={notice.tone === "error" ? "alert" : "status"} data-testid="report-logo-notice" data-tone={notice.tone}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : notice.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
            {notice.tone === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{notice.text}
          </p>
        )}
      </div>

      {access && !readOnly && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" disabled={!dirty || disabled} onClick={() => { setChoice(saved); setNotice(null); }} data-testid="report-logo-cancel"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Vazgeç
          </button>
          <button type="button" disabled={!dirty || disabled || (choice.source === "custom" && !choice.assetId)} onClick={() => void persist(choice)} data-testid="report-logo-save"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-black text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {saving ? "Kaydediliyor…" : "Seçimi kaydet"}
          </button>
        </div>
      )}
    </div>
  );
}

/** F3 "B · Uzman İmzalı" yerleşiminin küçük, gerçekçi HTML/CSS önizlemesi (rapor üretilmez; veriler formdaki güncel değerlerdir). */
export function ReportLogoPreview({ identity, logoUrl, logoBroken, pending, source, workspaceEmpty }: {
  identity: ReportPreviewIdentity; logoUrl: string | null; logoBroken: boolean; pending: boolean; source: LogoSourceValue; workspaceEmpty: boolean;
}) {
  const name = identity.fullName ?? "Ad Soyad";
  const showLogo = source !== "none" && !!logoUrl;
  const caption = useMemo(() => {
    if (source === "none") return "Logosuz imza kartı";
    if (workspaceEmpty) return "Tasarımda logo yok → logosuz";
    if (pending) return "Önizleme için bir logo seçin";
    if (logoBroken) return "Logo okunamadı → rapor logosuz üretilir";
    return "Logonuz imza kartında";
  }, [source, workspaceEmpty, pending, logoBroken]);
  return (
    <figure className="space-y-2" data-testid="report-logo-preview" data-has-logo={showLogo ? "1" : "0"}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-bold text-slate-600">
        <span>Rapor önizlemesi · B · Uzman İmzalı</span><span className="font-semibold text-slate-400">{caption}</span>
      </figcaption>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {/* Kapak (1. sayfa üst kısmı) */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 pb-3 pt-4 text-center shadow-sm" aria-label="Kapak önizlemesi">
          <img src="/premium/brand/yasam-sistemi-logo.webp" alt="Yaşam Sistemi" className="mx-auto h-10 w-auto object-contain" />
          <div className="mx-auto mt-3 h-px w-4/5 bg-[#1F3A5F]/70" />
          <p className="mt-3 text-[11px] font-black tracking-[0.18em] text-[#1F3A5F]">DANIŞAN DOSYASI</p>
          <p className="text-[9px] text-slate-500">Bireysel Takip ve Analiz Raporu</p>
          <p className="mt-2 text-sm font-bold text-[#1F2937]">Örnek Danışan</p>
          <div className="mx-auto mt-2 h-px w-4/5 bg-slate-200" />
          <p className="mt-2 break-words text-[10px] text-slate-700"><b>{name}</b>{identity.title ? <span className="text-slate-500"> · {identity.title}</span> : null}</p>
          {identity.organization && <p className="break-words text-[9px] text-slate-500">{identity.organization}</p>}
        </div>
        {/* Rapor sonu: imza kartı + alt bilgi */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm" aria-label="İmza kartı önizlemesi">
          <div className="flex min-w-0 items-stretch gap-3 border-t-2 border-[#1F3A5F] bg-[#F6F7F9] p-3" data-testid="report-logo-signature">
            {showLogo && (
              <div className="flex w-[72px] shrink-0 items-center justify-center sm:w-[84px]">
                <img src={logoUrl!} alt="Uzman logosu" className="max-h-[46px] max-w-full object-contain" data-testid="report-logo-preview-img" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-black tracking-[0.2em] text-[#1F3A5F]">HAZIRLAYAN</p>
              <p className="break-words text-[13px] font-bold leading-tight text-[#1F2937]">{name}</p>
              {identity.title && <p className="break-words text-[10px] text-slate-600">{identity.title}</p>}
              {identity.organization && <p className="break-words text-[10px] font-bold text-slate-700">{identity.organization}</p>}
              {identity.contactLine && <p className="break-all text-[9px] text-slate-400">{identity.contactLine}</p>}
              <div className="mt-2 w-3/4 border-t border-slate-300 pt-0.5 text-[8px] text-slate-400">İmza</div>
            </div>
          </div>
          {identity.organization && <p className="mt-3 break-words text-center text-[8px] italic text-slate-400">{identity.organization}</p>}
        </div>
      </div>
    </figure>
  );
}
