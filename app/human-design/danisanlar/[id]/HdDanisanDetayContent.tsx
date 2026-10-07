"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useHdLeaveGuard } from "../../hooks/useHdLeaveGuard";
import { getHdClient, updateHdClient, type HdClientRow, type HdJourneyRef } from "../helpers/hdClients";
import { HdChartImageUpload } from "../components/HdChartImageUpload";
import { HdAutoCalcPanel } from "../components/HdAutoCalcPanel";
import { HdJourneyPanel } from "../components/HdJourneyPanel";
import { HdAnalysisHistory } from "../components/HdAnalysisHistory";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { runInEffect } from "@/lib/runInEffect";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

// NOT: chart_image_url bu formda TUTULMAZ/kaydedilmez — eski görsel yalnız salt-okunur gösterilir
// (AŞAMA 3C: yeni manuel görsel yükleme kapalı). "Güncelle" görselin storage path'ini asla ezmez.
//
// AŞAMA 3C — danışan çalışma sayfası: merkezî danışan bağlantısı (HdJourneyPanel) + doğum bilgileri +
// Hesapla / Profesyonel harita (HdAutoCalcPanel, DEĞİŞMEDİ) + Geçmiş Human Design Analizleri.
// Manuel harita oluşturma ve Rapor Oluştur bağlantıları kaldırıldı (eski kayıtlar geçmişte açılır).
type FormState = {
  name: string;
  birth_date: string;
  birth_time: string;
  birth_place: string;
  external_chart_url: string;
  notes: string;
};

function rowToForm(row: HdClientRow): FormState {
  return {
    name: row.name,
    birth_date: row.birth_date ?? "",
    birth_time: row.birth_time ?? "",
    birth_place: row.birth_place ?? "",
    external_chart_url: row.external_chart_url ?? "",
    notes: row.notes ?? "",
  };
}

type Props = { clientId: string };

export function HdDanisanDetayContent({ clientId }: Props) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [row, setRow] = useState<HdClientRow | null>(null);
  const [journey, setJourney] = useState<HdJourneyRef | null>(null);
  const [suggestions, setSuggestions] = useState<HdJourneyRef[]>([]);
  // ?chart=<id> (ör. Danışan Yolculuğu "Analizi Aç") → ilgili analiz doğrudan açılır.
  const [initialChartId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("chart"),
  );
  // P2-9: yüklenen satırın sürümü — koşullu güncelleme (başka oturumu ezmez).
  const versionRef = useRef<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Listeden seçilen doğum yeri (kimlik + etiket + tz). Kalıcı DB alanı yok: etiket birth_place'e
  // yazılır; tz/koordinat sunucuda kimlikten çözülür (hesaplanmış haritada saklanır).
  const [pickedLocation, setPickedLocation] = useState<HdPickedLocation | null>(null);
  // Danışanda kalıcı (sunucunun çözdüğü) doğum yeri → "client" referansıyla yeniden kullanılır.
  const storedLocation = useMemo<HdPickedLocation | null>(
    () =>
      row?.birth_location_id && row.birth_timezone && row.birth_location_label
        ? { id: "client", label: row.birth_location_label, tz: row.birth_timezone, locationId: row.birth_location_id }
        : null,
    [row],
  );

  const loadClient = useCallback(async () => {
    setLoading(true);
    const { row: data, error, journey: j, suggestions: sug } = await getHdClient(clientId);
    setLoading(false);
    if (error || !data) {
      setNotFound(true);
      showToast({ message: error ?? "Danışan bulunamadı.", type: "error" });
      return;
    }
    setRow(data);
    setJourney(j ?? null);
    setSuggestions(sug ?? []);
    setForm(rowToForm(data));
    versionRef.current = data.updated_at ?? null;
  }, [clientId, showToast]);

  // P2-7: kaydedilmemiş profil değişikliği — menü/logo/geri/yenile korunur.
  const dirty = useMemo(
    () => !!row && !!form && JSON.stringify(form) !== JSON.stringify(rowToForm(row)),
    [row, form],
  );
  const confirmLeave = useCallback(
    () =>
      confirm({
        title: "Kaydedilmemiş değişiklikler",
        message: "Danışan bilgilerindeki kaydedilmemiş değişiklikler kaybolacak. Sayfadan ayrılmak istiyor musunuz?",
        confirmText: "Değişiklikleri At ve Çık",
        cancelText: "Sayfada Kal",
        tone: "danger",
      }),
    [confirm],
  );
  useHdLeaveGuard(dirty, confirmLeave);

  useEffect(() => {
    runInEffect(loadClient);
  }, [loadClient]);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => (p ? { ...p, [field]: e.target.value } : p));
  }

  async function handleSave() {
    if (!form) return;
    if (!form.name.trim()) {
      showToast({ message: "Ad Soyad zorunludur.", type: "warning" });
      return;
    }
    setSaving(true);
    // chart_image_url GÖNDERİLMEZ — görsel yönetimi HdChartImageUpload'a aittir
    // (profil güncellemesi görselin storage path'ini ezmemelidir).
    const payload = {
      name: form.name.trim(),
      birth_date: form.birth_date || null,
      birth_time: form.birth_time || null,
      birth_place: form.birth_place.trim() || null,
      external_chart_url: form.external_chart_url.trim() || null,
      notes: form.notes.trim() || null,
    };
    // Bu oturumda listeden yeni yer seçildiyse referansı gönder (sunucu çözer ve kalıcılaştırır).
    const locationRef = pickedLocation && pickedLocation.label === payload.birth_place ? pickedLocation : null;
    const { error, conflict, updatedAt } = await updateHdClient(
      clientId,
      locationRef ? { ...payload, birth_location_ref: locationRef.id } : payload,
      versionRef.current,
    );
    setSaving(false);
    if (error) {
      showToast({ message: conflict ? error : `Hata: ${error}`, type: "error" });
    } else {
      // Kaydedilen hâl yeni baseline (dirty temizlenir; başlık güncel adı gösterir).
      versionRef.current = updatedAt ?? versionRef.current;
      setRow((r) =>
        r
          ? {
              ...r,
              ...payload,
              ...(locationRef
                ? { birth_location_id: locationRef.id, birth_location_label: locationRef.label, birth_timezone: locationRef.tz }
                : {}),
            }
          : r,
      );
      setForm((f) => (f ? { ...f, name: payload.name, birth_place: payload.birth_place ?? "", external_chart_url: payload.external_chart_url ?? "", notes: payload.notes ?? "" } : f));
      showToast({ message: "Danışan güncellendi.", type: "success" });
    }
  }

  if (loading) {
    return (
      <HumanDesignShell>
        <div className="flex items-center justify-center py-32 text-sm text-slate-500">
          Yükleniyor...
        </div>
      </HumanDesignShell>
    );
  }

  if (notFound || !row || !form) {
    return (
      <HumanDesignShell>
        <div className="flex flex-col items-center gap-4 py-32">
          <p className="text-sm text-slate-500">Danışan bulunamadı.</p>
          <Link
            href="/human-design/danisanlar"
            className="text-sm font-bold text-indigo-600 hover:underline"
          >
            ← Human Design Hesaplama
          </Link>
        </div>
      </HumanDesignShell>
    );
  }

  return (
    <HumanDesignShell>
      {/* Sayfa başlığı */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">
            Human Design Hesaplama
          </p>
          <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            {row.name}
          </h1>
        </div>
      </div>

      <div className="mb-4">
        <HdJourneyPanel
          hdClientId={clientId}
          profileName={row.name}
          profileBirthDate={row.birth_date ?? null}
          journey={journey}
          suggestions={suggestions}
          onChanged={() => void loadClient()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Sol: Otomatik Hesaplama + Harita Görseli + Hızlı Erişim */}
        <div className="space-y-4">
          {/* FAZ 1 — RoxyAPI otomatik hesaplama (manuel akıştan bağımsız, ek yol) */}
          <HdAutoCalcPanel
            clientId={clientId}
            birthDate={row.birth_date ?? null}
            birthTime={row.birth_time ?? null}
            birthPlace={row.birth_place ?? null}
            pickedLocation={pickedLocation}
            storedLocation={storedLocation}
            formDirty={dirty}
          />

          {/* Eski manuel harita görseli varsa YALNIZ görüntülenir (yeni yükleme kapalı). */}
          {row.chart_image_url ? (
            <details className="group rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm">
              <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-widest text-slate-500 marker:hidden">
                <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
                Eski Harita Görseli (salt okunur)
              </summary>
              <div className="mt-3">
                <HdChartImageUpload clientId={clientId} readOnly />
              </div>
            </details>
          ) : null}

          <HdAnalysisHistory clientId={clientId} initialChartId={initialChartId} />
        </div>

        {/* Sağ: Kişisel Bilgiler + Kaydet */}
        <div className="space-y-4">
          {/* Kişisel Bilgiler */}
          <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60">
            <p className={sectionCls}>Kişisel Bilgiler</p>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Ad Soyad *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  readOnly={!!journey}
                  className={`h-9 ${fieldBase} ${journey ? "bg-slate-50 text-slate-600" : ""}`}
                />
                {journey ? (
                  <p className="mt-1 text-[11px] text-slate-500">Ad ve soyad Danışan Yolculuğu kaydından gelir.</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Doğum Tarihi</label>
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={set("birth_date")}
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Doğum Saati</label>
                  <input
                    type="time"
                    value={form.birth_time}
                    onChange={set("birth_time")}
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="hd-client-birth-place" className={labelCls}>Doğum Yeri</label>
                <HdBirthLocationPicker
                  id="hd-client-birth-place"
                  value={pickedLocation ?? (storedLocation && storedLocation.label === form.birth_place ? storedLocation : null)}
                  initialText={form.birth_place}
                  onChange={(loc) => {
                    setPickedLocation(loc);
                    if (loc) setForm((p) => (p ? { ...p, birth_place: loc.label } : p));
                  }}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {pickedLocation || (storedLocation && storedLocation.label === form.birth_place)
                    ? `Saat dilimi: ${(pickedLocation ?? storedLocation)!.tz}`
                    : form.birth_place
                      ? `Kayıtlı: ${form.birth_place}`
                      : "İl, ilçe veya şehir yazıp listeden seçin."}
                </p>
              </div>
            </div>
          </div>

          {/* Ek Bilgiler */}
          <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60">
            <p className={sectionCls}>Ek Bilgiler</p>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Not</label>
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  rows={4}
                  className={`${fieldBase} resize-y leading-relaxed`}
                />
              </div>
            </div>
          </div>

          {/* Kaydet */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-8 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Güncelle"}
            </button>
          </div>
        </div>
      </div>
    </HumanDesignShell>
  );
}
