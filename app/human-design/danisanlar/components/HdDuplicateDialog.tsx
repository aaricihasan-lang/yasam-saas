"use client";

// Olası MÜKERRER danışan / analiz uyarısı (owner kuralı: otomatik engel, birleştirme ya da "aynı kişi"
// kararı YOK — uzman kendisi karar verir).
//   • Varsayılan ve öne çıkan eylem: "Mevcut … Aç" (gereksiz kayıt / Roxy hakkı harcanmaz).
//   • "Farklı Kişi …" yalnız bu açık tıklamayla seçilir; gösterilen adayların anahtarları sunucuya
//     onay olarak gider (sunucu yeni çıkan adayı tekrar sorar).
//   • "Vazgeç" hiçbir istek göndermez.
//   • Karşılaştırılan alanlar gösterilir; "birebir aynı" yalnız tüm alanlar dolu ve eşitse söylenir.

import { useRef } from "react";
import { createPortal } from "react-dom";
import type { HdDuplicateCandidate } from "@/lib/human-design/api/hdIdentity";
import { formatIsoDateTr } from "@/lib/human-design/api/journeyClient";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { useHdBodyScrollLock } from "../../components/useHdBodyScrollLock";

export type HdDuplicateDialogMode = "client" | "chart";

const TEXT: Record<HdDuplicateDialogMode, { title: string; body: string; open: string; proceed: string }> = {
  client: {
    title: "Bu danışan daha önce kaydedilmiş olabilir",
    body: "Daha önce aynı doğum bilgileriyle kaydedilmiş bir Human Design danışanı bulundu. Bu kişi aynı danışan olabilir. Mevcut kaydı açarak gereksiz yeni kayıt ve hesaplama oluşturulmasını önleyebilirsiniz.",
    open: "Mevcut Danışanı Aç",
    proceed: "Farklı Kişi, Yine de Devam Et",
  },
  chart: {
    title: "Bu bilgilerle hazırlanmış bir analiz var",
    body: "Bu bilgilerle daha önce hazırlanmış bir Human Design analizi bulundu. Yeni hesaplama yapmak Roxy API hakkınızı kullanabilir. Önce mevcut analizi inceleyebilirsiniz.",
    open: "Mevcut Analizi Aç",
    proceed: "Farklı Kişi, Yeni Hesaplama Yap",
  },
};

export function HdDuplicateDialog({
  mode,
  candidates,
  busy = false,
  onOpen,
  onProceed,
  onCancel,
}: {
  mode: HdDuplicateDialogMode;
  candidates: HdDuplicateCandidate[];
  busy?: boolean;
  onOpen: (c: HdDuplicateCandidate) => void;
  onProceed: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useHdModalA11y(ref, onCancel);
  useHdBodyScrollLock();
  const t = TEXT[mode];
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-6 sm:items-center">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hd-dup-title"
        aria-describedby="hd-dup-body"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white shadow-2xl focus:outline-none"
        data-hd-duplicate-dialog={mode}
      >
        <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-4">
          <h2 id="hd-dup-title" className="m-0 text-base font-black text-slate-900">{t.title}</h2>
          <p id="hd-dup-body" className="m-0 mt-1.5 text-sm leading-relaxed text-slate-700">{t.body}</p>
        </div>
        <ul className="m-0 max-h-[45vh] list-none space-y-2 overflow-y-auto p-4">
          {candidates.map((c) => (
            <li key={c.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3" data-hd-duplicate-candidate={c.key}>
              <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                <span className="break-words">{c.name || "—"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.match === "exact" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                  {c.match === "exact" ? "Tüm doğum bilgileri aynı" : "Benzer kayıt olabilir"}
                </span>
              </p>
              <dl className="m-0 mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-slate-600">
                <dt className="font-semibold">Doğum Tarihi</dt>
                <dd className="m-0">{c.birthDate ? formatIsoDateTr(c.birthDate) : "—"}</dd>
                <dt className="font-semibold">Doğum Saati</dt>
                <dd className="m-0">{c.birthTime ?? "kayıtlı değil"}</dd>
                <dt className="font-semibold">Doğum Yeri</dt>
                <dd className="m-0 break-words">{c.birthPlace ?? "kayıtlı değil"}</dd>
              </dl>
              <p className={`m-0 mt-1.5 text-xs font-semibold ${c.linkedToJourney ? "text-emerald-700" : "text-slate-500"}`}>
                {c.linkedToJourney ? "Danışan Yolculuğu'na bağlı" : "Danışan Yolculuğu bağlantısı yok"}
              </p>
              <button
                type="button"
                autoFocus={c === candidates[0]}
                disabled={busy}
                onClick={() => onOpen(c)}
                className="mt-2 h-9 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-black text-white shadow-sm hover:brightness-105 disabled:opacity-60"
                data-hd-duplicate-open={c.key}
              >
                {c.kind === "journey_client" ? "Mevcut Danışanı Seç" : t.open}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" data-hd-duplicate-cancel>
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onProceed}
            disabled={busy}
            className="h-9 rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
            data-hd-duplicate-proceed
          >
            {busy ? "İşleniyor..." : t.proceed}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
