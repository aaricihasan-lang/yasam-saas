"use client";

/**
 * Gökyüzü Atlası — TOPLU KAYIT (2026-10-12, gerçek Android UAT madde 1 + 10).
 *
 * Sorun: tek "Kaydet" yalnız ekranda AKTİF tekniği kaydediyordu; aynı oturumda hesaplanan diğer analizler (Roxy kredisi
 * harcanmış) arşive hiç girmiyordu. Bu pencere çalışma masasındaki KAYDEDİLMEMİŞ bütün hesaplanmış analizleri tek
 * listede gösterir (varsayılan: hepsi seçili; uzman tek tek kaldırabilir) ve tek onayla kaydeder.
 *
 * Kayıt mimarisi DEĞİŞMEZ: her teknik mevcut POST /analyses ile AYRI, değişmez bir analiz kaydıdır (snapshot sunucuda,
 * kayıtlı sonuçtan kurulur; sağlayıcı ÇAĞRILMAZ). Her satırın kararlı bir saveRequestId'si vardır (üst bileşende
 * saklanır) → kısmi başarısızlıktan sonra yeniden deneme, başarılı olmuş bir kaydı MÜKERRER oluşturmaz (sunucu aynı
 * kimliği "reused" döner). Başarı yalnız kayıt sunucudan GERİ OKUNABİLİRSE sayılır.
 *
 * Hesaplanamamış (eksik ayar / hata) teknikler bu listeye hiç girmez: yalnız masadaki başarılı sonuçlar kaydedilebilir.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

export type SaveBatchItem = {
  key: string;
  label: string;
  detail: string;
  /** Sekmesi kapatılmış ama bellekte duran sonuç. */
  closed: boolean;
  /** Bu analizin "Kendi Yorumum" alanında kaydedilmemiş taslak var (kayda girmez). */
  draft: boolean;
};
/** Sayının belirtme hâli eki: 1'i, 2'si, 3'ü, 6'sı, 9'u, 10'u, 40'ı … (son okunan basamağa göre). */
export function accSuffix(n: number): string {
  const ones = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"];
  const tens = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"];
  if (n % 10 !== 0) return ones[n % 10];
  if (n % 100 !== 0) return tens[(n / 10) % 10];
  return "ü";
}
export type SaveItemResult = { key: string; ok: true; analysisId: string; reused: boolean } | { key: string; ok: false; error: string };

export default function SaveBatchDialog({
  items: itemsProp,
  interpNote,
  onSave,
  onClose,
  onSucceeded,
}: {
  items: SaveBatchItem[];
  /** Kayıtla saklanacak sistem yorumu hakkında kısa bilgi (yetkisiz görünümde null → hiç söz edilmez). */
  interpNote: string | null;
  /** Seçilen anahtarları SIRAYLA kaydeder; her satırın sonucu ayrı bildirilir. */
  onSave: (keys: string[], titles: Record<string, string>, onItem: (r: SaveItemResult) => void) => Promise<SaveItemResult[]>;
  onClose: () => void;
  /** Bu çalıştırmada başarıyla kaydedilen sayısı (yeşil bildirim için). */
  onSucceeded: (count: number) => void;
}) {
  // Liste pencere açılırken DONDURULUR: kaydedilen satır listeden düşmez, ✓ ile kalır (uzman neyin kaydedildiğini görür).
  const [items] = useState(itemsProp);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(itemsProp.map((i) => [i.key, true])));
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [titleOpen, setTitleOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, SaveItemResult>>({});
  const [summary, setSummary] = useState<{ ok: number; failed: number } | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Başarılı satırlar listede ✓ olarak kalır ama artık seçilemez; kalan (kaydedilmemiş) satırlar hesaplanır.
  const pending = useMemo(() => items.filter((i) => !(results[i.key]?.ok === true)), [items, results]);
  const chosen = pending.filter((i) => picked[i.key]);
  const total = pending.length;

  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function run() {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setSummary(null);
    const keys = chosen.map((i) => i.key);
    // Yeniden denemede önceki hata satırı temizlenir (yalnız denenenler).
    setResults((m) => {
      const n = { ...m };
      for (const k of keys) delete n[k];
      return n;
    });
    const out = await onSave(keys, titles, (r) => setResults((m) => ({ ...m, [r.key]: r })));
    setBusy(false);
    const ok = out.filter((r) => r.ok).length;
    const failed = out.length - ok;
    setSummary({ ok, failed });
    if (ok > 0) onSucceeded(ok);
    // Tam başarı: pencere kapanır, ekranın üstündeki yeşil bildirim kalır. Kısmi başarısızlıkta pencere AÇIK kalır.
    if (failed === 0 && ok > 0) {
      onClose();
      return;
    }
    // Başarısızlar seçili kalır → "Başarısızları yeniden dene" tek dokunuş.
    setPicked(Object.fromEntries(out.filter((r) => !r.ok).map((r) => [r.key, true])));
  }

  const allDone = total === 0;
  const anyFailed = Object.values(results).some((r) => !r.ok);
  const btnLabel = busy
    ? "Kaydediliyor…"
    : anyFailed && chosen.length > 0 && chosen.every((i) => results[i.key] && !results[i.key].ok)
      ? `Başarısız ${chosen.length} analizi yeniden dene`
      : chosen.length === 1
        ? "Analizi kaydet"
        : `${chosen.length} analizi kaydet`;

  return (
    <div className="fixed inset-0 z-[78] flex items-end justify-center bg-[#050816]/75 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Analizleri kaydet" data-testid="atlas-save-batch">
      <div className="flex max-h-[100svh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white text-slate-800 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] sm:max-h-[90svh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#a8843e]">ANALİZ ARŞİVİNE KAYDET</p>
            <h3 className="text-base font-semibold text-slate-900">
              {allDone ? "Tüm analizler kaydedildi" : `${total} analizden ${chosen.length}'${accSuffix(chosen.length)} kaydedilecek`}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500" data-testid="atlas-save-batch-count">
              {allDone ? "Kaydedilmemiş hesaplanmış analiz kalmadı." : `Kaydedilmemiş hesaplanmış analiz: ${total} · seçili: ${chosen.length}`}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs leading-relaxed text-slate-600">
            Her teknik <strong>ayrı ve değişmez</strong> bir analiz kaydı olur; doğum profili revizyonu, teknik ayarları, harita verisi ve kaydedilmiş
            &quot;Kendi Yorumum&quot; notları saklanır. Kayıt sırasında <strong>yeni hesaplama yapılmaz</strong>.
            {interpNote ? ` ${interpNote}` : ""}
          </p>
          {total > 1 && !busy && (
            <div className="mb-2 flex gap-2 text-xs">
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500" onClick={() => setPicked(Object.fromEntries(pending.map((i) => [i.key, true])))}>
                Tümünü seç
              </button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500" onClick={() => setPicked({})}>
                Seçimi kaldır
              </button>
            </div>
          )}
          <ul className="flex flex-col gap-1.5" aria-label="Kaydedilecek analizler">
            {items.map((i) => {
              const r = results[i.key];
              const done = r?.ok === true;
              const on = !done && !!picked[i.key];
              return (
                <li key={i.key} className={`rounded-xl border px-3 py-2 ${done ? "border-emerald-200 bg-emerald-50" : r && !r.ok ? "border-rose-200 bg-rose-50" : on ? "border-[#0B1430]/40 bg-slate-50" : "border-slate-200"}`} data-save-row={i.key} data-state={done ? "saved" : r ? "failed" : on ? "picked" : "skipped"}>
                  <div className="flex items-start gap-3">
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Kaydedildi" />
                    ) : (
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0 accent-[#0B1430]"
                        checked={on}
                        disabled={busy}
                        onChange={(e) => setPicked((m) => ({ ...m, [i.key]: e.target.checked }))}
                        aria-label={`${i.label} kaydedilsin`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-slate-900">
                        {i.label}
                        {i.closed && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-normal text-slate-600">sekmesi kapalı</span>}
                      </p>
                      {i.detail && <p className="break-words text-xs text-slate-500">{i.detail}</p>}
                      {i.draft && !done && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> &quot;Kendi Yorumum&quot; alanında kaydedilmemiş taslak var; kayda yalnız kaydedilmiş not girer. Önce &quot;Notu kaydet&quot;e basın.
                        </p>
                      )}
                      {busy && on && !r && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> sırada…</p>}
                      {done && <p className="mt-0.5 text-xs text-emerald-800">{r.reused ? "Zaten kayıtlıydı (mükerrer kayıt oluşturulmadı)." : "Kaydedildi ve sunucudan doğrulandı."}</p>}
                      {r && !r.ok && <p className="mt-0.5 text-xs text-rose-800" role="alert">Kaydedilmedi: {r.error}</p>}
                      {!done && on && !busy && (
                        titleOpen === i.key ? (
                          <input
                            className="mt-1.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                            placeholder="Başlık (boş bırakılırsa otomatik)"
                            maxLength={200}
                            value={titles[i.key] ?? ""}
                            onChange={(e) => setTitles((m) => ({ ...m, [i.key]: e.target.value }))}
                            autoFocus
                          />
                        ) : (
                          <button type="button" className="mt-1 text-xs text-sky-700 underline" onClick={() => setTitleOpen(i.key)}>
                            {titles[i.key]?.trim() ? `Başlık: ${titles[i.key].trim()}` : "Başlık ekle (isteğe bağlı)"}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
          {summary && (
            <p className={`rounded-lg px-3 py-2 text-sm ${summary.failed ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`} role="status" data-testid="atlas-save-batch-summary">
              {summary.failed === 0
                ? summary.ok === 1
                  ? "Analiz başarıyla kaydedildi."
                  : `${summary.ok} analiz başarıyla kaydedildi.`
                : `${summary.ok} analiz kaydedildi, ${summary.failed} analiz kaydedilemedi. Başarısız olanları yeniden deneyebilirsiniz; kaydedilenler tekrar oluşturulmaz.`}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
              {allDone || summary ? "Kapat" : "Vazgeç"}
            </button>
            {!allDone && (
              <button
                ref={confirmRef}
                type="button"
                onClick={() => void run()}
                disabled={busy || chosen.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0b1430] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a2b5c] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="atlas-save-batch-confirm"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {btnLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
