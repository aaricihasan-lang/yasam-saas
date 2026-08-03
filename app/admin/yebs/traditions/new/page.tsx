"use client";

// ============================================================
// YEBS A8 — Yeni gelenek (tradition) oluşturma formu
// Yalnız create allowlist alanları gönderilir; reason opsiyonel.
// Native üçlü (ad/dil/yazı) birlikte sunulur.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { traditionsApi } from "@/app/admin/yebs/adminYebsApi";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";
import { YebsPageShell, TextInput, Field } from "@/app/admin/yebs/components/primitives";

const COLL = "traditions";

export default function NewTraditionPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [slug, setSlug] = useState("");
  const [nameTr, setNameTr] = useState("");
  const [traditionType, setTraditionType] = useState("");
  const [nativeName, setNativeName] = useState("");
  const [nativeLang, setNativeLang] = useState("");
  const [nativeScript, setNativeScript] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit =
    slug.trim() !== "" && nameTr.trim() !== "" && traditionType.trim() !== "" && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);

    const body: Record<string, unknown> = {
      slug,
      name_tr: nameTr,
      tradition_type: traditionType,
    };
    if (nativeName.trim()) body.native_name = nativeName;
    if (nativeLang.trim()) body.native_language_tag = nativeLang;
    if (nativeScript.trim()) body.native_script_code = nativeScript;
    if (reason.trim()) body.reason = reason;

    const r = await traditionsApi.create(body);
    setSaving(false);

    if (r.ok) {
      showToast({ type: "success", title: "Oluşturuldu", message: "Gelenek oluşturuldu." });
      router.push(`/admin/yebs/${COLL}/${r.data.id}`);
      return;
    }
    const meta = codeMeta(r.code);
    showToast({ type: "error", title: meta.title, message: meta.message });
  }

  return (
    <YebsPageShell>
      <div className="mb-3">
        <Link href={`/admin/yebs/${COLL}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-violet-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Listeye dön
        </Link>
      </div>
      <h1 className="mb-4 text-lg font-black text-slate-900">Yeni Gelenek</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl rounded-2xl border border-slate-200 bg-white/70 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kısa ad (slug) *" hint="Benzersiz teknik kimlik.">
            <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="ornek-gelenek" />
          </Field>
          <Field label="Ad (Türkçe) *">
            <TextInput value={nameTr} onChange={(e) => setNameTr(e.target.value)} required placeholder="Gelenek adı" />
          </Field>
          <Field label="Tür *" hint="Geleneğin türü.">
            <TextInput value={traditionType} onChange={(e) => setTraditionType(e.target.value)} required placeholder="Örn. tıp geleneği" />
          </Field>
        </div>

        <fieldset className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <legend className="px-1 text-xs font-bold text-slate-600">Özgün ad (opsiyonel)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Özgün ad">
              <TextInput value={nativeName} onChange={(e) => setNativeName(e.target.value)} placeholder="Özgün dildeki ad" />
            </Field>
            <Field label="Dil etiketi" hint="Örn. tr, ar, zh.">
              <TextInput value={nativeLang} onChange={(e) => setNativeLang(e.target.value)} placeholder="ar" />
            </Field>
            <Field label="Yazı kodu" hint="Örn. Latn, Arab, Hans.">
              <TextInput value={nativeScript} onChange={(e) => setNativeScript(e.target.value)} placeholder="Arab" />
            </Field>
          </div>
        </fieldset>

        <div className="mt-4">
          <Field label="Gerekçe (opsiyonel)" hint="En fazla 2000 karakter.">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Oluşturma gerekçesi" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Link href={`/admin/yebs/${COLL}`} className="btn-soft px-4 py-2 text-sm">Vazgeç</Link>
          <button type="submit" disabled={!canSubmit} className="btn-success inline-flex items-center gap-1.5 px-5 py-2 text-sm disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Oluştur
          </button>
        </div>
      </form>
    </YebsPageShell>
  );
}
