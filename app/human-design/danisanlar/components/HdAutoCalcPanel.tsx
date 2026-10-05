"use client";

// Danışan Detayı → "Otomatik Hesapla" (RoxyAPI). Manuel HD akışından BAĞIMSIZ, ek bir yol.
//
//   • Doğum tarihi + kesin saat: KAYITLI danışan bilgisinden (kaydedilmemiş form değişikliği
//     varsa hesap kapalı — sunucu kayıtlı değeri kullanır).
//   • Doğum yeri: listeden seçim zorunlu (tz + koordinat sunucuda kimlikten çözülür).
//   • Aynı girdi daha önce hesaplandıysa sunucu kayıtlı sonucu döndürür (yeni ücretli çağrı yok).
//   • Sonuç ayrı bir "hesaplanmış" kayıttır; manuel haritanın üzerine YAZILMAZ.
//   • Görüntüleme kayıtlı sonuçtan yapılır (HdComputedChartModal) — yeniden hesap yok.

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  computeRoxyChart,
  listComputedCharts,
  type ComputedChartListRow,
} from "@/lib/human-design/api/chartsClient";
import { hdAuthorityLabelFromCode, hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { HdComputedChartModal } from "../../kayitli-haritalar/components/HdComputedChartModal";

const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : v;
}

export function HdAutoCalcPanel({
  clientId,
  birthDate,
  birthTime,
  formDirty,
}: {
  clientId: string;
  /** KAYITLI danışan değerleri (form state DEĞİL). */
  birthDate: string | null;
  birthTime: string | null;
  /** Danışan formunda kaydedilmemiş değişiklik var mı? */
  formDirty: boolean;
}) {
  const { showToast } = useToast();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [location, setLocation] = useState<HdPickedLocation | null>(null);
  const [rows, setRows] = useState<ComputedChartListRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const prefilled = useRef(false);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    const { rows: data } = await listComputedCharts({ clientId });
    setRows(data);
    setLoadingRows(false);
    // Önceki Roxy hesabının doğum yeri ile ön-doldur (yalnız bir kez; kullanıcı seçimini ezmez).
    if (!prefilled.current) {
      prefilled.current = true;
      const last = data.find((r) => r.engine_version?.startsWith("roxyapi") && r.location_id && r.birth_place && r.timezone);
      if (last) setLocation({ id: last.location_id!, label: last.birth_place!, tz: last.timezone! });
    }
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount'ta liste yükleme
    void loadRows();
  }, [loadRows]);

  const hasBirth = !!birthDate && !!birthTime;
  const disabledReason = isDemo
    ? "Demo hesabında otomatik hesaplama kapalıdır."
    : !hasBirth
      ? "Otomatik hesaplama için doğum tarihi ve kesin doğum saati kaydedilmiş olmalıdır."
      : formDirty
        ? "Danışan bilgilerinde kaydedilmemiş değişiklik var. Önce “Güncelle” ile kaydedin."
        : !location
          ? "Doğum yerini listeden seçin."
          : null;

  async function handleCompute() {
    if (busyRef.current || !location || disabledReason) return;
    busyRef.current = true; // çift tıklama koruması (sunucu ayrıca idempotent)
    setBusy(true);
    setError(null);
    const r = await computeRoxyChart(clientId, location.id);
    busyRef.current = false;
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    showToast({
      message: r.reused
        ? "Bu doğum bilgileriyle hesaplanmış harita zaten kayıtlı; kayıtlı sonuç açıldı (yeni hesap yapılmadı)."
        : "Harita hesaplandı ve kaydedildi.",
      type: "success",
    });
    await loadRows();
    setOpenId(r.id);
  }

  return (
    <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60" data-hd-autocalc>
      <p className={sectionCls}>Otomatik Hesaplama</p>
      <p className="mb-3 text-xs leading-relaxed text-slate-600">
        Danışanın kayıtlı doğum tarihi ve saati ile seçtiğiniz doğum yerinden Human Design haritası hesaplanır ve ayrı bir
        “hesaplanmış harita” olarak kaydedilir. Manuel harita kaydınız değişmez.
      </p>

      <dl className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Doğum Tarihi</dt>
          <dd className="m-0 font-bold text-slate-900">{fmtDate(birthDate)}</dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Doğum Saati</dt>
          <dd className="m-0 font-bold tabular-nums text-slate-900">{birthTime ? birthTime.slice(0, 5) : "—"}</dd>
        </div>
      </dl>

      <label htmlFor={`hd-autocalc-loc-${clientId}`} className="mb-1.5 block text-xs font-bold text-slate-700">
        Doğum Yeri (listeden seçin) *
      </label>
      <HdBirthLocationPicker id={`hd-autocalc-loc-${clientId}`} value={location} onChange={setLocation} disabled={busy || isDemo} />
      {location ? (
        <p className="mt-1 text-[11px] text-slate-500">
          Saat dilimi: <span className="font-semibold text-slate-700">{location.tz}</span>
        </p>
      ) : null}

      {disabledReason && !busy ? <p className="mt-3 text-xs font-semibold text-amber-700">{disabledReason}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleCompute()}
        disabled={busy || !!disabledReason}
        aria-busy={busy}
        className="btn-primary mt-3 h-10 w-full rounded-xl text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Hesaplanıyor…" : "Otomatik Hesapla"}
      </button>

      <div className="mt-5 border-t border-indigo-100 pt-4">
        <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-600">Hesaplanmış Haritalar</p>
        {loadingRows ? (
          <p className="text-xs text-slate-500">Yükleniyor...</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500">Bu danışan için henüz hesaplanmış harita yok.</p>
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {rows.map((r) => {
              const c = toAppChartCodes(r);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-left text-xs transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <span className="min-w-0 font-bold text-slate-800">
                      {hdTypeLabelFromCode(c.type_code)} · {hdProfileLabelFromCode(c.profile_code).split(" — ")[0]} ·{" "}
                      {hdAuthorityLabelFromCode(c.authority_code)}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {r.birth_place ?? "—"} · {fmtDate(r.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
