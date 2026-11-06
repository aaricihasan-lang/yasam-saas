"use client";

// Klasik Numeroloji · mükerrer kişi analizi uyarısı (Kaydet öncesi; Bütüncül D2 / #721 deneyimiyle aynı seçenekler).
//   • "duplicate"   — Mevcut Kaydı Aç (yeni sekmede; buradaki kaydedilmemiş sonuç korunur) · Yine de Yeni Kaydet · Vazgeç.
//                     Birden fazla eşleşmede hepsi listelenir, her biri ayrı açılabilir.
//   • "checkFailed" — Önceki kayıtlar kontrol edilemedi: Tekrar Dene · Yine de Kaydet · Vazgeç. Otomatik kayıt YOK.
// Escape / dış tık = Vazgeç (kontrol sürerken kapatılamaz). Hiçbir seçenek mevcut kaydı değiştirmez.

import { useEffect, useId, useRef } from "react";

export type DuplicateMatchView = { id: string; title: string; fullName: string; birthDate: string; createdAt: string };
export type DuplicateDialogMode = "duplicate" | "checkFailed";

function fmtCreated(v: string): string {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

function analysisHref(id: string): string {
  return `/numeroloji-klasik/analiz/${encodeURIComponent(id)}`;
}

export function DuplicateAnalysisDialog({
  open,
  mode,
  matches,
  total,
  checking,
  onSaveAnyway,
  onRetry,
  onCancel,
}: {
  open: boolean;
  mode: DuplicateDialogMode;
  matches: DuplicateMatchView[];
  total: number;
  checking: boolean;
  onSaveAnyway: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLElement | null>(null);
  const latest = useRef({ checking, onCancel });
  useEffect(() => {
    latest.current = { checking, onCancel };
  });

  useEffect(() => {
    if (!open) return;
    const lastFocus = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!latest.current.checking) latest.current.onCancel();
      } else if (e.key === "Tab" && boxRef.current) {
        const f = boxRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const failed = mode === "checkFailed";
  if (!failed && matches.length === 0) return null;
  const single = matches.length === 1;
  const setFirst = (el: HTMLElement | null) => {
    firstRef.current = el;
  };
  const stack = { display: "flex", flexDirection: "column", gap: 8, marginTop: 18 } as const;
  const full = { width: "100%", justifyContent: "center" } as const;

  return (
    <div className="nk-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !checking) onCancel(); }} data-testid="dup-dialog" data-mode={mode}>
      <div className="nk-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} ref={boxRef}>
        <h2 className="nk-h2" id={titleId}>{failed ? "Önceki kayıtlar kontrol edilemedi" : "Bu kişi için kayıtlı analiz var"}</h2>
        <div className="nk-modal-body">
          {failed ? (
            <>
              <p className="nk-lead">Bu ad soyad ve doğum tarihiyle daha önce kayıt yapılıp yapılmadığı şu anda kontrol edilemedi. Tekrar deneyebilir ya da kontrol etmeden kaydedebilirsiniz.</p>
              <p className="nk-hint" style={{ marginTop: 6 }}>Henüz hiçbir şey kaydedilmedi; bu sayfadaki sonuç korunur.</p>
            </>
          ) : (
            <>
              <p className="nk-lead">
                Bu ad soyad ve doğum tarihiyle kaydedilmiş {single ? "bir kişi analiziniz" : `${total} kişi analiziniz`} bulunuyor. Mevcut kaydı açmak mı, yoksa yeni bir analiz kaydetmek mi istersiniz?
              </p>
              <p className="nk-hint" style={{ marginTop: 6 }}>Mevcut kayıt yeni sekmede açılır; bu sayfadaki kaydedilmemiş sonuç kaybolmaz. Eski kayıt değiştirilmez.</p>
              <ul aria-label="Eşleşen kayıtlar" data-testid="dup-list" style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {matches.map((m, i) => (
                  <li key={m.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", border: "1px solid var(--b-line)", borderRadius: 12, background: "#fff" }}>
                    <span style={{ minWidth: 0, flex: "1 1 180px" }}>
                      <strong style={{ display: "block", overflowWrap: "anywhere" }}>{m.title || m.fullName}</strong>
                      <span className="nk-hint" style={{ display: "block" }}>
                        {m.fullName} · Doğum {m.birthDate}{fmtCreated(m.createdAt) ? ` · Kayıt ${fmtCreated(m.createdAt)}` : ""}
                      </span>
                    </span>
                    {!single ? (
                      <a ref={i === 0 ? setFirst : undefined} className="nk-btn nk-sm" href={analysisHref(m.id)} target="_blank" rel="noopener noreferrer" onClick={onCancel} data-testid="dup-open">
                        Bu Kaydı Aç
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
              {total > matches.length ? <p className="nk-hint" style={{ marginTop: 6 }}>En yeni {matches.length} kayıt gösteriliyor (toplam {total}).</p> : null}
            </>
          )}
        </div>
        <div style={stack}>
          {failed ? (
            <button ref={setFirst} type="button" className="nk-btn nk-primary" style={full} onClick={onRetry} disabled={checking} data-testid="dup-retry">
              {checking ? "Kontrol ediliyor…" : "Tekrar Dene"}
            </button>
          ) : single ? (
            <a ref={setFirst} className="nk-btn nk-primary" style={full} href={analysisHref(matches[0].id)} target="_blank" rel="noopener noreferrer" onClick={onCancel} data-testid="dup-open">
              Mevcut Kaydı Aç
            </a>
          ) : null}
          <button type="button" className="nk-btn" style={full} onClick={onSaveAnyway} disabled={checking} data-testid="dup-save">
            {failed ? "Yine de Kaydet" : "Yine de Yeni Kaydet"}
          </button>
          <button type="button" className="nk-btn" style={full} onClick={onCancel} disabled={checking} data-testid="dup-cancel">
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
