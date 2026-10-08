"use client";

// Danışan Detayı → HUMAN DESIGN HARİTASI (RoxyAPI otomatik hesaplama). Manuel akıştan bağımsız.
//
//   • Tek kaynak: sağdaki "Kişisel Bilgiler" (KAYITLI doğum tarihi/saati/yeri). Burada ikinci bir
//     giriş alanı YOK; hesap daima açık danışanın kayıtlı verisiyle yapılır (sunucu da öyle doğrular).
//   • Durum (resolveAutoCalcState): aynı girdiyle harita varsa "Profesyonel haritayı aç" — Roxy
//     ÇAĞRILMAZ; girdi değiştiyse "Yeniden hesapla"; hiç yoksa "Hesapla".
//   • Sunucu ayrıca idempotent (input_hash): aynı girdi tekrar gönderilse de kayıtlı sonuç döner.
//   • "Yeniden hesapla" (girdi değişti) RoxyAPI hakkı tüketir → önce AÇIK onay; iptal = istek YOK.
//     İlk "Hesapla" ek onay istemez (owner kararı).

export const HD_RECALC_CONFIRM_MESSAGE =
  "Yeni hesaplama RoxyAPI kullanım hakkı tüketebilir. Önceki analiziniz korunacaktır. Devam etmek istiyor musunuz?";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { computeRoxyChart, listComputedCharts, type ComputedChartListRow } from "@/lib/human-design/api/chartsClient";
import { resolveAutoCalcState, isRoxyRow, type AutoCalcLocation } from "@/lib/human-design/chart/autoCalcState";
import { HdComputedChartModal } from "../../kayitli-haritalar/components/HdComputedChartModal";
import { labelOf } from "../../components/HdBirthLocationPicker";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { WORLD_LOCATIONS } from "@/lib/location/world";

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : v;
}

export function HdAutoCalcPanel({
  clientId,
  birthDate,
  birthTime,
  birthPlace,
  pickedLocation,
  storedLocation = null,
  formDirty,
}: {
  clientId: string;
  /** KAYITLI danışan değerleri (form state DEĞİL). */
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  /** Kişisel Bilgiler'de bu oturumda listeden seçilen doğum yeri (yoksa önceki hesaptan çözülür). */
  pickedLocation: AutoCalcLocation | null;
  /** Danışanda kalıcı, sunucunun çözdüğü doğum yeri (id "client"). */
  storedLocation?: AutoCalcLocation | null;
  formDirty: boolean;
}) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [rows, setRows] = useState<ComputedChartListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const loadRows = useCallback(async () => {
    const { rows: data } = await listComputedCharts({ clientId });
    setRows(data);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount'ta liste yükleme
    void loadRows();
  }, [loadRows]);

  // Kayıtlı yer etiketi ile seçim uyuşmuyorsa (kaydedilmemiş seçim) seçim kullanılmaz. Seçim yoksa
  // kayıtlı etiket bir il/dünya şehri etiketiyle BİREBİR aynıysa o kayıt kullanılır (tahmin değil).
  const localMatch = useMemo<AutoCalcLocation | null>(() => {
    if (!birthPlace) return null;
    const l = [...TR_LOCATIONS, ...WORLD_LOCATIONS].find((x) => labelOf(x) === birthPlace);
    return l ? { id: l.id, label: birthPlace, tz: l.tz } : null;
  }, [birthPlace]);
  const picked =
    (pickedLocation && pickedLocation.label === birthPlace ? pickedLocation : null) ??
    (storedLocation && storedLocation.label === birthPlace ? storedLocation : null) ??
    localMatch;
  const state = useMemo(
    () => resolveAutoCalcState({ birthDate, birthTime, birthPlace, picked, rows }),
    [birthDate, birthTime, birthPlace, picked, rows],
  );
  const history = rows.filter(isRoxyRow);

  async function compute() {
    if (busyRef.current || !state.location || formDirty || isDemo) return;
    busyRef.current = true; // çift tıklama koruması (onay penceresi açıkken de; sunucu ayrıca idempotent)
    if (state.kind === "changed") {
      const confirmed = await confirm({
        title: "Yeniden hesapla",
        message: HD_RECALC_CONFIRM_MESSAGE,
        confirmText: "Devam et",
        cancelText: "Vazgeç",
        tone: "warning",
      });
      if (!confirmed) {
        busyRef.current = false; // iptal → hiçbir hesaplama isteği gönderilmez
        return;
      }
    }
    setBusy(true);
    setError(null);
    const r = await computeRoxyChart(clientId, state.location.id);
    busyRef.current = false;
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    showToast({
      message: r.reused ? "Bu doğum bilgileriyle kayıtlı harita açıldı (yeni hesap yapılmadı)." : "Harita hesaplandı ve kaydedildi.",
      type: "success",
    });
    await loadRows();
    setOpenId(r.id);
  }

  const summary = [fmtDate(birthDate), birthTime ? birthTime.slice(0, 5) : "—", state.location?.label ?? birthPlace ?? "—"].join(" • ");
  const blocked = isDemo
    ? "Demo hesabında otomatik hesaplama kapalıdır."
    : formDirty
      ? "Kişisel Bilgiler'de kaydedilmemiş değişiklik var. Önce “Güncelle” ile kaydedin."
      : null;

  return (
    <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60" data-hd-autocalc={state.kind}>
      <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-700">Human Design Haritası</p>
      <p className="mb-3 text-sm font-semibold tabular-nums text-slate-800">{summary}</p>

      {loading ? (
        <p className="text-xs text-slate-500">Yükleniyor...</p>
      ) : state.kind === "missing_birth" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Hesaplama için Kişisel Bilgiler&apos;de doğum tarihi ve kesin doğum saati kayıtlı olmalıdır.
        </p>
      ) : state.kind === "need_location" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Doğum yerini Kişisel Bilgiler&apos;de listeden seçip “Güncelle” ile kaydedin (il, ilçe veya şehir).
        </p>
      ) : (
        <>
          {state.kind === "changed" ? (
            <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Doğum bilgileri mevcut hesaplanmış haritadan farklı.
            </p>
          ) : null}
          {blocked ? <p className="mb-2 text-xs font-semibold text-amber-700">{blocked}</p> : null}
          {error ? (
            <p role="alert" className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          ) : null}
          {state.kind === "open" ? (
            <button
              type="button"
              onClick={() => setOpenId(state.chartId)}
              className="btn-primary h-11 w-full rounded-xl text-sm font-black uppercase tracking-wide"
            >
              Profesyonel Haritayı Aç
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void compute()}
              disabled={busy || !!blocked}
              aria-busy={busy}
              className="btn-primary h-11 w-full rounded-xl text-sm font-black uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Hesaplanıyor…" : state.kind === "changed" ? "Yeniden Hesapla" : "Human Design Haritasını Hesapla"}
            </button>
          )}
          {state.kind === "changed" ? (
            <button
              type="button"
              onClick={() => setOpenId(state.previousId)}
              className="mt-2 h-9 w-full rounded-xl border border-indigo-200 bg-white text-xs font-bold text-indigo-700 transition hover:bg-indigo-50"
            >
              Önceki haritayı aç
            </button>
          ) : null}
        </>
      )}

      {history.length > 1 ? (
        <details className="mt-4 border-t border-indigo-100 pt-3">
          <summary className="cursor-pointer text-[11px] font-black uppercase tracking-wide text-indigo-600">
            Önceki hesaplar ({history.length})
          </summary>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {history.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="flex w-full flex-wrap justify-between gap-x-3 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50"
                >
                  <span className="tabular-nums">
                    {fmtDate(r.birth_date)} • {(r.birth_time ?? "").slice(0, 5)} • {r.birth_place ?? "—"}
                  </span>
                  <span className="text-slate-400">{fmtDate(r.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {openId ? (
        <HdComputedChartModal
          id={openId}
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            setOpenId(null);
            void loadRows();
          }}
        />
      ) : null}
    </div>
  );
}
