"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import ClientPicker, { type PickerClient } from "@/components/danisan/ClientPicker";
import { kupaBtnGhost, kupaBtnPrimary, kupaBtnSuccess, kupaInput, kupaRowActionDanger, kupaRowActions } from "@/app/kupa/components/KupaShell";
import {
  listClientAdvice,
  createClientAdvice,
  updateClientAdvice,
  deleteClientAdvice,
  type CuppingAdviceTemplate,
  type CuppingClientAdvice,
} from "@/app/kupa/lib/api";
import { openFormDirty } from "@/app/kupa/lib/formDirty";
import { useSystemNames } from "../lib/useSystemNames";
import { CLIENT_ADVICE_DEFAULT_TITLE_TR } from "../lib/systemNames";

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
 *
 * FINAL-A1 — açık düzenleme formunda GERÇEK değişiklik varsa: üst bileşene bildirilir (sayfa geneli
 *   çıkış koruması) ve Vazgeç / başka kayıt / başka danışan seçimi önce onay ister. Değişiklik yoksa sorulmaz.
 */
type EditState = { id: string; title: string; before_text: string; after_text: string; general_note: string };

function editFromAdvice(a: CuppingClientAdvice): EditState {
  return { id: a.id, title: a.title, before_text: a.before_text ?? "", after_text: a.after_text ?? "", general_note: a.general_note ?? "" };
}

export function ClientAdviceSection({
  templates,
  onFormDirtyChange,
}: {
  templates: CuppingAdviceTemplate[];
  onFormDirtyChange?: (dirty: boolean) => void;
}) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const tca = useTranslations("cupping.calendar");
  const tc = useTranslations("cupping.common");
  const sysNames = useSystemNames();
  const errText = useKupaErrorText();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<PickerClient | null>(null);
  const [advice, setAdvice] = useState<CuppingClientAdvice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceTemplateId, setSourceTemplateId] = useState("");
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  // Düzenleme formunun açıldığı andaki değerler (kirli karşılaştırma tabanı).
  const [editBase, setEditBase] = useState<EditState | null>(null);
  const editDirty = openFormDirty(edit, editBase);

  useEffect(() => {
    onFormDirtyChange?.(editDirty);
  }, [editDirty, onFormDirtyChange]);
  useEffect(() => () => onFormDirtyChange?.(false), [onFormDirtyChange]);

  /** Açık formda gerçek değişiklik varsa atmadan önce sor (yoksa doğrudan true). */
  async function confirmDropEdit(): Promise<boolean> {
    if (!editDirty) return true;
    return confirm({
      title: tca("advice.discardTitle"),
      message: tca("clientAdvice.discardMessage"),
      confirmText: tca("advice.discardConfirm"),
      cancelText: tc("cancel"),
      tone: "danger",
    });
  }

  async function openEdit(next: EditState | null) {
    if (!(await confirmDropEdit())) return;
    setEdit(next);
    setEditBase(next);
  }

  const activeTemplates = templates.filter((t) => t.is_active !== false);
  // Yarış koruması: hızlı danışan değiştirmede ESKİ danışanın yanıtı yenisinin başlığı altında
  //   gösterilmez (yanlış kişinin kaydını düzenleme/silme riski yok). En son istek kazanır.
  const reqSeqRef = useRef(0);
  const clientIdRef = useRef<string | null>(null);

  async function selectClient(c: PickerClient) {
    if (c.id !== clientIdRef.current && !(await confirmDropEdit())) return;
    const seq = ++reqSeqRef.current;
    clientIdRef.current = c.id;
    setClient(c);
    setEdit(null);
    setEditBase(null);
    setAdvice([]);
    setLoading(true);
    setError(null);
    try {
      const rows = await listClientAdvice(c.id);
      if (seq !== reqSeqRef.current) return;
      setAdvice(rows);
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      setError(errText(e, tca("clientAdvice.loadError")));
      setAdvice([]);
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }

  async function refresh() {
    const id = clientIdRef.current;
    if (!id) return;
    const seq = ++reqSeqRef.current;
    try {
      const rows = await listClientAdvice(id);
      if (seq !== reqSeqRef.current || clientIdRef.current !== id) return;
      setAdvice(rows);
      setError(null);
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      // Liste tazelenemedi: eski liste gösterilmeye devam eder ama kullanıcı UYARILIR (tekrar
      //   oluşturup mükerrer kayıt üretmesin).
      setError(e instanceof Error ? tca("clientAdvice.refreshStale", { detail: errText(e, tca("clientAdvice.refreshFailed")) }) : tca("clientAdvice.refreshFailed"));
    }
  }

  async function createFromTemplate() {
    if (!client) return;
    setCreating(true);
    try {
      await createClientAdvice({
        client_id: client.id,
        source_template_id: sourceTemplateId || null, // boşsa: boş bilgilendirme
        // I18N-F1-R3: boş kaydın varsayılan BAŞLIĞI DB'ye HER ZAMAN Türkçe sabit yazılır (i18n öncesiyle birebir);
        // gösterimde sistem başlığı ekran dilinde üretilir (useSystemNames) — kullanıcının yazdığı başlık aynen kalır.
        ...(sourceTemplateId ? {} : { title: CLIENT_ADVICE_DEFAULT_TITLE_TR }),
      });
      await refresh();
      setSourceTemplateId("");
      showToast({ message: tca("clientAdvice.created"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, tca("clientAdvice.createFailed")), type: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    if (!edit.title.trim()) {
      showToast({ message: tca("clientAdvice.titleRequired"), type: "warning" });
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
      setEditBase(null);
      showToast({ message: tca("clientAdvice.updated"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, tc("saveFailed")), type: "error" });
    }
  }

  async function remove(a: CuppingClientAdvice) {
    const ok = await confirm({
      title: tca("clientAdvice.deleteTitle"),
      message: tca("clientAdvice.deleteMessage"),
      confirmText: tc("delete"),
      cancelText: tc("cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteClientAdvice(a.id);
      await refresh();
      // Silinen kayıt düzenleniyorsa form kapanır (olmayan kayda kaydetme denemesi yok).
      if (edit?.id === a.id) {
        setEdit(null);
        setEditBase(null);
      }
      showToast({ message: tca("clientAdvice.deleted"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, tca("advice.deleteFailed")), type: "error" });
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
          <span className="text-sm font-bold text-slate-800">{tca("clientAdvice.title")}</span>
          <span className="text-xs text-slate-400">{tca("clientAdvice.optional")}</span>
        </span>
        <span aria-hidden className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-slate-100 px-4 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            {tca.rich("clientAdvice.intro", { strong: (c) => <strong>{c}</strong> })}
          </p>

          <ClientPicker onSelect={selectClient} selectedId={client?.id ?? null} />

          {client ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
              {/* Oluşturma */}
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{tca("clientAdvice.fromTemplate")}</span>
                  <select className={kupaInput} value={sourceTemplateId} onChange={(e) => setSourceTemplateId(e.target.value)}>
                    <option value="">{tca("clientAdvice.blankOption")}</option>
                    {activeTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className={`${kupaBtnPrimary} min-h-[40px]`} onClick={createFromTemplate} disabled={creating}>
                  {sourceTemplateId ? tca("clientAdvice.createFromTemplate") : tca("clientAdvice.createBlank")}
                </button>
              </div>

              {/* Liste */}
              {loading ? (
                <p className="text-sm text-slate-400">{tc("loading")}</p>
              ) : error ? (
                <p className="text-sm text-rose-600">{error}</p>
              ) : advice.length === 0 ? (
                <p className="text-sm text-slate-400">{tca("clientAdvice.empty")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {advice.map((a) => (
                    <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      {edit?.id === a.id ? (
                        <div className="flex flex-col gap-2">
                          <input className={kupaInput} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder={tca("clientAdvice.titlePlaceholder")} />
                          <textarea className={`${kupaInput} min-h-[60px]`} value={edit.before_text} onChange={(e) => setEdit({ ...edit, before_text: e.target.value })} placeholder={tca("advice.before")} />
                          <textarea className={`${kupaInput} min-h-[60px]`} value={edit.after_text} onChange={(e) => setEdit({ ...edit, after_text: e.target.value })} placeholder={tca("advice.after")} />
                          <textarea className={`${kupaInput} min-h-[48px]`} value={edit.general_note} onChange={(e) => setEdit({ ...edit, general_note: e.target.value })} placeholder={tca("advice.general")} />
                          <div className="flex justify-end gap-2">
                            <button type="button" className={`${kupaBtnGhost} min-h-[36px]`} onClick={() => void openEdit(null)}>{tc("cancel")}</button>
                            <button type="button" className={`${kupaBtnSuccess} min-h-[36px]`} onClick={saveEdit}>{tc("save")}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">{sysNames.adviceTitle(a.title)}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.before_text || a.after_text || a.general_note || "—"}</p>
                            {a.source_template_id ? (
                              <p className="mt-1 text-[11px] text-slate-400">{tca("clientAdvice.independent")}</p>
                            ) : null}
                          </div>
                          <span className={kupaRowActions}>
                            <button type="button" className={`${kupaBtnGhost} min-h-[40px] px-3 py-1 text-xs lg:min-h-[32px]`} onClick={() => void openEdit(editFromAdvice(a))}>{tc("edit")}</button>
                            <button type="button" className={kupaRowActionDanger} onClick={() => remove(a)}>{tc("delete")}</button>
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                {tca("clientAdvice.footer")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
