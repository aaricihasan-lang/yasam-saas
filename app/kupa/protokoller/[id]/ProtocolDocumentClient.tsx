"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { KupaShell, kupaBtnGhost, kupaBtnDanger, kupaBtnPrimary } from "@/app/kupa/components/KupaShell";
import { deleteProtocol, downloadProtocolWord } from "@/app/kupa/lib/api";
import { useProtocolDocument } from "../hooks/useProtocolDocument";
import { BasicInfoEditor } from "../components/BasicInfoEditor";
import { RelationSection } from "../components/RelationSection";
import { StepsSection } from "../components/StepsSection";
import { PrepSection } from "../components/PrepSection";
import { EntriesSection } from "../components/EntriesSection";
import { SourcesSection } from "../components/SourcesSection";
import { useUnsavedChangesGuard } from "@/app/kupa/lib/useUnsavedChangesGuard";
import { ProtocolDirtyProvider, useAnyProtocolDirty, useConfirmLeave } from "../hooks/protocolDirty";

/**
 * WT6 — Protokol belgesi: veri YALNIZ bölümlerdeki açık "Kaydet" ile yazılır. Herhangi bir bölümde
 * kaydedilmemiş değişiklik varken uygulama içi link, tarayıcı/Android geri ve yenileme açık onay ister
 * ("Kaydetmeden Çık" / "Vazgeç"). Bölümler kirli durumlarını ProtocolDirtyProvider'a bildirir.
 */
export function ProtocolDocumentClient({ id }: { id: string }) {
  return (
    <ProtocolDirtyProvider>
      <ProtocolDocumentInner id={id} />
    </ProtocolDirtyProvider>
  );
}

function PageLeaveGuard() {
  const anyDirty = useAnyProtocolDirty();
  const confirmLeave = useConfirmLeave();
  useUnsavedChangesGuard(anyDirty, confirmLeave);
  return null;
}

function ProtocolDocumentInner({ id }: { id: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const doc = useProtocolDocument(id);
  const t = useTranslations("cupping.protocols");
  const errText = useKupaErrorText();
  const [editingBasic, setEditingBasic] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);

  // K2 — protokolün Word (.docx) belgesini indir. Kaydedilmiş veriden; blob → geçici gizli bağlantı
  //   (calendarWord indirme deseniyle birebir). Kesin diske-yazma iddiası YOK.
  async function handleWordDownload() {
    const pr = doc.protocol;
    if (!pr || wordBusy) return;
    setWordBusy(true);
    try {
      const { blob, filename } = await downloadProtocolWord(pr.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      showToast({ message: t("doc.wordStarted"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, t("doc.wordFailed")), type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  async function handleDelete() {
    const p = doc.protocol;
    if (!p) return;
    const ok = await confirm({
      title: t("list.delete.title"),
      message: t("list.delete.message", { title: p.title }),
      confirmText: t("list.delete.confirm"),
      cancelText: t("list.delete.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteProtocol(p.id);
      showToast({ message: t("list.delete.done"), type: "success" });
      router.push("/kupa/protokoller");
    } catch (e) {
      showToast({ message: errText(e, t("list.delete.failed")), type: "error" });
    }
  }

  if (doc.loading) {
    return (
      <KupaShell title={t("doc.loading")} breadcrumb={[{ label: t("list.crumb"), href: "/kupa/protokoller" }]} fullBleedBelowLg>
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-2xl bg-white/70" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/60" />
        </div>
      </KupaShell>
    );
  }

  if (doc.notFound) {
    return (
      <KupaShell title={t("doc.notFoundTitle")} breadcrumb={[{ label: t("list.crumb"), href: "/kupa/protokoller" }]} fullBleedBelowLg>
        <p className="text-sm text-slate-600">{t("doc.notFoundBody")}</p>
      </KupaShell>
    );
  }

  const p = doc.protocol;
  if (!p) {
    return (
      <KupaShell title={t("doc.errorTitle")} breadcrumb={[{ label: t("list.crumb"), href: "/kupa/protokoller" }]} fullBleedBelowLg>
        <p className="text-sm text-rose-600">{doc.error ? errText(doc.error, t("doc.loadError")) : t("doc.loadError")}</p>
        <button type="button" className={`mt-3 ${kupaBtnGhost}`} onClick={() => void doc.reload.all()}>{t("list.retry")}</button>
      </KupaShell>
    );
  }

  return (
    <KupaShell
      title={p.title}
      badge={p.category ?? undefined}
      subtitle={p.summary ?? undefined}
      breadcrumb={[{ label: t("list.crumb"), href: "/kupa/protokoller" }, { label: p.title }]}
      fullBleedBelowLg
      actions={
        <>
          <button type="button" className={kupaBtnPrimary} onClick={handleWordDownload} disabled={wordBusy}>
            {wordBusy ? t("doc.wordPreparing") : t("doc.wordDownload")}
          </button>
          <button type="button" className={kupaBtnGhost} onClick={() => setEditingBasic(true)}>
            {t("doc.editBasic")}
          </button>
          <button type="button" className={kupaBtnDanger} onClick={handleDelete}>
            {t("list.delete.title")}
          </button>
        </>
      }
    >
      {!p.is_active ? (
        <p className="mb-2 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{t("list.statusPassive")}</p>
      ) : null}

      {doc.error ? (
        // Bölümlerden biri yüklenemedi: bölümleri BOŞ gibi gösterme (uzman verisi silindi sanıp
        //   yeniden ekleyerek mükerrer kayıt üretmesin). Açık uyarı + tekrar dene.
        <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">{t("doc.partialTitle")}</p>
          <p className="mt-1 text-rose-700">
            {t("doc.partialBody")} ({errText(doc.error, t("doc.loadError"))})
          </p>
          <button type="button" className={`mt-3 ${kupaBtnGhost} min-h-[44px]`} onClick={() => void doc.reload.all()}>
            {t("list.retry")}
          </button>
        </div>
      ) : null}

      {doc.error ? null : (
      <>
      <RelationSection kind="point" protocolId={id} doc={doc} />
      <RelationSection kind="technique" protocolId={id} doc={doc} />
      <StepsSection protocolId={id} doc={doc} />
      <RelationSection kind="safety" protocolId={id} doc={doc} />
      <PrepSection doc={doc} />
      <EntriesSection protocolId={id} doc={doc} />
      <SourcesSection protocolId={id} doc={doc} />
      </>
      )}

      {editingBasic ? <BasicInfoEditor doc={doc} onClose={() => setEditingBasic(false)} /> : null}
      <PageLeaveGuard />
    </KupaShell>
  );
}
