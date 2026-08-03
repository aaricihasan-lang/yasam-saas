"use client";

// ============================================================
// YEBS A8 — Kaynak (source) detay ekranı (API-A3 + A7)
// source_type-duyarlı dinamik künye formu. Sekmeler:
//   Genel / Bağlantılar / Yaşam Döngüsü / Kayıt Bilgisi
// PATCH tüm 18 künye alanını kabul eder (yalnız değişenler + expected + reason).
// Yalnız 'draft' düzenlenebilir. Lifecycle grubu = "source" (arşiv dahil).
// UI yayın kapısını yalnız ÖN-UYARIR; kararı backend verir.
// ============================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApiResult, SourceRow } from "@/lib/yebs/ui/types";
import { SOURCE_TYPES } from "@/lib/yebs/ui/types";
import { SOURCE_TYPE_LABEL, statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { ENTITY_LIFECYCLE_GROUP, lifecycleActions, type LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import { sourcesApi, traditionsApi } from "@/app/admin/yebs/adminYebsApi";
import type { Eligibility } from "@/app/admin/yebs/adminYebsApi";
import { TraditionPicker } from "@/app/admin/yebs/components/pickers";
import { YebsPageShell, LoadingBlock, ErrorBlock, TextInput, SelectInput } from "@/app/admin/yebs/components/primitives";
import { DetailShell, LifecycleBar, RecordInfo, type TabDef } from "@/app/admin/yebs/components/DetailShell";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";
import { LifecycleModal } from "@/app/admin/yebs/components/LifecycleModal";
import { EligibilityPanel } from "@/app/admin/yebs/components/EligibilityPanel";
import { useToast } from "@/components/ui/ToastProvider";
import {
  requiredGateFields,
  evaluateSourceGate,
  describeGroup,
  type SourceGateFieldKey,
} from "@/app/admin/yebs/sources/sourceForm";

const fmt = (s: string) => new Date(s).toLocaleString("tr-TR");
const fmtDate = (s: string | null) => (s ? s : "—");
const GROUP = ENTITY_LIFECYCLE_GROUP.source;

type FormState = {
  source_type: string; title: string; language_tag: string; script_code: string;
  authors: string; organization: string; publisher: string; publication_year: string;
  dating_note: string; edition: string; doi: string; pmid: string; isbn: string;
  url: string; document_no: string; tradition_context_id: string; accessed_on: string; notes: string;
};

function fromRow(r: SourceRow): FormState {
  return {
    source_type: r.source_type,
    title: r.title,
    language_tag: r.language_tag,
    script_code: r.script_code ?? "",
    authors: r.authors ?? "",
    organization: r.organization ?? "",
    publisher: r.publisher ?? "",
    publication_year: r.publication_year != null ? String(r.publication_year) : "",
    dating_note: r.dating_note ?? "",
    edition: r.edition ?? "",
    doi: r.doi ?? "",
    pmid: r.pmid ?? "",
    isbn: r.isbn ?? "",
    url: r.url ?? "",
    document_no: r.document_no ?? "",
    tradition_context_id: r.tradition_context_id ?? "",
    accessed_on: r.accessed_on ?? "",
    notes: r.notes ?? "",
  };
}

const norm = (s: string): string | null => (s.trim() === "" ? null : s.trim());

const TEXT_FIELDS: { key: keyof FormState; label: string; hint?: string; gateKey?: SourceGateFieldKey }[] = [
  { key: "authors", label: "Yazar(lar)", gateKey: "authors" },
  { key: "organization", label: "Kurum", gateKey: "organization" },
  { key: "publisher", label: "Yayıncı", gateKey: "publisher" },
  { key: "dating_note", label: "Tarihlendirme notu", gateKey: "dating_note" },
  { key: "edition", label: "Baskı" },
  { key: "script_code", label: "Yazı kodu" },
];
const IDENTIFIER_FIELDS: { key: keyof FormState; label: string; gateKey?: SourceGateFieldKey }[] = [
  { key: "doi", label: "DOI", gateKey: "doi" },
  { key: "pmid", label: "PMID" },
  { key: "isbn", label: "ISBN", gateKey: "isbn" },
  { key: "url", label: "URL", gateKey: "url" },
  { key: "document_no", label: "Belge no", gateKey: "document_no" },
];

function gateValues(f: FormState): Partial<Record<SourceGateFieldKey, unknown>> {
  return {
    authors: f.authors, organization: f.organization, publisher: f.publisher, isbn: f.isbn,
    publication_year: f.publication_year ? Number(f.publication_year) : null,
    doi: f.doi, document_no: f.document_no, url: f.url, dating_note: f.dating_note,
  };
}

function LField({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/** Formu satırla karşılaştırıp yalnız DEĞİŞEN alanları içeren canonical patch üretir. */
function buildPatch(f: FormState, r: SourceRow): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (f.source_type !== r.source_type) patch.source_type = f.source_type;
  if (f.title.trim() !== r.title) patch.title = f.title.trim();
  if (f.language_tag.trim() !== r.language_tag) patch.language_tag = f.language_tag.trim();

  const nullable: (keyof FormState)[] = ["script_code", "authors", "organization", "publisher", "dating_note", "edition", "doi", "pmid", "isbn", "url", "document_no", "notes"];
  for (const k of nullable) {
    const nv = norm(f[k] as string);
    if (nv !== (r[k as keyof SourceRow] as string | null)) patch[k] = nv;
  }

  const yv = f.publication_year === "" ? null : Number(f.publication_year);
  if (yv !== r.publication_year) patch.publication_year = yv;

  const tv = f.tradition_context_id || null;
  if (tv !== r.tradition_context_id) patch.tradition_context_id = tv;

  const av = f.accessed_on || null;
  if (av !== r.accessed_on) patch.accessed_on = av;

  return patch;
}

export default function SourceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [row, setRow] = useState<SourceRow | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await sourcesApi.detail(id);
    if (r.ok) { setRow(r.data); setForm(fromRow(r.data)); }
    else setError(codeMeta(r.code).message);
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refetch(); }, [refetch]);

  if (loading && !row) return <YebsPageShell><LoadingBlock /></YebsPageShell>;
  if (error || !row || !form) {
    return (
      <YebsPageShell>
        <div className="mb-3"><Link href="/admin/yebs/sources" className="text-xs font-semibold text-slate-500 hover:text-violet-700">← Listeye dön</Link></div>
        <ErrorBlock message={error ?? "Kaynak bulunamadı."} onRetry={() => void refetch()} />
      </YebsPageShell>
    );
  }

  return <SourceDetailView row={row} form={form} setForm={setForm} refetch={refetch} showToast={showToast} id={id} />;
}

function SourceDetailView({
  row, form, setForm, refetch, showToast, id,
}: {
  row: SourceRow; form: FormState; setForm: (f: FormState) => void;
  refetch: () => Promise<void>;
  showToast: (o: { type?: "success" | "error" | "warning" | "info"; message: string }) => void;
  id: string;
}) {
  const isDraft = row.status === "draft";
  const set = (k: keyof FormState, v: string) => setForm({ ...form, [k]: v });

  const required = useMemo(() => requiredGateFields(form.source_type), [form.source_type]);
  const gate = useMemo(() => evaluateSourceGate(form.source_type, gateValues(form)), [form]);
  const patch = useMemo(() => buildPatch(form, row), [form, row]);

  const yearValid = form.publication_year === "" || (Number.isInteger(Number(form.publication_year)) && Number(form.publication_year) >= -3000 && Number(form.publication_year) <= 2100);
  const reqFilled = form.source_type !== "" && form.title.trim() !== "" && form.language_tag.trim() !== "";
  const dirty = isDraft && yearValid && reqFilled && Object.keys(patch).length > 0;

  const [showSaveReason, setShowSaveReason] = useState(false);
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [traditionLabel, setTraditionLabel] = useState<string | null>(null);

  const submitSave = useCallback(
    async (reason: string): Promise<ApiResult<unknown>> => {
      const body = { ...patch, expected_updated_at: row.updated_at, reason };
      const r = await sourcesApi.update(id, body);
      if (r.ok) { showToast({ type: "success", message: "Kaynak güncellendi." }); await refetch(); }
      return r;
    },
    [id, patch, refetch, row.updated_at, showToast],
  );

  const actions = lifecycleActions(GROUP, row.status);

  const mark = (gateKey?: SourceGateFieldKey) =>
    gateKey && required.has(gateKey)
      ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">yayın için gerekli</span>
      : null;

  const genel: TabDef = {
    key: "genel",
    label: "Genel",
    content: (
      <div className="max-w-3xl space-y-4">
        {!isDraft && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Bu kaynak {statusMeta(row.status).label.toLowerCase()} durumunda; alanlar yalnız taslak durumunda düzenlenebilir.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <LField label="Kaynak türü *" hint="Tür, yayın için gerekli künye alanlarını belirler.">
            <SelectInput value={form.source_type} onChange={(e) => set("source_type", e.target.value)} disabled={!isDraft} aria-label="Kaynak türü">
              {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABEL[t] ?? t}</option>)}
            </SelectInput>
          </LField>
          <LField label="Dil etiketi *">
            <TextInput value={form.language_tag} onChange={(e) => set("language_tag", e.target.value)} disabled={!isDraft} />
          </LField>
        </div>

        <LField label="Başlık *">
          <TextInput value={form.title} onChange={(e) => set("title", e.target.value)} disabled={!isDraft} />
        </LField>

        {gate.satisfied ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Bu türün yayın künyesi görünürde tam. (Nihai kararı backend kalite kapısı verir.)</p>
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-semibold">Yayın için eksik künye (bu türde):</p>
            <ul className="mt-1 list-disc pl-4">{gate.missingGroups.map((g, i) => <li key={i}>{describeGroup(g)}</li>)}</ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <LField label={<>Yayın yılı {mark("publication_year")}</>} hint="Tam sayı (ör. 1998).">
            <TextInput type="number" value={form.publication_year} onChange={(e) => set("publication_year", e.target.value)} disabled={!isDraft} />
          </LField>
          {TEXT_FIELDS.map((tf) => (
            <LField key={tf.key} label={<>{tf.label} {mark(tf.gateKey)}</>} hint={tf.hint}>
              <TextInput value={form[tf.key] as string} onChange={(e) => set(tf.key, e.target.value)} disabled={!isDraft} />
            </LField>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-slate-500">Tanımlayıcılar</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {IDENTIFIER_FIELDS.map((idf) => (
              <LField key={idf.key} label={<>{idf.label} {mark(idf.gateKey)}</>}>
                <TextInput value={form[idf.key] as string} onChange={(e) => set(idf.key, e.target.value)} disabled={!isDraft} />
              </LField>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LField label="Erişim tarihi" hint="Web/veritabanı kaynakları için (YYYY-AA-GG).">
            <TextInput type="date" value={form.accessed_on} onChange={(e) => set("accessed_on", e.target.value)} disabled={!isDraft} />
          </LField>
        </div>

        <LField label="Notlar">
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={!isDraft} rows={2} className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60" />
        </LField>

        {!yearValid && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Yayın yılı geçersiz (-3000 ile 2100 arası tam sayı).</p>}
      </div>
    ),
  };

  const baglantilar: TabDef = {
    key: "baglantilar",
    label: "Bağlantılar",
    content: <ContextTab row={row} form={form} setForm={setForm} isDraft={isDraft} traditionLabel={traditionLabel} setTraditionLabel={setTraditionLabel} />,
  };

  const yasam: TabDef = {
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
          { label: "Erişim tarihi", value: fmtDate(row.accessed_on) },
          { label: "Oluşturulma", value: fmt(row.created_at) },
          { label: "Güncellenme", value: fmt(row.updated_at) },
        ]}
      />
    ),
  };

  return (
    <YebsPageShell>
      <DetailShell
        backHref="/admin/yebs/sources"
        title={row.title}
        status={row.status}
        headerExtra={<span className="text-xs text-slate-500">{SOURCE_TYPE_LABEL[row.source_type] ?? row.source_type}</span>}
        tabs={[genel, baglantilar, yasam, kayit]}
        saving={false}
        dirty={dirty}
        onSave={isDraft ? () => setShowSaveReason(true) : undefined}
        lifecycleBar={<LifecycleBar actions={actions} onPick={setAction} />}
      />

      {showSaveReason && (
        <ReasonPrompt
          title="Kaynağı güncelle"
          recordLabel={row.title}
          submitLabel="Kaydet"
          submit={submitSave}
          onClose={() => setShowSaveReason(false)}
          onDone={() => setShowSaveReason(false)}
        />
      )}

      {action && (
        <LifecycleModal
          action={action}
          recordLabel={row.title}
          currentStatus={row.status}
          fetchEligibility={(t) => sourcesApi.eligibility(id, t).then((r) => (r.ok ? r.data : null))}
          submit={(reason) => sourcesApi.transition(id, { target_status: action.target, expected_updated_at: row.updated_at, reason })}
          onClose={() => setAction(null)}
          onDone={() => void refetch()}
        />
      )}
    </YebsPageShell>
  );
}

/** Bağlantılar sekmesi — kaynağın bağlam geleneği (draft iken düzenlenebilir picker). */
function ContextTab({
  row, form, setForm, isDraft, traditionLabel, setTraditionLabel,
}: {
  row: SourceRow; form: FormState; setForm: (f: FormState) => void; isDraft: boolean;
  traditionLabel: string | null; setTraditionLabel: (v: string | null) => void;
}) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (row.tradition_context_id) {
      void traditionsApi.detail(row.tradition_context_id).then((r) => { if (alive && r.ok) setResolved(r.data.name_tr); });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolved(null);
    }
    return () => { alive = false; };
  }, [row.tradition_context_id]);

  return (
    <div className="max-w-2xl space-y-3">
      <TraditionPickerImport
        value={form.tradition_context_id || null}
        valueLabel={traditionLabel ?? resolved}
        disabled={!isDraft}
        onPick={(pid, d) => { setForm({ ...form, tradition_context_id: pid ?? "" }); setTraditionLabel(d); }}
      />
      <p className="text-[11px] text-slate-400">
        Bağlam geleneği opsiyoneldir; yalnız taslak durumunda değiştirilebilir. Kaydetmek için “Genel” sekmesindeki
        alanlar gibi alt eylem çubuğundaki Kaydet kullanılır (gerekçe zorunlu).
      </p>
    </div>
  );
}

/** TraditionPicker draft değilken kilitlenir (pointer-events kapatılır). */
function TraditionPickerImport(p: { value: string | null; valueLabel: string | null; disabled?: boolean; onPick: (id: string | null, d: string | null) => void }) {
  return (
    <div className={p.disabled ? "pointer-events-none opacity-60" : ""}>
      <TraditionPicker value={p.value} valueLabel={p.valueLabel} onPick={p.onPick} />
    </div>
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
    const r = await sourcesApi.eligibility(id, gate.target);
    setElig(r.ok ? r.data : null);
    setLoading(false);
  }, [gate, id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void check(); }, [check]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
        <p className="text-sm text-slate-600">Geçerli durum: <span className="font-bold text-slate-800">{statusMeta(status).label}</span></p>
        <p className="mt-1 text-xs text-slate-400">
          İşlemler bu çubuktan ve sayfa altındaki eylem çubuğundan yürütülür. Her işlem için gerekçe zorunludur;
          yayın/geri-çekme/arşiv işlemleri bağımlılık ve künye kapısından geçer.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><LifecycleBar actions={actions} onPick={onPick} /></div>
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
