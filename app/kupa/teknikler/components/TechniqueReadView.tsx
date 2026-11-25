"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useCuppingVocab } from "@/app/kupa/lib/useCuppingVocab";
import { kupaBtnDanger, kupaBtnGhost } from "../../components/KupaShell";
import { KupaConfirmDialog } from "../../components/ConfirmDialog";
import {
  deleteTechnique,
  getTechnique,
  isKupaNotFound,
  listTechniqueProtocols,
  type CuppingTechnique,
  type CuppingTechniqueProtocolRef,
} from "../../lib/api";
import { hasMovement } from "../lib/labels";
import { useTechniqueListRefresh } from "../lib/listRefresh";
import { TechniqueEditor } from "./TechniqueEditor";
import { TechniqueSourcesSection } from "./TechniqueSourcesSection";
import { TechniqueProtocolsSection } from "./TechniqueProtocolsSection";

/**
 * Reader-first teknik detayı (FAZ 4 / 2B). Varsayılan: OKUMA. "Düzenle" → in-place
 * editor (aynı record). Sil onay ister; protokolde kullanılıyorsa dostça engellenir.
 * Bölümler: Teknik Özeti / Genel Uygulama Yaklaşımı / Güvenlik / Kaynaklar / Uzman Notum /
 * Kullanıldığı Protokoller. kind / source_note / DB kodları GÖSTERİLMEZ.
 */

function ReadBlock({ title, text, empty }: { title: string; text?: string | null; empty: string }) {
  return (
    <section>
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h3>
      {text && text.trim() ? (
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{text}</p>
      ) : (
        <p className="mt-1 text-[13px] text-slate-400">{empty}</p>
      )}
    </section>
  );
}

export function TechniqueReadView({ id }: { id: string }) {
  const router = useRouter();
  const tr = useTranslations("cupping.techniques");
  const tc = useTranslations("cupping.common");
  const errText = useKupaErrorText();
  const vocab = useCuppingVocab();
  const refreshList = useTechniqueListRefresh();
  const [technique, setTechnique] = useState<CuppingTechnique | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Silme UX: native window.confirm YERİNE app-standart modal. İki durum:
  //   - "blocked": teknik protokolde kullanılıyor → uyarı modalı (yıkıcı aksiyon YOK)
  //   - "confirm": referans yok → yıkıcı onay modalı
  const [deleteDialog, setDeleteDialog] = useState<
    null | { variant: "confirm" } | { variant: "blocked"; protocols: CuppingTechniqueProtocolRef[] }
  >(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  // Yükleme inline async IIFE içinde (effect gövdesinde senkron setState YOK).
  // Reader [id] ile key'lenir; "Tekrar dene" nonce'u artırır → effect yeniden koşar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getTechnique(id);
        if (cancelled) return;
        setTechnique(t);
        setLoadError(null);
        setNotFound(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : tr("read.loadError");
        // I18N-F1-R3: 404 tespiti metne değil dil-bağımsız koda bağlı. GET /api/kupa/techniques/[id]'de
        // eski /bulunamadı|ait değil/ deseniyle eşleşen TEK yanıt getEntity NOT_FOUND'dur (= CUP_NOT_FOUND).
        if (isKupaNotFound(e)) setNotFound(true);
        else setLoadError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız kayıt/yeniden-dene değişiminde yükle (dil değişimi tetiklemez)
  }, [id, nonce]);

  // "Sil" → önce protokol-kullanım prechecki; sonucuna göre uyarı VEYA onay modalı açılır.
  // Native window.confirm KULLANILMAZ. FK RESTRICT sunucu tarafında yetkili korumadır.
  const onDeleteClick = async () => {
    if (!technique) return;
    setActionError(null);
    setChecking(true);
    try {
      const protos = await listTechniqueProtocols(id);
      if (protos.length > 0) setDeleteDialog({ variant: "blocked", protocols: protos });
      else setDeleteDialog({ variant: "confirm" });
    } catch (e) {
      setActionError(errText(e, tr("read.usageCheckFailed")));
    } finally {
      setChecking(false);
    }
  };

  // Yalnız referans YOKKEN (confirm modu) çağrılır; kullanıcı modalda açıkça onayladıktan sonra.
  const confirmDelete = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await deleteTechnique(id);
      router.push("/kupa/teknikler");
    } catch (e) {
      setActionError(errText(e, tr("read.deleteFailed")));
      setDeleteDialog(null);
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-[15px] font-semibold text-slate-700">{tr("read.notFound")}</p>
        <Link href="/kupa/teknikler" className="mt-2 inline-block text-sm font-semibold text-amber-700">
          {tr("read.back")}
        </Link>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-[14px] text-rose-700">{errText(loadError, tr("read.loadError"))}</p>
        <button type="button" className={`mt-2 ${kupaBtnGhost}`} onClick={reload}>{tc("retry")}</button>
      </div>
    );
  }
  if (!technique) {
    return <p className="p-4 text-[14px] text-slate-400">{tc("loading")}</p>;
  }

  if (mode === "edit") {
    return (
      <div className="rounded-2xl border border-amber-100/90 bg-white/95 p-4 shadow-sm sm:p-5 lg:p-6">
        <TechniqueEditor
          initial={technique}
          onSaved={(t) => {
            setTechnique(t);
            setMode("read");
            // Sol liste ad/tür/aktiflik güncel görünsün (stale kalmasın; hard reload YOK).
            refreshList();
          }}
          onCancel={() => setMode("read")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/kupa/teknikler" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 lg:hidden">
        {tr("read.back")}
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{technique.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-amber-100/70 px-2 py-0.5 text-[12px] font-semibold text-amber-800">
              {vocab.techniqueType(technique.technique_type)}
            </span>
            {hasMovement(technique.movement_style) ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-600">
                {vocab.movementStyle(technique.movement_style)}
              </span>
            ) : null}
            {technique.is_active === false ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">{tc("passive")}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={kupaBtnGhost} onClick={() => setMode("edit")} disabled={busy || checking}>
            {tc("edit")}
          </button>
          <button type="button" className={kupaBtnDanger} onClick={onDeleteClick} disabled={busy || checking}>
            {checking ? tr("read.checking") : tc("delete")}
          </button>
        </div>
      </header>

      {actionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{actionError}</p>
      ) : null}

      <ReadBlock title={tr("fields.summary")} text={technique.description} empty={tr("read.emptySummary")} />
      <ReadBlock title={tr("fields.approach")} text={technique.application_info} empty={tr("read.emptyApproach")} />

      <ReadBlock title={tr("read.safetyTitle")} text={technique.safety_note} empty={tr("read.emptySafety")} />
      <TechniqueSourcesSection techniqueId={technique.id} />

      <ReadBlock title={tr("fields.practitionerNote")} text={technique.practitioner_note} empty={tr("read.emptyNote")} />

      <TechniqueProtocolsSection techniqueId={technique.id} />

      {/* Silme UX — app-standart modal (native window.confirm YOK). */}
      {deleteDialog?.variant === "blocked" ? (
        <KupaConfirmDialog
          open
          title={tr("read.blockedTitle")}
          description={tr("read.blockedBody")}
          closeLabel={tc("close")}
          onClose={() => setDeleteDialog(null)}
        >
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              {tr("read.usedInProtocols")}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {deleteDialog.protocols.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px] font-semibold text-slate-800">{p.title}</span>
                  <Link
                    href={`/kupa/protokoller/${p.id}`}
                    className="shrink-0 text-[12px] font-semibold text-amber-700 hover:text-amber-800"
                  >
                    {tr("read.openProtocol")}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </KupaConfirmDialog>
      ) : null}

      {deleteDialog?.variant === "confirm" ? (
        <KupaConfirmDialog
          open
          title={tr("read.deleteTitle")}
          description={tr("read.deleteBody")}
          confirmLabel={tr("read.deleteConfirm")}
          cancelLabel={tc("cancel")}
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => { if (!busy) setDeleteDialog(null); }}
        />
      ) : null}
    </div>
  );
}
