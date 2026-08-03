"use client";

// ============================================================
// YEBS A8 — Yeni İddia (claim) oluştur
// Zorunlu: concept_id, claim_type, claim_text, provenance_kind, evidence_layer.
// Koşullu: safety → outcome_type + safety_topic (ikisi de zorunlu);
//          research_finding → outcome_type opsiyonel, safety_topic yok;
//          diğer → ikisi de yok. Backend nihai otoritedir.
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { YebsPageShell, Field, SelectInput, TextInput } from "@/app/admin/yebs/components/primitives";
import { ConceptPicker } from "@/app/admin/yebs/components/pickers";
import { claimsApi } from "@/app/admin/yebs/adminYebsApi";
import { CLAIM_TYPES, CLAIM_PROVENANCE_KINDS, EVIDENCE_LAYERS } from "@/lib/yebs/ui/types";
import { CLAIM_TYPE_LABEL, EVIDENCE_LAYER_LABEL } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";

const PROVENANCE_LABEL: Record<string, string> = {
  source_original: "Kaynak özgün",
  faithful_translation: "Sadık çeviri",
  editorial_explanation: "Editöryal açıklama",
  editorial_interpretation: "Editöryal yorum",
};

const SAFETY_OUTCOME_TYPES: { value: string; label: string }[] = [
  { value: "harm_shown", label: "Zarar gösterildi" },
  { value: "risk_suspected", label: "Risk şüphesi" },
  { value: "contraindicated", label: "Kontrendike" },
  { value: "source_does_not_recommend", label: "Kaynak önermiyor" },
  { value: "not_classified_as_risk", label: "Risk olarak sınıflanmamış" },
  { value: "insufficient_data", label: "Yetersiz veri" },
  { value: "conflicting", label: "Çelişkili" },
  { value: "unknown", label: "Bilinmiyor" },
];

const RESEARCH_OUTCOME_TYPES: { value: string; label: string }[] = [
  { value: "positive_finding", label: "Olumlu bulgu" },
  { value: "no_effect_found", label: "Etki bulunamadı" },
  { value: "mixed_findings", label: "Karışık bulgular" },
  { value: "insufficient_data", label: "Yetersiz veri" },
  { value: "no_study_done", label: "Çalışma yapılmamış" },
  { value: "conflicting", label: "Çelişkili" },
  { value: "unknown", label: "Bilinmiyor" },
];

const SAFETY_TOPIC_RE = /^[a-z][a-z0-9_]*$/;

export default function NewClaimPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [conceptId, setConceptId] = useState<string | null>(null);
  const [conceptLabel, setConceptLabel] = useState<string | null>(null);
  const [claimType, setClaimType] = useState<string>(CLAIM_TYPES[0]);
  const [claimText, setClaimText] = useState("");
  const [provenanceKind, setProvenanceKind] = useState<string>(CLAIM_PROVENANCE_KINDS[0]);
  const [evidenceLayer, setEvidenceLayer] = useState<string>(EVIDENCE_LAYERS[0]);
  const [outcomeType, setOutcomeType] = useState("");
  const [safetyTopic, setSafetyTopic] = useState("");
  const [reason, setReason] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isSafety = claimType === "safety";
  const isResearch = claimType === "research_finding";

  const hint = useMemo<string | null>(() => {
    if (!conceptId) return "Kavram seçilmelidir.";
    if (claimText.trim() === "") return "İddia metni gereklidir.";
    if (claimText.length > 20000) return "İddia metni 20000 karakteri aşamaz.";
    if (isSafety) {
      if (!outcomeType) return "Güvenlik iddiası için sonuç türü zorunludur.";
      if (safetyTopic.trim() === "") return "Güvenlik iddiası için güvenlik konusu zorunludur.";
      if (!SAFETY_TOPIC_RE.test(safetyTopic.trim())) return "Güvenlik konusu küçük harf/alt çizgi ile başlamalı (örn. karaciger_toksisitesi).";
    }
    return null;
  }, [conceptId, claimText, isSafety, outcomeType, safetyTopic]);

  const canSubmit = !busy && hint === null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true); setErr(null);

    const body: Record<string, unknown> = {
      concept_id: conceptId,
      claim_type: claimType,
      claim_text: claimText.trim(),
      provenance_kind: provenanceKind,
      evidence_layer: evidenceLayer,
    };
    if (isSafety) {
      body.outcome_type = outcomeType;
      body.safety_topic = safetyTopic.trim();
    } else if (isResearch) {
      if (outcomeType) body.outcome_type = outcomeType;
    }
    if (reason.trim() !== "") body.reason = reason.trim();

    const r = await claimsApi.create(body);
    setBusy(false);
    if (r.ok) {
      showToast({ type: "success", message: "İddia oluşturuldu." });
      router.push(`/admin/yebs/claims/${r.data.id}`);
      return;
    }
    setErr(codeMeta(r.code).message);
  }

  return (
    <YebsPageShell>
      <div className="mb-3">
        <Link href="/admin/yebs/claims" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-violet-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Listeye dön
        </Link>
      </div>
      <h1 className="mb-4 text-lg font-black text-slate-900">Yeni İddia</h1>

      <div className="max-w-2xl space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-5">
        <ConceptPicker value={conceptId} valueLabel={conceptLabel} onPick={(id, d) => { setConceptId(id); setConceptLabel(d); }} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="İddia Türü *">
            <SelectInput value={claimType} onChange={(e) => { setClaimType(e.target.value); setOutcomeType(""); setSafetyTopic(""); }}>
              {CLAIM_TYPES.map((t) => <option key={t} value={t}>{CLAIM_TYPE_LABEL[t] ?? t}</option>)}
            </SelectInput>
          </Field>
          <Field label="Kanıt Katmanı *">
            <SelectInput value={evidenceLayer} onChange={(e) => setEvidenceLayer(e.target.value)}>
              {EVIDENCE_LAYERS.map((l) => <option key={l} value={l}>{EVIDENCE_LAYER_LABEL[l] ?? l}</option>)}
            </SelectInput>
          </Field>
        </div>

        <Field label="Köken (provenance) *">
          <SelectInput value={provenanceKind} onChange={(e) => setProvenanceKind(e.target.value)}>
            {CLAIM_PROVENANCE_KINDS.map((p) => <option key={p} value={p}>{PROVENANCE_LABEL[p] ?? p}</option>)}
          </SelectInput>
        </Field>

        <Field label="İddia metni *" hint={`${claimText.length}/20000`}>
          <textarea value={claimText} onChange={(e) => setClaimText(e.target.value)} rows={4} maxLength={20000}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </Field>

        {isSafety && (
          <div className="grid gap-3 rounded-xl bg-rose-50/50 p-3 ring-1 ring-rose-100 sm:grid-cols-2">
            <Field label="Sonuç türü * (güvenlik)">
              <SelectInput value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)}>
                <option value="">Seç…</option>
                {SAFETY_OUTCOME_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Güvenlik konusu *" hint="Küçük harf + alt çizgi (örn. gebelik_riski).">
              <TextInput value={safetyTopic} onChange={(e) => setSafetyTopic(e.target.value)} placeholder="gebelik_riski" />
            </Field>
          </div>
        )}

        {isResearch && (
          <Field label="Sonuç türü (opsiyonel · araştırma)">
            <SelectInput value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)}>
              <option value="">Belirtilmemiş</option>
              {RESEARCH_OUTCOME_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
        )}

        <Field label="İşlem gerekçesi (opsiyonel)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </Field>

        {hint && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">{hint}</p>}
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{err}</p>}

        <div className="flex justify-end">
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="btn-success inline-flex items-center gap-1.5 px-5 disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Oluştur
          </button>
        </div>
      </div>
    </YebsPageShell>
  );
}
