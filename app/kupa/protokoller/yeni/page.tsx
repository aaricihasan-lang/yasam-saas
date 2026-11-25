"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useToast } from "@/components/ui/ToastProvider";
import { KupaShell, kupaEdgeCard, kupaBtnSuccess, kupaBtnGhost, kupaInput } from "@/app/kupa/components/KupaShell";
import { createProtocol } from "@/app/kupa/lib/api";
import { InlineLongText } from "../components/InlineLongText";
import { useUnsavedChangesGuard } from "@/app/kupa/lib/useUnsavedChangesGuard";
import { useConfirmLeave } from "../hooks/protocolDirty";
import { parseTagsInput } from "@/lib/cupping/protocolTags";

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
  const t = useTranslations("cupping.protocols");
  const tc = useTranslations("cupping.common");
  const errText = useKupaErrorText();
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
      showToast({ message: t("basic.titleRequired"), type: "warning" });
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
      showToast({ message: tc("saved"), type: "success" });
      router.replace(`/kupa/protokoller/${p.id}`);
    } catch (e) {
      // Başarısız kayıt kaydedilmiş gibi GÖSTERİLMEZ; form ve değerler korunur.
      showToast({ message: errText(e, tc("saveFailed")), type: "error" });
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <KupaShell
      title={t("new.title")}
      subtitle={t("new.subtitle")}
      breadcrumb={[{ label: t("list.crumb"), href: "/kupa/protokoller" }, { label: t("new.crumb") }]}
      fullBleedBelowLg
    >
      <div className={kupaEdgeCard}>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-title">{t("basic.titleLabel")}</label>
            <input
              id="np-title"
              autoFocus
              className={`${kupaInput} ${titleError ? "border-rose-300" : ""}`}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder={t("new.titlePlaceholder")}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-cat">{t("basic.categoryLabel")}</label>
            <input id="np-cat" className={kupaInput} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("basic.categoryPlaceholder")} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500">{t("basic.summaryLabel")}</label>
            <InlineLongText label={t("basic.summaryLabel")} value={summary} onChange={setSummary} rows={3} placeholder={t("new.summaryPlaceholder")} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-tags">{t("basic.tagsLabel")}</label>
            <p id="np-tags-help" className="mb-1 text-[11px] leading-snug text-slate-400">{t("basic.tagsHelp")}</p>
            <input id="np-tags" aria-describedby="np-tags-help" className={kupaInput} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("basic.tagsPlaceholder")} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={saving} className={kupaBtnSuccess} onClick={submit} data-testid="kupa-new-protocol-save">
              {saving ? tc("saving") : tc("save")}
            </button>
            <button type="button" className={kupaBtnGhost} onClick={() => void cancel()} disabled={saving}>
              {tc("cancel")}
            </button>
          </div>
        </div>
      </div>
    </KupaShell>
  );
}
