"use client";

// ============================================================
// YEBS A8 — Gelenek (tradition) detay: sekmeler + düzenleme + yaşam döngüsü
// - Genel: canonical alan düzenleme (yalnız taslakta), reason zorunlu (ReasonPrompt)
// - Yaşam Döngüsü: LifecycleBar + LifecycleModal (eligibility + reason)
// - Her başarılı mutasyondan sonra otoriter yeniden yükleme (optimistic YOK)
// ============================================================

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { traditionsApi } from "@/app/admin/yebs/adminYebsApi";
import type { TraditionRow } from "@/lib/yebs/ui/types";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { lifecycleActions, ENTITY_LIFECYCLE_GROUP, type LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import { statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { useToast } from "@/components/ui/ToastProvider";
import { YebsPageShell, LoadingBlock, ErrorBlock, TextInput, Field } from "@/app/admin/yebs/components/primitives";
import { DetailShell, LifecycleBar, RecordInfo, type TabDef } from "@/app/admin/yebs/components/DetailShell";
import { LifecycleModal } from "@/app/admin/yebs/components/LifecycleModal";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";

const COLL = "traditions";
const GROUP = ENTITY_LIFECYCLE_GROUP.tradition;

type Draft = {
  slug: string;
  name_tr: string;
  tradition_type: string;
  native_name: string;
  native_language_tag: string;
  native_script_code: string;
};

function toDraft(row: TraditionRow): Draft {
  return {
    slug: row.slug,
    name_tr: row.name_tr,
    tradition_type: row.tradition_type,
    native_name: row.native_name ?? "",
    native_language_tag: row.native_language_tag ?? "",
    native_script_code: row.native_script_code ?? "",
  };
}

/** "" → null (native alanları); dolu → aynen. */
function nz(v: string): string | null {
  return v.trim() === "" ? null : v;
}

export default function TraditionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { showToast } = useToast();

  const [row, setRow] = useState<TraditionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await traditionsApi.detail(id);
    if (r.ok) {
      setRow(r.data);
      setDraft(toDraft(r.data));
    } else {
      setError(codeMeta(r.code).message);
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const editable = row?.status === "draft";

  const dirty = useMemo(() => {
    if (!row || !draft) return false;
    return (
      draft.slug !== row.slug ||
      draft.name_tr !== row.name_tr ||
      draft.tradition_type !== row.tradition_type ||
      nz(draft.native_name) !== row.native_name ||
      nz(draft.native_language_tag) !== row.native_language_tag ||
      nz(draft.native_script_code) !== row.native_script_code
    );
  }, [row, draft]);

  const buildPatch = useCallback((): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (!row || !draft) return patch;
    if (draft.slug !== row.slug) patch.slug = draft.slug;
    if (draft.name_tr !== row.name_tr) patch.name_tr = draft.name_tr;
    if (draft.tradition_type !== row.tradition_type) patch.tradition_type = draft.tradition_type;
    if (nz(draft.native_name) !== row.native_name) patch.native_name = nz(draft.native_name);
    if (nz(draft.native_language_tag) !== row.native_language_tag) patch.native_language_tag = nz(draft.native_language_tag);
    if (nz(draft.native_script_code) !== row.native_script_code) patch.native_script_code = nz(draft.native_script_code);
    return patch;
  }, [row, draft]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  if (loading) {
    return <YebsPageShell><LoadingBlock /></YebsPageShell>;
  }
  if (error || !row || !draft) {
    return (
      <YebsPageShell>
        <ErrorBlock message={error ?? codeMeta(undefined).message} onRetry={load} />
      </YebsPageShell>
    );
  }

  const actions = lifecycleActions(GROUP, row.status);

  const generalTab = (
    <div className="max-w-2xl">
      {!editable && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
          Bu kayıt yalnız <span className="font-semibold">taslak</span> durumundayken düzenlenebilir. Düzenlemek için önce taslağa alın.
        </p>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kısa ad (slug)">
            <TextInput value={draft.slug} onChange={set("slug")} disabled={!editable} />
          </Field>
          <Field label="Ad (Türkçe)">
            <TextInput value={draft.name_tr} onChange={set("name_tr")} disabled={!editable} />
          </Field>
          <Field label="Tür">
            <TextInput value={draft.tradition_type} onChange={set("tradition_type")} disabled={!editable} />
          </Field>
        </div>

        <fieldset className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <legend className="px-1 text-xs font-bold text-slate-600">Özgün ad</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Özgün ad">
              <TextInput value={draft.native_name} onChange={set("native_name")} disabled={!editable} />
            </Field>
            <Field label="Dil etiketi">
              <TextInput value={draft.native_language_tag} onChange={set("native_language_tag")} disabled={!editable} />
            </Field>
            <Field label="Yazı kodu">
              <TextInput value={draft.native_script_code} onChange={set("native_script_code")} disabled={!editable} />
            </Field>
          </div>
        </fieldset>
      </div>
    </div>
  );

  const linksTab = (
    <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white/70 p-4">
      <p className="text-sm text-slate-600">
        Bu bir üst düzey gelenek kaydıdır; bağlı bir üst kayıt yoktur. Bu geleneğe bağlı ekolleri görüntüleyin:
      </p>
      <Link
        href={`/admin/yebs/schools?tradition_id=${row.id}`}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline"
      >
        Bu geleneğin ekolleri →
      </Link>
    </div>
  );

  const lifecycleTab = (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
        <p className="mb-1">
          Mevcut durum: <span className="font-semibold text-slate-800">{statusMeta(row.status).label}</span>
        </p>
        {actions.length > 0 ? (
          <p>
            Yapılabilecek işlemler alttaki işlem çubuğundan yürütülür:{" "}
            <span className="font-semibold text-slate-800">{actions.map((a) => a.label).join(", ")}</span>. Her işlem gerekçe ister; yayın gibi kalite kapılı geçişlerde uygunluk yeniden değerlendirilir.
          </p>
        ) : (
          <p>Bu durumda yürütülebilecek bir yaşam döngüsü işlemi yok.</p>
        )}
      </div>
    </div>
  );

  const recordTab = (
    <div className="max-w-2xl">
      <RecordInfo
        rows={[
          { label: "Durum", value: statusMeta(row.status).label },
          { label: "Oluşturuldu", value: new Date(row.created_at).toLocaleString("tr-TR") },
          { label: "Güncellendi", value: new Date(row.updated_at).toLocaleString("tr-TR") },
          { label: "Kimlik", value: <span className="font-mono text-[12px] text-slate-500">{row.id}</span> },
        ]}
      />
    </div>
  );

  const tabs: TabDef[] = [
    { key: "general", label: "Genel", content: generalTab },
    { key: "links", label: "Bağlantılar", content: linksTab },
    { key: "lifecycle", label: "Yaşam Döngüsü", content: lifecycleTab },
    { key: "record", label: "Kayıt Bilgisi", content: recordTab },
  ];

  return (
    <YebsPageShell>
      <DetailShell
        backHref={`/admin/yebs/${COLL}`}
        title={row.name_tr}
        status={row.status}
        tabs={tabs}
        saving={saving}
        dirty={dirty && editable}
        onSave={editable ? () => setShowReason(true) : undefined}
        lifecycleBar={<LifecycleBar actions={actions} onPick={setPendingAction} disabled={saving} />}
      />

      {showReason && (
        <ReasonPrompt
          title="Değişiklikleri kaydet"
          recordLabel={row.name_tr}
          submitLabel="Kaydet"
          submit={async (reason) => {
            setSaving(true);
            const r = await traditionsApi.update(id, { ...buildPatch(), expected_updated_at: row.updated_at, reason });
            setSaving(false);
            if (r.ok) showToast({ type: "success", title: "Kaydedildi", message: "Gelenek güncellendi." });
            return r;
          }}
          onClose={() => setShowReason(false)}
          onDone={() => void load()}
        />
      )}

      {pendingAction && (
        <LifecycleModal
          action={pendingAction}
          recordLabel={row.name_tr}
          currentStatus={row.status}
          fetchEligibility={(target) => traditionsApi.eligibility(id, target).then((r) => (r.ok ? r.data : null))}
          submit={(reason) => traditionsApi.transition(id, { target_status: pendingAction.target, expected_updated_at: row.updated_at, reason })}
          onClose={() => setPendingAction(null)}
          onDone={() => { showToast({ type: "success", title: "İşlem tamam", message: pendingAction.successMessage }); void load(); }}
        />
      )}
    </YebsPageShell>
  );
}
