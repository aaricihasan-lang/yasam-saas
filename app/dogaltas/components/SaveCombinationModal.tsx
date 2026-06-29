"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";
import { DOGALTAS_INPUT_CLASS } from "@/lib/dogaltas/formStyles";

/** Danışan autocomplete için hafif danışan tipi. */
export type PickerClient = {
  id: string;
  ad?: string | null;
  soyad?: string | null;
  telefon?: string | null;
};

export function clientFullName(c: PickerClient): string {
  const name = `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();
  return name || "İsimsiz danışan";
}

type SaveCombinationModalProps = {
  open: boolean;
  cartCount: number;
  /** Kaydedilecek kombinasyonun adı (özet için). */
  combinationName: string;
  /** Genel kayıt yükleniyor mu (sayfa state'i). */
  saving: boolean;
  /** Danışana kayıt yükleniyor mu (sayfa state'i). */
  savingClient: boolean;
  onClose: () => void;
  onSaveGeneral: () => void;
  onSaveToClient: (client: PickerClient) => void;
};

type Step = "choose" | "client";

/**
 * "Kombinasyon nereye kaydedilsin?" hedef seçim modalı.
 *
 *   1) Genel Kombinasyonlara Kaydet → onSaveGeneral (mevcut akış, DEĞİŞMEZ)
 *   2) Danışana Özel Kaydet         → danışan ara/seç → onSaveToClient(client)
 *
 * Gelecek entegrasyon: danışan ön-seçili açılmak istendiğinde sayfa, modal'ı
 * açmadan doğrudan onSaveToClient çağırabilir (bkz. kombinasyon-olustur page).
 */
export function SaveCombinationModal({
  open,
  cartCount,
  combinationName,
  saving,
  savingClient,
  onClose,
  onSaveGeneral,
  onSaveToClient,
}: SaveCombinationModalProps) {
  const [step, setStep] = useState<Step>("choose");
  const [clients, setClients] = useState<PickerClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickerClient | null>(null);
  const loadedRef = useRef(false);

  // Açılışta sıfırla.
  useEffect(() => {
    if (open) {
      setStep("choose");
      setQuery("");
      setSelected(null);
      setClientError(null);
    }
  }, [open]);

  // ESC + body scroll kilidi.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Danışan adımına geçince listeyi bir kez çek.
  useEffect(() => {
    if (step !== "client" || loadedRef.current) return;
    loadedRef.current = true;

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    if (!userId || !sessionToken) {
      setClientError("Oturum bulunamadı.");
      return;
    }

    setLoadingClients(true);
    setClientError(null);
    fetch(`/api/clients?limit=1000`, {
      headers: { "x-user-id": userId, "x-session-token": sessionToken },
      cache: "no-store",
    })
      .then((res) => res.json().catch(() => ({})))
      .then((json: { ok?: boolean; error?: string; clients?: PickerClient[] }) => {
        if (!json.ok) {
          setClientError(json.error ?? "Danışanlar yüklenemedi.");
          return;
        }
        setClients(json.clients ?? []);
      })
      .catch((err) => {
        setClientError(err instanceof Error ? err.message : "Ağ hatası");
      })
      .finally(() => setLoadingClients(false));
  }, [step]);

  const results = useMemo(() => {
    const q = normalizeTr(query.trim());
    if (!q) return clients.slice(0, 30);
    return clients
      .filter((c) => {
        const hay = normalizeTr(
          `${c.ad ?? ""} ${c.soyad ?? ""} ${c.telefon ?? ""} ${c.id}`,
        );
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [clients, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:max-w-[460px] sm:rounded-[24px]"
        role="dialog"
        aria-modal="true"
        aria-label="Kombinasyon kaydet"
      >
        {/* Başlık */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-950">
              {step === "choose"
                ? "Kombinasyon nereye kaydedilsin?"
                : "Danışana Özel Kaydet"}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {combinationName.trim() || "Kombinasyon"} · {cartCount} taş
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-600 transition hover:bg-slate-200"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "choose" ? (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onSaveGeneral}
                disabled={saving}
                className="w-full rounded-2xl border-2 border-violet-200 bg-violet-50/70 p-3.5 text-left transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-60"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🟣</span>
                  <span className="text-sm font-black text-slate-950">
                    {saving ? "Kaydediliyor..." : "Genel Kombinasyonlara Kaydet"}
                  </span>
                </div>
                <p className="mt-1 pl-7 text-xs font-medium leading-snug text-slate-500">
                  Tüm danışanlarda tekrar kullanılabilecek şablon kombinasyon.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setStep("client")}
                disabled={saving}
                className="w-full rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-3.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">👤</span>
                  <span className="text-sm font-black text-slate-950">
                    Danışana Özel Kaydet
                  </span>
                </div>
                <p className="mt-1 pl-7 text-xs font-medium leading-snug text-slate-500">
                  Yalnızca seçilen danışanın dosyasında görünür.
                </p>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Danışan ara */}
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                  Danışan Ara
                </label>
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="İsim, telefon veya danışan no…"
                  className={DOGALTAS_INPUT_CLASS}
                />
              </div>

              {clientError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {clientError}
                </p>
              )}

              {/* Sonuçlar */}
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                {loadingClients ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-slate-400">
                    Danışanlar yükleniyor…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-slate-400">
                    {query.trim() ? "Eşleşen danışan yok." : "Danışan bulunamadı."}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {results.map((c) => {
                      const isSel = selected?.id === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(c)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                              isSel ? "bg-emerald-50" : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-slate-800">
                                {clientFullName(c)}
                              </span>
                              {c.telefon && (
                                <span className="block truncate text-[11px] font-medium text-slate-400">
                                  {c.telefon}
                                </span>
                              )}
                            </span>
                            {isSel && (
                              <span className="shrink-0 text-sm font-black text-emerald-600">
                                ✓
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {selected && (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                  Seçili: {clientFullName(selected)} · &quot;
                  {combinationName.trim() || "Kombinasyon"}&quot; ({cartCount} taş)
                  bu danışana kaydedilecek.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alt butonlar */}
        <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          {step === "client" ? (
            <button
              type="button"
              onClick={() => setStep("choose")}
              disabled={savingClient}
              className="btn-soft !px-4 !py-2 !text-xs"
            >
              ← Geri
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="btn-soft !px-4 !py-2 !text-xs"
            >
              İptal
            </button>
          )}

          {step === "client" && (
            <button
              type="button"
              onClick={() => selected && onSaveToClient(selected)}
              disabled={!selected || savingClient}
              className="btn-primary !px-5 !py-2"
            >
              {savingClient ? "Kaydediliyor..." : "💾 Danışana Kaydet"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
