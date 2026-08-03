"use client";

// ============================================================
// YEBS A8 — Kavram (concept) oluşturma ekranı (API-A2 create)
// Exact create anahtarları: tradition_id (zorunlu UUID), slug (zorunlu),
// concept_type (zorunlu) + school_id (UUID|null), reason (opsiyonel).
// tradition_id/school_id yalnız picker ile seçilir; bilinmeyen anahtar GÖNDERİLMEZ.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { YebsPageShell, TextInput, SelectInput, Field } from "@/app/admin/yebs/components/primitives";
import { TraditionPicker, SchoolPicker } from "@/app/admin/yebs/components/pickers";
import { conceptsApi } from "@/app/admin/yebs/adminYebsApi";
import { CONCEPT_TYPES } from "@/lib/yebs/ui/types";
import { CONCEPT_TYPE_LABEL } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";

export default function ConceptNewPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [traditionId, setTraditionId] = useState<string | null>(null);
  const [traditionLabel, setTraditionLabel] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolLabel, setSchoolLabel] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [conceptType, setConceptType] = useState<string>("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = traditionId !== null && slug.trim() !== "" && conceptType !== "" && !saving;

  async function handleCreate() {
    if (!canSubmit || traditionId === null) return;
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = {
      tradition_id: traditionId,
      slug: slug.trim(),
      concept_type: conceptType,
      school_id: schoolId, // UUID | null
    };
    const r0 = reason.trim();
    if (r0) body.reason = r0;

    const r = await conceptsApi.create(body);
    setSaving(false);
    if (r.ok) {
      showToast({ type: "success", message: "Kavram oluşturuldu." });
      router.push(`/admin/yebs/concepts/${r.data.id}`);
      return;
    }
    setErr(codeMeta(r.code).message);
  }

  return (
    <YebsPageShell>
      <div className="mb-3">
        <Link href="/admin/yebs/concepts" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-violet-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Listeye dön
        </Link>
      </div>

      <h1 className="mb-4 text-lg font-black text-slate-900">Yeni Kavram</h1>

      <form
        className="grid max-w-2xl gap-4"
        onSubmit={(e) => { e.preventDefault(); void handleCreate(); }}
      >
        <TraditionPicker
          value={traditionId}
          valueLabel={traditionLabel}
          onPick={(id, d) => {
            setTraditionId(id);
            setTraditionLabel(d);
            setSchoolId(null);
            setSchoolLabel(null);
          }}
        />
        <p className="-mt-2 text-[11px] text-slate-400">Gelenek zorunludur. Kavram, seçilen geleneğin altında oluşturulur.</p>

        <SchoolPicker
          traditionId={traditionId ?? undefined}
          value={schoolId}
          valueLabel={schoolLabel}
          onPick={(id, d) => { setSchoolId(id); setSchoolLabel(d); }}
        />
        <p className="-mt-2 text-[11px] text-slate-400">Ekol opsiyoneldir. Boş bırakılırsa kavram gelenek düzeyinde kalır.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kısa ad (slug) *" hint="Gelenek içinde benzersiz teknik anahtar (ör. dan-tian).">
            <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ornek-kavram-slug" required />
          </Field>

          <Field label="Kavram türü *">
            <SelectInput value={conceptType} onChange={(e) => setConceptType(e.target.value)} required aria-label="Kavram türü">
              <option value="" disabled>Seçin…</option>
              {CONCEPT_TYPES.map((t) => (
                <option key={t} value={t}>{CONCEPT_TYPE_LABEL[t] ?? t}</option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <Field label="Gerekçe (opsiyonel)" hint="Denetim kaydı için oluşturma gerekçesi (en fazla 2000 karakter).">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Örn. Yeni gelenek içeriği girişi"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </Field>

        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{err}</p>}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={!canSubmit} className="btn-success inline-flex items-center gap-1.5 px-5 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Oluştur
          </button>
          <Link href="/admin/yebs/concepts" className="btn-soft px-4 py-2 text-sm">Vazgeç</Link>
        </div>
      </form>
    </YebsPageShell>
  );
}
