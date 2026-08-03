"use client";

// ============================================================
// YEBS A8 — Kaynak (source) oluşturma ekranı (API-A3 create)
// source_type-duyarlı dinamik künye formu: türe göre "yayın için gerekli"
// alanlar işaretlenir ve eksikler önceden uyarılır (UI otorite DEĞİL —
// yayın kararını backend kapısı verir: YEBS_SOURCE_METADATA_INCOMPLETE).
// Exact create anahtarları gönderilir; boş opsiyoneller GÖNDERİLMEZ.
// ============================================================

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { YebsPageShell, TextInput, SelectInput, Field } from "@/app/admin/yebs/components/primitives";
import { TraditionPicker } from "@/app/admin/yebs/components/pickers";
import { sourcesApi } from "@/app/admin/yebs/adminYebsApi";
import { SOURCE_TYPES } from "@/lib/yebs/ui/types";
import { SOURCE_TYPE_LABEL } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";
import {
  requiredGateFields,
  evaluateSourceGate,
  describeGroup,
  type SourceGateFieldKey,
} from "@/app/admin/yebs/sources/sourceForm";

type FormState = {
  source_type: string;
  title: string;
  language_tag: string;
  script_code: string;
  authors: string;
  organization: string;
  publisher: string;
  publication_year: string;
  dating_note: string;
  edition: string;
  doi: string;
  pmid: string;
  isbn: string;
  url: string;
  document_no: string;
  tradition_context_id: string;
  accessed_on: string;
  notes: string;
  reason: string;
};

const EMPTY: FormState = {
  source_type: "", title: "", language_tag: "", script_code: "", authors: "",
  organization: "", publisher: "", publication_year: "", dating_note: "", edition: "",
  doi: "", pmid: "", isbn: "", url: "", document_no: "", tradition_context_id: "",
  accessed_on: "", notes: "", reason: "",
};

/** Yerel alan sarmalayıcı — label ReactNode kabul eder (gate rozeti için). */
function LField({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

// Metin alanı yapılandırması (gateKey → yayın kapısında geçen alan anahtarı).
const TEXT_FIELDS: { key: keyof FormState; label: string; hint?: string; gateKey?: SourceGateFieldKey; wide?: boolean }[] = [
  { key: "authors", label: "Yazar(lar)", hint: "Virgülle ayrılmış.", gateKey: "authors" },
  { key: "organization", label: "Kurum", gateKey: "organization" },
  { key: "publisher", label: "Yayıncı", gateKey: "publisher" },
  { key: "dating_note", label: "Tarihlendirme notu", hint: "Klasik metinler için (ör. MÖ 2. yy).", gateKey: "dating_note" },
  { key: "edition", label: "Baskı" },
  { key: "script_code", label: "Yazı kodu", hint: "ISO 15924 (ör. Latn)." },
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
    authors: f.authors,
    organization: f.organization,
    publisher: f.publisher,
    isbn: f.isbn,
    publication_year: f.publication_year ? Number(f.publication_year) : null,
    doi: f.doi,
    document_no: f.document_no,
    url: f.url,
    dating_note: f.dating_note,
  };
}

export default function SourceNewPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [f, setF] = useState<FormState>(EMPTY);
  const [traditionLabel, setTraditionLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) => setF((p) => ({ ...p, [k]: v }));

  const required = useMemo(() => requiredGateFields(f.source_type), [f.source_type]);
  const gate = useMemo(() => evaluateSourceGate(f.source_type, gateValues(f)), [f]);

  const yearValid = f.publication_year === "" || (Number.isInteger(Number(f.publication_year)) && Number(f.publication_year) >= -3000 && Number(f.publication_year) <= 2100);
  const canSubmit = f.source_type !== "" && f.title.trim() !== "" && f.language_tag.trim() !== "" && yearValid && !saving;

  const mark = (gateKey?: SourceGateFieldKey) =>
    gateKey && required.has(gateKey)
      ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">yayın için gerekli</span>
      : null;

  async function handleCreate() {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);

    const body: Record<string, unknown> = {
      source_type: f.source_type,
      title: f.title.trim(),
      language_tag: f.language_tag.trim(),
    };
    const optStr: (keyof FormState)[] = ["script_code", "authors", "organization", "publisher", "dating_note", "edition", "doi", "pmid", "isbn", "url", "document_no", "notes"];
    for (const k of optStr) {
      const v = (f[k] as string).trim();
      if (v) body[k] = v;
    }
    if (f.publication_year !== "") body.publication_year = Number(f.publication_year);
    if (f.tradition_context_id) body.tradition_context_id = f.tradition_context_id;
    if (f.accessed_on) body.accessed_on = f.accessed_on;
    const r0 = f.reason.trim();
    if (r0) body.reason = r0;

    const r = await sourcesApi.create(body);
    setSaving(false);
    if (r.ok) {
      showToast({ type: "success", message: "Kaynak oluşturuldu." });
      router.push(`/admin/yebs/sources/${r.data.id}`);
      return;
    }
    setErr(codeMeta(r.code).message);
  }

  return (
    <YebsPageShell>
      <div className="mb-3">
        <Link href="/admin/yebs/sources" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-violet-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Listeye dön
        </Link>
      </div>
      <h1 className="mb-4 text-lg font-black text-slate-900">Yeni Kaynak</h1>

      <form className="grid max-w-3xl gap-4" onSubmit={(e) => { e.preventDefault(); void handleCreate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kaynak türü *" hint="Tür, yayın için hangi künye alanlarının gerekli olduğunu belirler.">
            <SelectInput value={f.source_type} onChange={(e) => set("source_type", e.target.value)} required aria-label="Kaynak türü">
              <option value="" disabled>Seçin…</option>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{SOURCE_TYPE_LABEL[t] ?? t}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Dil etiketi *" hint="BCP-47 (ör. tr, en, zh).">
            <TextInput value={f.language_tag} onChange={(e) => set("language_tag", e.target.value)} placeholder="tr" required />
          </Field>
        </div>

        <Field label="Başlık *">
          <TextInput value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Kaynağın başlığı" required />
        </Field>

        {/* Yayın kapısı ön-uyarısı */}
        {f.source_type !== "" && (
          gate.satisfied ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Bu türün yayın künyesi görünürde tam. (Nihai kararı yayın anında backend kalite kapısı verir.)
            </p>
          ) : (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">Yayın için eksik künye (bu türde):</p>
              <ul className="mt-1 list-disc pl-4">
                {gate.missingGroups.map((g, i) => <li key={i}>{describeGroup(g)}</li>)}
              </ul>
            </div>
          )
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <LField label={<>Yayın yılı {mark("publication_year")}</>} hint="Tam sayı (ör. 1998). Klasik metinler için negatif yıl da girilebilir.">
            <TextInput type="number" value={f.publication_year} onChange={(e) => set("publication_year", e.target.value)} placeholder="1998" />
          </LField>
          {TEXT_FIELDS.map((tf) => (
            <LField key={tf.key} label={<>{tf.label} {mark(tf.gateKey)}</>} hint={tf.hint}>
              <TextInput value={f[tf.key] as string} onChange={(e) => set(tf.key, e.target.value)} />
            </LField>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-slate-500">Tanımlayıcılar</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {IDENTIFIER_FIELDS.map((idf) => (
              <LField key={idf.key} label={<>{idf.label} {mark(idf.gateKey)}</>}>
                <TextInput value={f[idf.key] as string} onChange={(e) => set(idf.key, e.target.value)} />
              </LField>
            ))}
          </div>
        </div>

        <TraditionPicker
          value={f.tradition_context_id || null}
          valueLabel={traditionLabel}
          onPick={(id, d) => { setF((p) => ({ ...p, tradition_context_id: id ?? "" })); setTraditionLabel(d); }}
        />
        <p className="-mt-2 text-[11px] text-slate-400">Kaynağın bağlam geleneği (opsiyonel).</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Erişim tarihi (opsiyonel)" hint="Web/veritabanı kaynakları için (YYYY-AA-GG).">
            <TextInput type="date" value={f.accessed_on} onChange={(e) => set("accessed_on", e.target.value)} />
          </Field>
        </div>

        <Field label="Notlar (opsiyonel)">
          <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </Field>

        <Field label="Gerekçe (opsiyonel)" hint="Denetim kaydı için oluşturma gerekçesi.">
          <TextInput value={f.reason} onChange={(e) => set("reason", e.target.value)} maxLength={2000} />
        </Field>

        {!yearValid && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Yayın yılı geçersiz (-3000 ile 2100 arası tam sayı).</p>}
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{err}</p>}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={!canSubmit} className="btn-success inline-flex items-center gap-1.5 px-5 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Oluştur
          </button>
          <Link href="/admin/yebs/sources" className="btn-soft px-4 py-2 text-sm">Vazgeç</Link>
        </div>
      </form>
    </YebsPageShell>
  );
}
