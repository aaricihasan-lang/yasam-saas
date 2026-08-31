"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kupaBtnDanger, kupaBtnGhost } from "../../components/KupaShell";
import { KupaConfirmDialog } from "../../components/ConfirmDialog";
import {
  deleteTechnique,
  getTechnique,
  listTechniqueProtocols,
  type CuppingTechnique,
  type CuppingTechniqueProtocolRef,
} from "../../lib/api";
import { hasMovement, movementStyleLabel, techniqueTypeLabel } from "../lib/labels";
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
        const msg = e instanceof Error ? e.message : "Yüklenemedi.";
        if (/bulunamadı|ait değil/i.test(msg)) setNotFound(true);
        else setLoadError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      setActionError(e instanceof Error ? e.message : "Kullanım kontrolü yapılamadı.");
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
      setActionError(e instanceof Error ? e.message : "Silinemedi.");
      setDeleteDialog(null);
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-[15px] font-semibold text-slate-700">Teknik bulunamadı.</p>
        <Link href="/kupa/teknikler" className="mt-2 inline-block text-sm font-semibold text-amber-700">
          ← Kupa Teknikleri
        </Link>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-[14px] text-rose-700">{loadError}</p>
        <button type="button" className={`mt-2 ${kupaBtnGhost}`} onClick={reload}>Tekrar dene</button>
      </div>
    );
  }
  if (!technique) {
    return <p className="p-4 text-[14px] text-slate-400">Yükleniyor…</p>;
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
        ← Kupa Teknikleri
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{technique.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-amber-100/70 px-2 py-0.5 text-[12px] font-semibold text-amber-800">
              {techniqueTypeLabel(technique.technique_type)}
            </span>
            {hasMovement(technique.movement_style) ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-600">
                {movementStyleLabel(technique.movement_style)}
              </span>
            ) : null}
            {technique.is_active === false ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">Pasif</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={kupaBtnGhost} onClick={() => setMode("edit")} disabled={busy || checking}>
            Düzenle
          </button>
          <button type="button" className={kupaBtnDanger} onClick={onDeleteClick} disabled={busy || checking}>
            {checking ? "Kontrol ediliyor…" : "Sil"}
          </button>
        </div>
      </header>

      {actionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{actionError}</p>
      ) : null}

      <ReadBlock title="Teknik Özeti" text={technique.description} empty="Henüz açıklama eklenmemiş." />
      <ReadBlock title="Genel Uygulama Yaklaşımı" text={technique.application_info} empty="Henüz uygulama bilgisi eklenmemiş." />

      <ReadBlock title="Güvenlik ve Dikkat" text={technique.safety_note} empty="Henüz güvenlik/dikkat notu eklenmemiş." />
      <TechniqueSourcesSection techniqueId={technique.id} />

      <ReadBlock title="Uzman Notum" text={technique.practitioner_note} empty="Henüz kişisel not eklenmemiş." />

      <TechniqueProtocolsSection techniqueId={technique.id} />

      {/* Silme UX — app-standart modal (native window.confirm YOK). */}
      {deleteDialog?.variant === "blocked" ? (
        <KupaConfirmDialog
          open
          title="Teknik silinemiyor"
          description={
            "Bu teknik bir veya daha fazla protokolde kullanılıyor.\n" +
            "Silmeden önce ilgili protokollerden tekniği çıkarmanız gerekir."
          }
          closeLabel="Kapat"
          onClose={() => setDeleteDialog(null)}
        >
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Kullanıldığı protokoller
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {deleteDialog.protocols.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px] font-semibold text-slate-800">{p.title}</span>
                  <Link
                    href={`/kupa/protokoller/${p.id}`}
                    className="shrink-0 text-[12px] font-semibold text-amber-700 hover:text-amber-800"
                  >
                    Protokolü Aç →
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
          title="Tekniği sil?"
          description="Bu teknik kalıcı olarak silinecek. Bu işlem geri alınamaz."
          confirmLabel="Tekniği Sil"
          cancelLabel="Vazgeç"
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => { if (!busy) setDeleteDialog(null); }}
        />
      ) : null}
    </div>
  );
}
