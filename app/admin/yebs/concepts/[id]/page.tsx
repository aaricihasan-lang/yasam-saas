"use client";

// ============================================================
// YEBS A8 — Kavram (concept) detay ekranı (API-A2 + A7)
// Sekmeler: Genel / Bağlantılar / Etiketler / Yaşam Döngüsü / Kayıt Bilgisi
// PATCH yalnız slug + concept_type; parent (gelenek/ekol) değiştirilemez.
// Yalnız 'draft' düzenlenebilir. Yetkili yeniden-yükleme; optimistik güncelleme YOK.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApiResult, ConceptRow } from "@/lib/yebs/ui/types";
import { CONCEPT_TYPES } from "@/lib/yebs/ui/types";
import { CONCEPT_TYPE_LABEL, statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { ENTITY_LIFECYCLE_GROUP, lifecycleActions, type LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import { conceptsApi, traditionsApi, schoolsApi } from "@/app/admin/yebs/adminYebsApi";
import { YebsPageShell, LoadingBlock, ErrorBlock, TextInput, SelectInput, Field } from "@/app/admin/yebs/components/primitives";
import { DetailShell, LifecycleBar, RecordInfo, type TabDef } from "@/app/admin/yebs/components/DetailShell";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";
import { LifecycleModal } from "@/app/admin/yebs/components/LifecycleModal";
import { EligibilityPanel } from "@/app/admin/yebs/components/EligibilityPanel";
import type { Eligibility } from "@/app/admin/yebs/adminYebsApi";
import { LabelsTab } from "@/app/admin/yebs/concepts/[id]/LabelsTab";
import { useToast } from "@/components/ui/ToastProvider";

const fmt = (s: string) => new Date(s).toLocaleString("tr-TR");
const GROUP = ENTITY_LIFECYCLE_GROUP.concept;

export default function ConceptDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [row, setRow] = useState<ConceptRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Genel — düzenlenebilir alanlar
  const [slug, setSlug] = useState("");
  const [conceptType, setConceptType] = useState("");

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await conceptsApi.detail(id);
    if (r.ok) {
      setRow(r.data);
      setSlug(r.data.slug);
      setConceptType(r.data.concept_type);
    } else {
      setError(codeMeta(r.code).message);
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refetch(); }, [refetch]);

  if (loading && !row) {
    return <YebsPageShell><LoadingBlock /></YebsPageShell>;
  }
  if (error || !row) {
    return (
      <YebsPageShell>
        <div className="mb-3">
          <Link href="/admin/yebs/concepts" className="text-xs font-semibold text-slate-500 hover:text-violet-700">← Listeye dön</Link>
        </div>
        <ErrorBlock message={error ?? "Kavram bulunamadı."} onRetry={() => void refetch()} />
      </YebsPageShell>
    );
  }

  return <ConceptDetailView row={row} slug={slug} setSlug={setSlug} conceptType={conceptType} setConceptType={setConceptType} refetch={refetch} showToast={showToast} id={id} />;
}

function ConceptDetailView({
  row, slug, setSlug, conceptType, setConceptType, refetch, showToast, id,
}: {
  row: ConceptRow;
  slug: string; setSlug: (v: string) => void;
  conceptType: string; setConceptType: (v: string) => void;
  refetch: () => Promise<void>;
  showToast: (o: { type?: "success" | "error" | "warning" | "info"; message: string }) => void;
  id: string;
}) {
  const isDraft = row.status === "draft";
  const dirty = isDraft && slug.trim() !== "" && (slug !== row.slug || conceptType !== row.concept_type);

  const [showSaveReason, setShowSaveReason] = useState(false);
  const [action, setAction] = useState<LifecycleAction | null>(null);

  const submitSave = useCallback(
    async (reason: string): Promise<ApiResult<unknown>> => {
      const body: Record<string, unknown> = { expected_updated_at: row.updated_at, reason };
      if (slug !== row.slug) body.slug = slug.trim();
      if (conceptType !== row.concept_type) body.concept_type = conceptType;
      const r = await conceptsApi.update(id, body);
      if (r.ok) {
        showToast({ type: "success", message: "Kavram güncellendi." });
        await refetch();
      }
      return r;
    },
    [conceptType, id, refetch, row.concept_type, row.slug, row.updated_at, showToast, slug],
  );

  const actions = lifecycleActions(GROUP, row.status);

  const genel: TabDef = {
    key: "genel",
    label: "Genel",
    content: (
      <div className="max-w-2xl space-y-4">
        {!isDraft && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Bu kavram {statusMeta(row.status).label.toLowerCase()} durumunda; alanlar yalnız taslak durumunda düzenlenebilir.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kısa ad (slug)" hint="Gelenek içinde benzersiz teknik anahtar.">
            <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!isDraft} />
          </Field>
          <Field label="Kavram türü">
            <SelectInput value={conceptType} onChange={(e) => setConceptType(e.target.value)} disabled={!isDraft} aria-label="Kavram türü">
              {CONCEPT_TYPES.map((t) => (
                <option key={t} value={t}>{CONCEPT_TYPE_LABEL[t] ?? t}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <p className="text-[11px] text-slate-400">
          Kavramın insan-okunur adları “Etiketler” sekmesinde yönetilir. Bağlı gelenek/ekol değiştirilemez.
        </p>
      </div>
    ),
  };

  const baglantilar: TabDef = { key: "baglantilar", label: "Bağlantılar", content: <LinksTab row={row} /> };

  const etiketler: TabDef = {
    key: "etiketler",
    label: "Etiketler",
    content: <LabelsTab conceptId={id} conceptStatus={row.status} onChanged={() => void refetch()} />,
  };

  const yasamDongusu: TabDef = {
    key: "yasam",
    label: "Yaşam Döngüsü",
    content: <LifecycleTab id={id} status={row.status} actions={actions} onPick={setAction} />,
  };

  const kayit: TabDef = {
    key: "kayit",
    label: "Kayıt Bilgisi",
    content: (
      <RecordInfo
        rows={[
          { label: "Kimlik", value: <span className="font-mono text-xs">{row.id}</span> },
          { label: "Durum", value: statusMeta(row.status).label },
          { label: "Oluşturulma", value: fmt(row.created_at) },
          { label: "Güncellenme", value: fmt(row.updated_at) },
        ]}
      />
    ),
  };

  return (
    <YebsPageShell>
      <DetailShell
        backHref="/admin/yebs/concepts"
        title={row.slug}
        status={row.status}
        headerExtra={<span className="text-xs text-slate-500">{CONCEPT_TYPE_LABEL[row.concept_type] ?? row.concept_type}</span>}
        tabs={[genel, baglantilar, etiketler, yasamDongusu, kayit]}
        saving={false}
        dirty={dirty}
        onSave={isDraft ? () => setShowSaveReason(true) : undefined}
        lifecycleBar={<LifecycleBar actions={actions} onPick={setAction} />}
      />

      {showSaveReason && (
        <ReasonPrompt
          title="Kavramı güncelle"
          recordLabel={row.slug}
          submitLabel="Kaydet"
          submit={submitSave}
          onClose={() => setShowSaveReason(false)}
          onDone={() => setShowSaveReason(false)}
        />
      )}

      {action && (
        <LifecycleModal
          action={action}
          recordLabel={row.slug}
          currentStatus={row.status}
          fetchEligibility={(t) => conceptsApi.eligibility(id, t).then((r) => (r.ok ? r.data : null))}
          submit={(reason) => conceptsApi.transition(id, { target_status: action.target, expected_updated_at: row.updated_at, reason })}
          onClose={() => setAction(null)}
          onDone={() => void refetch()}
        />
      )}
    </YebsPageShell>
  );
}

/** Bağlantılar sekmesi — gelenek/ekol üst kayıtları (ad çözümlemeli link). */
function LinksTab({ row }: { row: ConceptRow }) {
  const [tradition, setTradition] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void traditionsApi.detail(row.tradition_id).then((r) => { if (alive && r.ok) setTradition(r.data.name_tr); });
    if (row.school_id) {
      void schoolsApi.detail(row.school_id).then((r) => { if (alive && r.ok) setSchool(r.data.name_tr); });
    }
    return () => { alive = false; };
  }, [row.tradition_id, row.school_id]);

  return (
    <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 sm:grid-cols-2">
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Gelenek</dt>
        <dd className="text-sm">
          <Link href={`/admin/yebs/traditions/${row.tradition_id}`} className="font-semibold text-violet-700 hover:underline">
            {tradition ?? row.tradition_id}
          </Link>
        </dd>
      </div>
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Ekol</dt>
        <dd className="text-sm">
          {row.school_id ? (
            <Link href={`/admin/yebs/schools/${row.school_id}`} className="font-semibold text-violet-700 hover:underline">
              {school ?? row.school_id}
            </Link>
          ) : (
            <span className="text-slate-500">Yok (gelenek düzeyi)</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Yaşam Döngüsü sekmesi — mevcut aksiyonlar + yayın/kalite ön-kontrolü. */
function LifecycleTab({
  id, status, actions, onPick,
}: {
  id: string; status: string; actions: LifecycleAction[]; onPick: (a: LifecycleAction) => void;
}) {
  const gate = actions.find((a) => a.eligibilityRequired) ?? null;
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    if (!gate) return;
    setLoading(true);
    const r = await conceptsApi.eligibility(id, gate.target);
    setElig(r.ok ? r.data : null);
    setLoading(false);
  }, [gate, id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void check(); }, [check]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
        <p className="text-sm text-slate-600">
          Geçerli durum: <span className="font-bold text-slate-800">{statusMeta(status).label}</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Yaşam döngüsü işlemleri aşağıdaki çubuktan (ve sayfa altındaki eylem çubuğundan) yürütülür.
          Her işlem için gerekçe zorunludur; yayın/geri-çekme işlemleri kalite kapısından geçer.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LifecycleBar actions={actions} onPick={onPick} />
        </div>
      </div>

      {gate && (
        <div>
          <p className="mb-1 text-xs font-bold text-slate-500">“{gate.label}” için ön-kontrol</p>
          <EligibilityPanel eligibility={elig} loading={loading} onRefresh={check} />
        </div>
      )}
    </div>
  );
}
