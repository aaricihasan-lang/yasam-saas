"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import ClientPicker, { type PickerClient } from "@/components/danisan/ClientPicker";
import {
  kupaBtnGhost,
  kupaBtnPrimary,
  kupaBtnSuccess,
  kupaInput,
} from "@/app/kupa/components/KupaShell";
import {
  listClientAdvice,
  createClientAdvice,
  updateClientAdvice,
  deleteClientAdvice,
  type CuppingAdviceTemplate,
  type CuppingClientAdvice,
} from "@/app/kupa/lib/api";

/**
 * FAZ 5 / AŞAMA 3 — "Danışana Özel Hazırla" (ENTEGRE, katlanır alt bölüm; ana modül DEĞİL).
 *
 * P0 GİZLİLİK: Danışan verisi YALNIZCA kullanıcı bu bölümü açıp bir danışan seçince yüklenir
 *   (takvim açılışında PII yüklenmez). Yalnız mevcut tenant-güvenli ClientPicker (/api/clients)
 *   kullanılır; admin bypass / cross-tenant / geniş "tüm danışanlar" API'si YOK.
 *
 * SNAPSHOT BAĞIMSIZLIĞI (KRİTİK): Danışan kopyası ana şablondan BAĞIMSIZDIR. source_template_id
 *   yalnız provenance'tır; canlı miras/senkron YOK. client_id / source_template_id düzenlenebilir
 *   alan DEĞİLDİR (yalnızca metin düzenlenir).
 */
type EditState = { id: string; title: string; before_text: string; after_text: string; general_note: string };

export function ClientAdviceSection({ templates }: { templates: CuppingAdviceTemplate[] }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<PickerClient | null>(null);
  const [advice, setAdvice] = useState<CuppingClientAdvice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceTemplateId, setSourceTemplateId] = useState("");
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  const activeTemplates = templates.filter((t) => t.is_active !== false);

  async function selectClient(c: PickerClient) {
    setClient(c);
    setEdit(null);
    setLoading(true);
    setError(null);
    try {
      const rows = await listClientAdvice(c.id);
      setAdvice(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Danışan bilgileri alınamadı.");
      setAdvice([]);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!client) return;
    try {
      setAdvice(await listClientAdvice(client.id));
    } catch {
      /* sessiz; kullanıcı tekrar seçebilir */
    }
  }

  async function createFromTemplate() {
    if (!client) return;
    setCreating(true);
    try {
      await createClientAdvice({
        client_id: client.id,
        source_template_id: sourceTemplateId || null, // boşsa: boş bilgilendirme
        ...(sourceTemplateId ? {} : { title: "Danışan Bilgilendirmesi" }),
      });
      await refresh();
      setSourceTemplateId("");
      showToast({ message: "Danışana özel bilgilendirme oluşturuldu.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Oluşturulamadı.", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    if (!edit.title.trim()) {
      showToast({ message: "Başlık gerekli.", type: "warning" });
      return;
    }
    try {
      // YALNIZ snapshot metni; client_id/source_template_id GÖNDERİLMEZ (immutable).
      await updateClientAdvice(edit.id, {
        title: edit.title.trim(),
        before_text: edit.before_text,
        after_text: edit.after_text,
        general_note: edit.general_note.trim() ? edit.general_note : null,
      });
      await refresh();
      setEdit(null);
      showToast({ message: "Bilgilendirme güncellendi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    }
  }

  async function remove(a: CuppingClientAdvice) {
    const ok = await confirm({
      title: "Bilgilendirmeyi Sil",
      message: "Bu danışana özel bilgilendirmeyi silmek istiyor musunuz?",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteClientAdvice(a.id);
      await refresh();
      showToast({ message: "Bilgilendirme silindi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Silinemedi.", type: "error" });
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>👤</span>
          <span className="text-sm font-bold text-slate-800">Danışana Özel Hazırla</span>
          <span className="text-xs text-slate-400">(opsiyonel)</span>
        </span>
        <span aria-hidden className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-slate-100 px-4 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Bir danışan seçin; ona özel, ana şablondan <strong>bağımsız</strong> bir bilgilendirme kopyası hazırlayın.
          </p>

          <ClientPicker onSelect={selectClient} selectedId={client?.id ?? null} />

          {client ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
              {/* Oluşturma */}
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Genel Şablondan</span>
                  <select className={kupaInput} value={sourceTemplateId} onChange={(e) => setSourceTemplateId(e.target.value)}>
                    <option value="">— Boş bilgilendirme —</option>
                    {activeTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className={`${kupaBtnPrimary} min-h-[40px]`} onClick={createFromTemplate} disabled={creating}>
                  {sourceTemplateId ? "Şablondan Oluştur" : "Boş Oluştur"}
                </button>
              </div>

              {/* Liste */}
              {loading ? (
                <p className="text-sm text-slate-400">Yükleniyor…</p>
              ) : error ? (
                <p className="text-sm text-rose-600">{error}</p>
              ) : advice.length === 0 ? (
                <p className="text-sm text-slate-400">Bu danışan için henüz bilgilendirme yok.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {advice.map((a) => (
                    <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      {edit?.id === a.id ? (
                        <div className="flex flex-col gap-2">
                          <input className={kupaInput} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Başlık" />
                          <textarea className={`${kupaInput} min-h-[60px]`} value={edit.before_text} onChange={(e) => setEdit({ ...edit, before_text: e.target.value })} placeholder="Hacamat Öncesi" />
                          <textarea className={`${kupaInput} min-h-[60px]`} value={edit.after_text} onChange={(e) => setEdit({ ...edit, after_text: e.target.value })} placeholder="Hacamat Sonrası" />
                          <textarea className={`${kupaInput} min-h-[48px]`} value={edit.general_note} onChange={(e) => setEdit({ ...edit, general_note: e.target.value })} placeholder="Genel / Ek Not" />
                          <div className="flex justify-end gap-2">
                            <button type="button" className={`${kupaBtnGhost} min-h-[36px]`} onClick={() => setEdit(null)}>Vazgeç</button>
                            <button type="button" className={`${kupaBtnSuccess} min-h-[36px]`} onClick={saveEdit}>Kaydet</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">{a.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.before_text || a.after_text || a.general_note || "—"}</p>
                            {a.source_template_id ? (
                              <p className="mt-1 text-[11px] text-slate-400">Ana şablondan bağımsız kopya</p>
                            ) : null}
                          </div>
                          <span className="flex shrink-0 gap-1.5">
                            <button type="button" className={`${kupaBtnGhost} min-h-[32px] px-2 py-1 text-xs`} onClick={() => setEdit({ id: a.id, title: a.title, before_text: a.before_text ?? "", after_text: a.after_text ?? "", general_note: a.general_note ?? "" })}>Düzenle</button>
                            <button type="button" className="min-h-[32px] rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100" onClick={() => remove(a)}>Sil</button>
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                Bu danışana özel kopya, ana şablondan bağımsızdır; ana şablonu sonradan değiştirmeniz bu kopyayı etkilemez.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
