"use client";

/**
 * Danışan Ön İzleme (Aşama 7B) — SALT OKUNUR, ekranın ortasında modal.
 *   • Masaüstünde ~yarım ekran genişliği (md: 50vw), mobilde ekrana uyar; içerik kendi içinde kayar.
 *   • Astroloji ekranından ayrılmaz; Danışan Yolculuğu sayfası AÇILMAZ / iframe YOK.
 *   • Yalnız sunucunun sınırlı ön izleme ucundan gelen ayırt edici alanlar (sağlık/görüşme verisi yok).
 *   • Esc / arka plan / Kapat → kapanır; odak açan düğmeye geri döner.
 */

import { useEffect, useRef, useState } from "react";
import { astroFetch } from "../_lib/api";

type Preview = {
  id: string;
  ref: string;
  name: string | null;
  birthDate: string | null;
  phoneMasked: string | null;
  createdAt: string | null;
  linkedProfiles: { id: string; label: string; archived: boolean }[];
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function ClientPreviewModal({ clientId, onClose, footer }: { clientId: string; onClose: () => void; footer?: React.ReactNode }) {
  const [state, setState] = useState<{ id: string; c: Preview | null; error: string | null } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void astroFetch<{ client: Preview }>(`/api/admin/astroloji/clients/${clientId}/preview`).then((r) => {
      if (alive) setState({ id: clientId, c: r.ok ? r.data.client : null, error: r.ok ? null : r.error });
    });
    return () => {
      alive = false;
    };
  }, [clientId]);

  // onClose her render'da yeni olabilir → ref; odak/kaydırma kilidi yalnız açılış/kapanışta.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const cur = state && state.id === clientId ? state : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="astro-client-preview-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="astro-client-preview-title"
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:w-[50vw] md:max-w-none"
        data-testid="astro-client-preview"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 id="astro-client-preview-title" className="text-base font-semibold text-slate-900">
            Danışan Ön İzleme
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700">
            Kapat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm" data-testid="astro-client-preview-body">
          {!cur ? (
            <p className="text-slate-400">Yükleniyor…</p>
          ) : !cur.c ? (
            <p className="text-rose-700">{cur.error}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
                <dt className="text-slate-500">Ad soyad</dt>
                <dd className="font-medium text-slate-900">{cur.c.name ?? "Adsız danışan"}</dd>
                <dt className="text-slate-500">Doğum tarihi</dt>
                <dd>{fmtDate(cur.c.birthDate)}</dd>
                <dt className="text-slate-500">Telefon (maskeli)</dt>
                <dd className="font-mono">{cur.c.phoneMasked ?? "—"}</dd>
                <dt className="text-slate-500">Kayıt tarihi</dt>
                <dd>{fmtDate(cur.c.createdAt)}</dd>
                <dt className="text-slate-500">Danışan kayıt no</dt>
                <dd className="font-mono">{cur.c.ref}</dd>
              </dl>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-600">Bu danışana bağlı Astroloji profilleriniz</p>
                {cur.c.linkedProfiles.length === 0 ? (
                  <p className="text-xs text-slate-500">Yok.</p>
                ) : (
                  <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
                    {cur.c.linkedProfiles.map((p) => (
                      <li key={p.id}>
                        {p.label}
                        {p.archived ? " (arşivde)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Salt okunur ön izleme. Şehir ve e-posta bu danışan kaydında tutulmadığı için gösterilmez; sağlık, anamnez ve görüşme bilgileri burada yer almaz.
              </p>
            </div>
          )}
        </div>
        {footer && cur?.c && <div className="border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
