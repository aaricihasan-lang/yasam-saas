"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { KupaShell, kupaEdgeCard, kupaBtnSuccess, kupaBtnGhost, kupaInput } from "@/app/kupa/components/KupaShell";
import { createProtocol } from "@/app/kupa/lib/api";
import { InlineLongText } from "../components/InlineLongText";

/**
 * YENİ PROTOKOL — sade başlangıç (dev form YOK). Kaydettikten sonra protokol detay
 * dosyasına yönlendirir; asıl geliştirme orada (bölge/teknik/akış/bilgi/kaynak).
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

  async function submit() {
    if (saving) return; // double-submit guard
    if (!title.trim()) {
      setTitleError(true);
      showToast({ message: "Protokol başlığı gerekli.", type: "warning" });
      return;
    }
    setSaving(true);
    try {
      const p = await createProtocol({
        title: title.trim(),
        category: category.trim() || null,
        summary: summary.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push(`/kupa/protokoller/${p.id}`);
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Oluşturulamadı.", type: "error" });
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
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="np-tags">Etiketler (virgülle)</label>
            <input id="np-tags" className={kupaInput} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="etiket1, etiket2" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={saving} className={kupaBtnSuccess} onClick={submit}>
              {saving ? "Kaydediliyor…" : "Oluştur"}
            </button>
            <button type="button" className={kupaBtnGhost} onClick={() => router.push("/kupa/protokoller")}>
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    </KupaShell>
  );
}
