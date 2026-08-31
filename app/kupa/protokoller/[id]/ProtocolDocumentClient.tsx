"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { KupaShell, kupaBtnGhost, kupaBtnDanger } from "@/app/kupa/components/KupaShell";
import { deleteProtocol } from "@/app/kupa/lib/api";
import { useProtocolDocument } from "../hooks/useProtocolDocument";
import { BasicInfoEditor } from "../components/BasicInfoEditor";
import { RelationSection } from "../components/RelationSection";
import { StepsSection } from "../components/StepsSection";
import { PrepSection } from "../components/PrepSection";
import { EntriesSection } from "../components/EntriesSection";
import { SourcesSection } from "../components/SourcesSection";

export function ProtocolDocumentClient({ id }: { id: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const doc = useProtocolDocument(id);
  const [editingBasic, setEditingBasic] = useState(false);

  async function handleDelete() {
    const p = doc.protocol;
    if (!p) return;
    const ok = await confirm({
      title: "Protokolü Sil",
      message: `"${p.title}" protokolünü silmek istediğinizden emin misiniz?\n\nBu protokole ait bölgeler, uygulama adımları, bilgiler ve kaynak bağlantıları silinir. Ana kütüphane kayıtları silinmez.`,
      confirmText: "Protokolü Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteProtocol(p.id);
      showToast({ message: "Protokol silindi.", type: "success" });
      router.push("/kupa/protokoller");
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Silinemedi.", type: "error" });
    }
  }

  if (doc.loading) {
    return (
      <KupaShell title="Yükleniyor…" breadcrumb={[{ label: "Protokoller", href: "/kupa/protokoller" }]} fullBleedBelowLg>
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-2xl bg-white/70" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/60" />
        </div>
      </KupaShell>
    );
  }

  if (doc.notFound) {
    return (
      <KupaShell title="Protokol bulunamadı" breadcrumb={[{ label: "Protokoller", href: "/kupa/protokoller" }]} fullBleedBelowLg>
        <p className="text-sm text-slate-600">Bu protokol kaydı bulunamadı veya bu hesaba ait değil.</p>
      </KupaShell>
    );
  }

  const p = doc.protocol;
  if (!p) {
    return (
      <KupaShell title="Bir sorun oluştu" breadcrumb={[{ label: "Protokoller", href: "/kupa/protokoller" }]} fullBleedBelowLg>
        <p className="text-sm text-rose-600">{doc.error ?? "Protokol yüklenemedi."}</p>
        <button type="button" className={`mt-3 ${kupaBtnGhost}`} onClick={() => void doc.reload.all()}>Tekrar dene</button>
      </KupaShell>
    );
  }

  return (
    <KupaShell
      title={p.title}
      badge={p.category ?? undefined}
      subtitle={p.summary ?? undefined}
      breadcrumb={[{ label: "Protokoller", href: "/kupa/protokoller" }, { label: p.title }]}
      fullBleedBelowLg
      actions={
        <>
          <button type="button" className={kupaBtnGhost} onClick={() => setEditingBasic(true)}>
            Temel Bilgiyi Düzenle
          </button>
          <button type="button" className={kupaBtnDanger} onClick={handleDelete}>
            Protokolü Sil
          </button>
        </>
      }
    >
      {!p.is_active ? (
        <p className="mb-2 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Pasif</p>
      ) : null}

      {doc.error ? <p className="mb-2 text-xs text-rose-600">{doc.error}</p> : null}

      <RelationSection kind="point" protocolId={id} doc={doc} />
      <RelationSection kind="technique" protocolId={id} doc={doc} />
      <StepsSection protocolId={id} doc={doc} />
      <RelationSection kind="safety" protocolId={id} doc={doc} />
      <PrepSection doc={doc} />
      <EntriesSection protocolId={id} doc={doc} />
      <SourcesSection protocolId={id} doc={doc} />

      {editingBasic ? <BasicInfoEditor doc={doc} onClose={() => setEditingBasic(false)} /> : null}
    </KupaShell>
  );
}
