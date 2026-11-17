"use client";

/**
 * Ayarlar → "Profilim" (Uzman Profili F1).
 *
 * - Ad soyad ve giriş e-postası SALT OKUNUR (public.users; yalnız yönetici değiştirir).
 * - Mesleki bilgiler + rapor kimliği tercihleri /api/settings/profile üzerinden kaydedilir (iyimser sürüm; çakışmada 409).
 * - Rapor markalaması henüz hiçbir rapora uygulanmaz (ayrı aşama) → metinler bunu açıkça söyler; tercihler yalnız saklanır.
 * - Doğrulama tarayıcıda da sunucuyla AYNI kurallarla yapılır (lib/profile/schema.ts); sunucu yine kendisi doğrular.
 * - Kaydedilmemiş değişiklik: sekme değişiminde (onDirtyChange → sayfa sorar) ve sayfadan ayrılırken (beforeunload) uyarı.
 * - Demo hesapta form salt okunur; kaydet düğmesi yoktur.
 * - Rapor logosu (F2) ayrı bölümde ve ayrı uçta (ReportLogoSection → /api/settings/profile/logo) kaydedilir; profil ile aynı
 *   sürümü paylaşır. Bekleyen logo seçimi de "kaydedilmemiş değişiklik" sayılır.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Lock, RotateCcw, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { fetchProfile, saveProfile, type ProfileResponse } from "@/lib/profile/client";
import { ReportLogoSection } from "./ReportLogoSection";
import {
  PROFILE_FLAG_FIELDS, PROFILE_LIMITS, PROFILE_TEXT_FIELDS, charCount, normalizeProfileText,
  type FieldErrors, type ProfileFields, type ProfileFlagField, type ProfileTextField,
} from "@/lib/profile/schema";

type Form = { [K in ProfileTextField]: string } & { [K in ProfileFlagField]: boolean };

/** Ayarlar sekme çubuğu simgesi (sayfanın simge içe aktarım listesine dokunmamak için buradan verilir). */
export const PROFILE_TAB_ICON = UserRound;

export const PROFILE_LEAVE_MESSAGE = "Profilim sekmesinde kaydedilmemiş değişiklikler var. Kaydetmeden ayrılırsanız bu değişiklikler kaybolur. Devam edilsin mi?";

function toForm(p: ProfileFields): Form {
  const f = {} as Form;
  for (const k of PROFILE_TEXT_FIELDS) f[k] = p[k] ?? "";
  for (const k of PROFILE_FLAG_FIELDS) f[k] = p[k];
  return f;
}

function sameForm(a: Form, b: Form): boolean {
  return PROFILE_TEXT_FIELDS.every((k) => a[k] === b[k]) && PROFILE_FLAG_FIELDS.every((k) => a[k] === b[k]);
}

/** Tarayıcı tarafı doğrulama (sunucuyla aynı kurallar). */
function validate(f: Form): { errors: FieldErrors; patch: ProfileFields | null } {
  const errors: FieldErrors = {};
  const patch = {} as ProfileFields;
  for (const k of PROFILE_TEXT_FIELDS) {
    const r = normalizeProfileText(k, f[k]);
    if (r.ok) patch[k] = r.value;
    else errors[k] = r.error;
  }
  for (const k of PROFILE_FLAG_FIELDS) patch[k] = f[k];
  return { errors, patch: Object.keys(errors).length ? null : patch };
}

type FieldDef = { key: ProfileTextField; label: string; hint?: string; placeholder?: string; type?: "text" | "email" | "url" | "tel"; autoComplete?: string; inputMode?: "text" | "email" | "url" | "tel"; rows?: number; wide?: boolean };

const PROFESSIONAL: FieldDef[] = [
  { key: "title", label: "Unvan", placeholder: "ör. Uzman Psikolojik Danışman", autoComplete: "organization-title" },
  { key: "organization", label: "Kurum / işletme", placeholder: "ör. Yaşam Danışmanlık Merkezi", autoComplete: "organization" },
  { key: "phone", label: "Telefon", placeholder: "ör. +90 532 123 45 67", type: "tel", inputMode: "tel", autoComplete: "tel", hint: "Rakam, boşluk ve + - ( ) kullanılabilir." },
  { key: "contactEmail", label: "İletişim e-postası", placeholder: "ör. iletisim@alanadi.com", type: "email", inputMode: "email", autoComplete: "email", hint: "Danışanlarınızın size ulaşacağı adres; giriş e-postanızdan farklı olabilir." },
  { key: "website", label: "İnternet sitesi", placeholder: "https://www.alanadi.com", type: "url", inputMode: "url", autoComplete: "url", hint: "Yalnız https:// ile başlayan adresler.", wide: true },
  { key: "bio", label: "Kısa biyografi", placeholder: "Uzmanlık alanlarınızı ve yaklaşımınızı birkaç cümleyle anlatın.", rows: 5, wide: true },
];

const INPUT = "w-full rounded-xl border bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function TextField({ def, value, error, disabled, onChange, idBase }: { def: FieldDef; value: string; error?: string; disabled: boolean; onChange: (v: string) => void; idBase: string }) {
  const id = `${idBase}-${def.key}`;
  const max = PROFILE_LIMITS[def.key];
  const n = charCount(value);
  const over = n > max;
  const describedBy = [def.hint ? `${id}-hint` : null, `${id}-count`, error ? `${id}-err` : null].filter(Boolean).join(" ");
  const cls = `${INPUT} ${error || over ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"}`;
  return (
    <div className={def.wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="block text-sm font-bold text-slate-700">{def.label}</label>
      {def.rows ? (
        <textarea
          id={id} name={def.key} value={value} rows={def.rows} disabled={disabled} placeholder={def.placeholder}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} mt-1.5 resize-y py-3 leading-relaxed`}
        />
      ) : (
        <input
          id={id} name={def.key} value={value} type={def.type ?? "text"} inputMode={def.inputMode} autoComplete={def.autoComplete ?? "off"}
          disabled={disabled} placeholder={def.placeholder} spellCheck={def.type ? false : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} mt-1.5 h-11`}
        />
      )}
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          {error && <p id={`${id}-err`} className="text-xs font-semibold text-rose-600">{error}</p>}
          {def.hint && <p id={`${id}-hint`} className="text-[11px] leading-relaxed text-slate-500">{def.hint}</p>}
        </div>
        <p id={`${id}-count`} className={`shrink-0 text-[11px] tabular-nums ${over ? "font-bold text-rose-600" : "text-slate-400"}`}>
          <span className="sr-only">Karakter sayısı: </span>{n}/{max}
        </p>
      </div>
    </div>
  );
}

function Switch({ id, label, description, checked, disabled, onChange }: { id: string; label: string; description?: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-bold text-slate-800">{label}</p>
        {description && <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      <button
        id={id} type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-violet-600" : "bg-slate-300"}`}
      >
        <span aria-hidden className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export function ProfileSettingsTab({ readOnly: demoReadOnly, onDirtyChange }: { readOnly: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const { showToast } = useToast();
  const idBase = useId().replace(/:/g, "");
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready" }>({ status: "loading" });
  const [server, setServer] = useState<ProfileResponse | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    fetchProfile(ac.signal)
      .then((r) => {
        if (r.kind === "ok") {
          const f = toForm(r.value.profile);
          setServer(r.value); setSaved(f); setForm(f); setErrors({}); setState({ status: "ready" });
        } else {
          setState({ status: "error", message: r.kind === "error" && r.code === "PROFILE_UNAVAILABLE" ? "Profil bölümü henüz kullanıma açılmadı. Lütfen daha sonra yeniden deneyin." : "Profil bilgileri yüklenemedi. Lütfen yeniden deneyin." });
        }
      })
      .catch(() => { /* sayfadan ayrılındı */ });
    return () => ac.abort();
  }, [reload]);

  const readOnly = demoReadOnly || server?.readOnly === true;
  const formDirty = !!form && !!saved && !sameForm(form, saved);
  const [logoDirty, setLogoDirty] = useState(false);
  const dirty = formDirty || logoDirty;
  /** Logo kaydı profil sürümünü ilerletir; ebeveyn yalnız kendi bildiği sürüm `prev` ise izler (dış değişiklik varsa 409 akışı işler). */
  const onLogoSaved = useCallback((prev: number, next: number, sel: { source: "none" | "workspace" | "custom"; assetId: string | null }) => {
    setServer((s) => (s && s.version === prev ? { ...s, version: next, profile: { ...s.profile, logoSource: sel.source, logoAssetId: sel.assetId } } : s));
  }, []);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
    setNotice(null);
  }, []);

  const focusFirstError = (errs: FieldErrors) => {
    const first = PROFILE_TEXT_FIELDS.find((k) => errs[k]);
    if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !server || readOnly || saving) return;
    const v = validate(form);
    if (!v.patch) {
      setErrors(v.errors);
      setNotice({ tone: "error", text: "Bazı alanlar geçersiz. İşaretli alanları düzeltip yeniden kaydedin." });
      focusFirstError(v.errors);
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const r = await saveProfile(server.version, v.patch);
      if (r.kind === "ok") {
        const f = toForm(r.value.profile);
        setServer(r.value); setSaved(f); setForm(f); setErrors({});
        setNotice({ tone: "ok", text: "Profiliniz kaydedildi." });
        showToast({ title: "Kaydedildi", message: "Profil bilgileriniz güncellendi.", type: "success" });
      } else if (r.kind === "conflict") {
        // Değişiklikleriniz formda KORUNUR; temel sürüm güncellenir → kontrol edip yeniden kaydedebilirsiniz.
        setServer(r.current); setSaved(toForm(r.current.profile));
        setNotice({ tone: "warn", text: "Profiliniz başka bir sekmede ya da cihazda değişti. Güncel sürüm alındı; değişiklikleriniz formda duruyor — kontrol edip yeniden kaydedin." });
      } else if (r.kind === "invalid") {
        setErrors(r.fields);
        setNotice({ tone: "error", text: Object.keys(r.fields).length ? "Bazı alanlar geçersiz. İşaretli alanları düzeltip yeniden kaydedin." : r.error });
        focusFirstError(r.fields);
      } else if (r.kind === "demo") {
        setNotice({ tone: "error", text: "Demo hesapta profil değişikliği kaydedilemez." });
      } else {
        setNotice({ tone: "error", text: r.code === "PROFILE_UNAVAILABLE" ? "Profil şu anda kaydedilemiyor. Lütfen daha sonra yeniden deneyin." : r.error });
      }
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (!saved) return;
    setForm(saved);
    setErrors({});
    setNotice(null);
  }

  const account = server?.account;
  const brandingOn = form?.reportBrandingEnabled === true;
  const disabled = readOnly || saving;
  const errorCount = useMemo(() => Object.values(errors).filter(Boolean).length, [errors]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500" role="status" data-testid="settings-profile-loading">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Profil yükleniyor…
      </div>
    );
  }
  if (state.status === "error" || !form) {
    return (
      <div className="space-y-3 py-4" data-testid="settings-profile-error">
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{state.status === "error" ? state.message : "Profil bilgileri yüklenemedi."}
        </p>
        <button type="button" onClick={() => { setState({ status: "loading" }); setReload((n) => n + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
          <RotateCcw className="h-4 w-4" aria-hidden /> Yeniden dene
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6" data-testid="settings-profile">
      {/* Hesap bilgileri (salt okunur) */}
      <section aria-labelledby={`${idBase}-account`} className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/40 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><UserRound className="h-5 w-5" aria-hidden /></div>
          <h3 id={`${idBase}-account`} className="text-sm font-black text-slate-900">Hesap bilgileri</h3>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Ad soyad</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900" data-testid="profile-full-name">{account?.fullName ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Giriş e-postası</dt>
            <dd className="mt-1 break-all text-sm font-semibold text-slate-900" data-testid="profile-email">{account?.email ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Ad soyadınızı ve giriş e-postanızı yalnız yönetici değiştirebilir. Değişiklik için “Admin ile İrtibat” sekmesinden yazabilirsiniz.
        </p>
      </section>

      {readOnly && (
        <p role="note" data-testid="profile-demo-note" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Demo hesapta profil yalnız görüntülenebilir; değişiklik kaydedilemez.
        </p>
      )}

      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" aria-describedby={errorCount ? `${idBase}-summary` : undefined}>
        <section aria-labelledby={`${idBase}-pro`} className="space-y-4">
          <div>
            <h3 id={`${idBase}-pro`} className="text-base font-black text-slate-900">Mesleki bilgiler</h3>
            <p className="mt-0.5 text-xs text-slate-500">Tüm alanlar isteğe bağlıdır. Boş bıraktığınız alan hiçbir yerde gösterilmez.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROFESSIONAL.map((d) => (
              <TextField key={d.key} def={d} idBase={idBase} value={form[d.key]} error={errors[d.key]} disabled={disabled} onChange={(v) => set(d.key, v)} />
            ))}
          </div>
        </section>

        <section aria-labelledby={`${idBase}-report`} className="space-y-4 rounded-2xl border border-slate-100 bg-white/70 p-4 sm:p-5">
          <div>
            <h3 id={`${idBase}-report`} className="text-base font-black text-slate-900">Rapor kimliği</h3>
            <div className="mt-1 space-y-1 text-xs leading-relaxed text-slate-500" data-testid="profile-branding-status">
              <p>
                &quot;Raporlarımda kurumsal bilgilerimi göster&quot; açıkken seçtiğiniz bilgiler şu Word raporlarına eklenir: Danışan Yolculuğu, Numeroloji analiz,
                Klasik Numeroloji ve Beslenme planı. Bilgiler kapakta, rapor sonundaki imza bölümünde ve sayfa altında yer alır;
                yasal bilgilendirme metni aynen kalır.
              </p>
              <p>
                Human Design raporlarında adınız otomatik yazılmaz; yalnız raporda &quot;Hazırlayan&quot; alanı doluysa unvan ve kurum
                (profesyonel raporda ayrıca logo) eklenir, iletişim bilgisi ve dipnot eklenmez.
              </p>
              <p>
                Refleksoloji, Kupa (protokol ve takvim) ve Gökyüzü Atlası (Word ve PDF) raporlarında, anahtar açıkken rapor sonuna
                bir &quot;Hazırlayan&quot; imza bölümü eklenir; adınız otomatik yazılmaz, yalnız seçtiğiniz unvan, kurum, iletişim, logo ve
                dipnot yer alır.
              </p>
              <p>
                Hacamat raporunda (Word ve PDF) formdaki &quot;Hazırlayan&quot; adı aynen kalır, profil adınızla değiştirilmez; bu alan
                doluysa yalnız unvan, kurum ve logo eklenir, iletişim bilgisi ve dipnot eklenmez.
              </p>
              <p>Ansiklopediler, ders notları, stok ve arşiv dışa aktarımları bu kapsamda değildir. Anahtar kapalıyken hiçbir rapor değişmez.</p>
            </div>
          </div>
          <TextField
            def={{ key: "reportNote", label: "Rapor dipnotu", placeholder: "ör. Bu rapor bilgilendirme amaçlıdır; tıbbi tanı ve tedavinin yerini tutmaz.", rows: 3, wide: true, hint: "En fazla 4 satır." }}
            idBase={idBase} value={form.reportNote} error={errors.reportNote} disabled={disabled} onChange={(v) => set("reportNote", v)}
          />
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <Switch
              id={`${idBase}-brand`} label="Raporlarımda kurumsal bilgilerimi göster"
              description="Kapalıyken raporlarınız bugünkü gibi üretilir. Açtığınızda aşağıda seçtiğiniz bilgiler yukarıda sayılan raporlara eklenir."
              checked={brandingOn} disabled={disabled} onChange={(v) => set("reportBrandingEnabled", v)}
            />
            <fieldset className="space-y-3 rounded-xl bg-slate-50/80 p-3 sm:p-4" disabled={disabled || !brandingOn} aria-describedby={`${idBase}-subs-hint`}>
              <legend className="sr-only">Raporda gösterilecek bilgiler</legend>
              <p id={`${idBase}-subs-hint`} className="text-xs font-semibold text-slate-500">
                {brandingOn ? "Raporda gösterilecek bilgiler:" : "Raporda gösterilecek bilgiler (önce yukarıdaki anahtarı açın):"}
              </p>
              <Switch id={`${idBase}-s-title`} label="Unvan" checked={form.reportShowTitle} disabled={disabled || !brandingOn} onChange={(v) => set("reportShowTitle", v)} />
              <Switch id={`${idBase}-s-org`} label="Kurum / işletme" checked={form.reportShowOrganization} disabled={disabled || !brandingOn} onChange={(v) => set("reportShowOrganization", v)} />
              <Switch id={`${idBase}-s-contact`} label="İletişim bilgileri" description="Telefon, iletişim e-postası ve internet sitesi." checked={form.reportShowContact} disabled={disabled || !brandingOn} onChange={(v) => set("reportShowContact", v)} />
              <Switch id={`${idBase}-s-note`} label="Rapor dipnotu" checked={form.reportShowNote} disabled={disabled || !brandingOn} onChange={(v) => set("reportShowNote", v)} />
            </fieldset>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <ReportLogoSection
              readOnly={readOnly} parentVersion={server?.version ?? 0} onSaved={onLogoSaved} onDirtyChange={setLogoDirty}
              identity={{
                fullName: account?.fullName ?? null,
                title: form.reportShowTitle ? form.title.trim() || null : null,
                organization: form.reportShowOrganization ? form.organization.trim() || null : null,
                contactLine: form.reportShowContact ? [form.phone, form.contactEmail, form.website].map((x) => x.trim()).filter(Boolean).join(" · ") || null : null,
                brandingEnabled: brandingOn,
              }}
            />
          </div>
        </section>

        <div aria-live="polite" className="min-h-0">
          {errorCount > 0 && <span id={`${idBase}-summary`} className="sr-only">{errorCount} alanda hata var.</span>}
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"} data-testid="profile-notice" data-tone={notice.tone}
              className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : notice.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
            >
              {notice.tone === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              {notice.text}
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500" data-testid="profile-dirty-state">{formDirty ? "Kaydedilmemiş değişiklikleriniz var." : logoDirty ? "Rapor logosu seçiminiz kaydedilmedi." : "Tüm değişiklikler kaydedildi."}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button" onClick={onCancel} disabled={!formDirty || saving} data-testid="profile-cancel"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="submit" disabled={!formDirty || saving} data-testid="profile-save"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
