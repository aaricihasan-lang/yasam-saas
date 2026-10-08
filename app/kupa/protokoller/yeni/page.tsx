"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { KupaShell, kupaEdgeCard, kupaBtnSuccess, kupaBtnGhost, kupaInput } from "@/app/kupa/components/KupaShell";
import { createProtocol } from "@/app/kupa/lib/api";
import { InlineLongText } from "../components/InlineLongText";
import { useUnsavedChangesGuard } from "@/app/kupa/lib/useUnsavedChangesGuard";
import { useConfirmLeave } from "../hooks/protocolDirty";
import { TAGS_LABEL, TAGS_HELP, TAGS_PLACEHOLDER, parseTagsInput } from "@/lib/cupping/protocolTags";

/**
 * YENİ PROTOKOL — sade başlangıç (dev form YOK). Kaydettikten sonra protokol detay
 * dosyasına yönlendirir; asıl geliştirme orada (bölge/teknik/akış/bilgi/kaynak).
 *
 * WT6: kayıt YALNIZ "Kaydet" ile (otomatik kayıt YOK). Alan doluyken geri/link/yenileme/Vazgeç →
 *   "Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkmak istiyor musunuz?" (Vazgeç / Kaydetmeden Çık).
 *   Çift tık → tek kayıt (senkron ref kilidi). Başarıda "Kaydedildi." bildirimi.
 */
export default function YeniProtokolPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const confirmLeave = useConfirmLeave();
  const dirty = !saved && (title.trim() !== "" || category.trim() !== "" || summary.trim() !== "" || tags.trim() !== "");
  useUnsavedChangesGuard(dirty, confirmLeave);

  async function cancel() {
    if (dirty && !(await confirmLeave())) return;
    router.push("/kupa/protokoller");
  }

  async function submit() {
    if (savingRef.current) return; // double-submit guard (senkron; state güncellenmeden gelen 2. tık)
    if (!title.trim()) {
      setTitleError(true);
      showToast({ message: "Protokol başlığı gerekli.", type: "warning" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const p = await createProtocol({
        title: title.trim(),
        category: category.trim() || null,
        summary: summary.trim() || null,
        tags: parseTagsInput(tags),
      });
      setSaved(true);
      showToast({ message: "Kaydedildi.", type: "success" });
      router.replace(`/kupa/protokoller/${p.id}`);
    } catch (e) {
      // Başarısız kayıt kaydedilmiş gibi GÖSTERİLMEZ; form ve değerler korunur.
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <KupaShell
      title="Yeni Protokol"
      subtitle="Kısa bir başlangıç yapın; bölgeleri, akışı ve bilgileri protokol dosyasında geliştireceksiniz."
      breadcrumb={[{ label: "Protokoller", href: "/kupa/protokoller" }, { label: "Yeni" }]}
      fullBleedBelowLg
    >
      <div className={kupaEdgeCard}>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-title">Protokol Adı *</label>
            <input
              id="np-title"
              autoFocus
              className={`${kupaInput} ${titleError ? "border-rose-300" : ""}`}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder="Örn. Migren"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-cat">Kategori</label>
            <input id="np-cat" className={kupaInput} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Örn. Baş & Boyun" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500">Kısa Açıklama</label>
            <InlineLongText label="Kısa Açıklama" value={summary} onChange={setSummary} rows={3} placeholder="Bu protokol hakkında kısa bir açıklama…" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-tags">{TAGS_LABEL}</label>
            <p id="np-tags-help" className="mb-1 text-[11px] leading-snug text-slate-400">{TAGS_HELP}</p>
            <input id="np-tags" aria-describedby="np-tags-help" className={kupaInput} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={TAGS_PLACEHOLDER} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={saving} className={kupaBtnSuccess} onClick={submit} data-testid="kupa-new-protocol-save">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button type="button" className={kupaBtnGhost} onClick={() => void cancel()} disabled={saving}>
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    </KupaShell>
  );
}
