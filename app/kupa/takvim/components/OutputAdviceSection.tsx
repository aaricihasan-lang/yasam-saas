"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnGhost, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";
import {
  createAdviceTemplate,
  updateAdviceTemplate,
  deleteAdviceTemplate,
  type CuppingAdviceTemplate,
  type CuppingCalendarPlan,
} from "@/app/kupa/lib/api";

/**
 * FAZ 5 / AŞAMA 3 — "Çıktı Bilgilendirme Notları" (takvim altında ENTEGRE bölüm).
 *
 * Genel, yeniden kullanılabilir bilgilendirme şablonları. Platform ASLA tıbbi metin
 * üretmez — içeriği uzman yazar. "Varsayılan" = uzmanın tercih ettiği BİLGİLENDİRME
 * şablonu (tıbbi tavsiye DEĞİL). Tek-aktif-varsayılan invariantı SUNUCUDA (RPC) korunur;
 * client concurrency logic YOK. Gösterim sırası: Öncesi → Sonrası → Genel/Ek Not.
 */
type FormState = {
  id: string | null; // null = yeni
  title: string;
  before_text: string;
  after_text: string;
  general_note: string;
  makeDefault: boolean;
};

const EMPTY: FormState = { id: null, title: "", before_text: "", after_text: "", general_note: "", makeDefault: false };

export function OutputAdviceSection({
  plan,
  templates,
  onTemplatesChanged,
  onAttach,
}: {
  plan: CuppingCalendarPlan;
  templates: CuppingAdviceTemplate[];
  onTemplatesChanged: () => Promise<void> | void;
  onAttach: (templateId: string | null) => Promise<void>;
}) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const activeTemplates = useMemo(() => templates.filter((t) => t.is_active !== false), [templates]);
  const attached = useMemo(
    () => templates.find((t) => t.id === plan.advice_template_id) ?? null,
    [templates, plan.advice_template_id],
  );

  async function handleAttach(value: string) {
    try {
      await onAttach(value || null);
      showToast({ message: value ? "Şablon bu takvime bağlandı." : "Şablon bağlantısı kaldırıldı.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "İşlem başarısız.", type: "error" });
    }
  }

  function startNew() {
    setForm({ ...EMPTY });
  }
  function startEdit(t: CuppingAdviceTemplate) {
    setForm({
      id: t.id,
      title: t.title,
      before_text: t.before_text ?? "",
      after_text: t.after_text ?? "",
      general_note: t.general_note ?? "",
      makeDefault: !!t.is_default,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.title.trim()) {
      showToast({ message: "Şablon adı gerekli.", type: "warning" });
      return;
    }
    setBusy(true);
    try {
      if (form.id) {
        await updateAdviceTemplate(form.id, {
          title: form.title.trim(),
          before_text: form.before_text,
          after_text: form.after_text,
          general_note: form.general_note.trim() ? form.general_note : null,
          ...(form.makeDefault ? { is_default: true } : {}),
        });
      } else {
        await createAdviceTemplate({
          title: form.title.trim(),
          before_text: form.before_text,
          after_text: form.after_text,
          general_note: form.general_note.trim() ? form.general_note : null,
          is_default: form.makeDefault,
        });
      }
      await onTemplatesChanged();
      setForm(null);
      showToast({ message: "Şablon kaydedildi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(t: CuppingAdviceTemplate) {
    try {
      await updateAdviceTemplate(t.id, { is_default: true });
      await onTemplatesChanged();
      showToast({ message: "Varsayılan bilgilendirme şablonu güncellendi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "İşlem başarısız.", type: "error" });
    }
  }

  async function remove(t: CuppingAdviceTemplate) {
    const ok = await confirm({
      title: "Şablonu Sil",
      message: `"${t.title}" bilgilendirme şablonunu silmek istiyor musunuz?\n\nBu şablona bağlı takvimler etkilenmez; yalnızca bağlantı kaldırılır.`,
      confirmText: "Şablonu Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteAdviceTemplate(t.id);
      await onTemplatesChanged();
      // Bağlı şablon silindiyse plan.advice_template_id sunucuda NULL olur → planı tazele.
      if (plan.advice_template_id === t.id) await onAttach(null).catch(() => {});
      showToast({ message: "Şablon silindi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Silinemedi.", type: "error" });
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-black text-slate-900">Çıktı Bilgilendirme Notları</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Danışanlarınıza verdiğiniz bilgilendirme metinlerini burada yönetin. Metni siz yazarsınız.
          </p>
        </div>
        <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={startNew}>
          + Yeni Şablon
        </button>
      </div>

      {/* Bu takvime bağlı şablon seçimi */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="advice-attach" className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Bu Takvimin Bilgilendirme Şablonu
        </label>
        <select
          id="advice-attach"
          className={kupaInput}
          value={plan.advice_template_id ?? ""}
          onChange={(e) => handleAttach(e.target.value)}
        >
          <option value="">— Şablon seçilmedi —</option>
          {activeTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.is_default ? " (varsayılan)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Bağlı şablon önizleme: Öncesi → Sonrası → Genel */}
      {attached ? (
        <article className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">{attached.title}</h3>
            <div className="flex gap-1.5">
              <button type="button" className={`${kupaBtnGhost} min-h-[34px] px-2.5 py-1 text-xs`} onClick={() => startEdit(attached)}>
                Düzenle
              </button>
              {!attached.is_default ? (
                <button type="button" className={`${kupaBtnGhost} min-h-[34px] px-2.5 py-1 text-xs`} onClick={() => setDefault(attached)}>
                  Varsayılan yap
                </button>
              ) : (
                <span className="inline-flex items-center rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Varsayılan</span>
              )}
            </div>
          </div>
          <AdvicePreview t={attached} />
        </article>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-sm text-slate-400">
          Bu takvime henüz bir bilgilendirme şablonu bağlanmadı.
        </p>
      )}

      {/* Diğer şablonlar (yönetim) */}
      {activeTemplates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tüm Şablonlar</p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {activeTemplates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-sm text-slate-700">
                  {t.title}
                  {t.is_default ? <span className="ml-1.5 text-xs text-amber-700">• varsayılan</span> : null}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" className={`${kupaBtnGhost} min-h-[32px] px-2 py-1 text-xs`} onClick={() => startEdit(t)}>
                    Düzenle
                  </button>
                  <button type="button" className="min-h-[32px] rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100" onClick={() => remove(t)}>
                    Sil
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Şablon oluştur/düzenle formu */}
      {form ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">{form.id ? "Şablonu Düzenle" : "Yeni Şablon"}</h3>
          <div className="flex flex-col gap-3">
            <Field label="Şablon adı">
              <input className={kupaInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ör. Standart Hacamat Bilgilendirmesi" />
            </Field>
            <Field label="Hacamat Öncesi Bilgilendirme">
              <textarea className={`${kupaInput} min-h-[80px]`} value={form.before_text} onChange={(e) => setForm({ ...form, before_text: e.target.value })} />
            </Field>
            <Field label="Hacamat Sonrası Bilgilendirme">
              <textarea className={`${kupaInput} min-h-[80px]`} value={form.after_text} onChange={(e) => setForm({ ...form, after_text: e.target.value })} />
            </Field>
            <Field label="Genel / Ek Not">
              <textarea className={`${kupaInput} min-h-[60px]`} value={form.general_note} onChange={(e) => setForm({ ...form, general_note: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.makeDefault} onChange={(e) => setForm({ ...form, makeDefault: e.target.checked })} />
              Varsayılan şablon yap
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={() => setForm(null)} disabled={busy}>
                Vazgeç
              </button>
              <button type="button" className={`${kupaBtnSuccess} min-h-[40px]`} onClick={save} disabled={busy}>
                {busy ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdvicePreview({ t }: { t: { before_text?: string | null; after_text?: string | null; general_note?: string | null } }) {
  const rows: { label: string; value: string }[] = [
    { label: "Hacamat Öncesi", value: (t.before_text ?? "").trim() },
    { label: "Hacamat Sonrası", value: (t.after_text ?? "").trim() },
    { label: "Genel / Ek Not", value: (t.general_note ?? "").trim() },
  ];
  return (
    <dl className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs font-bold uppercase tracking-wide text-amber-800">{r.label}</dt>
          <dd className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {r.value || <span className="text-slate-400">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
