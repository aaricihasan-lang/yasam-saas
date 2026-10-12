"use client";

/**
 * Doğum profili formu — yeni profil (revizyon 1) veya DÜZELTME (yeni revizyon).
 * Düzeltme eski revizyonu değiştirmez; sunucu iyimser kilitle (expectedRevision) yeni satır ekler.
 * DST belirsizliğinde sunucu iki seçenek döner; uzman açıkça seçer (sessiz tahmin yok).
 */

import { useEffect, useRef, useState } from "react";
import BirthDateInput from "./BirthDateInput";
import ClientCandidateSearch, { type ClientCandidate } from "./ClientCandidateSearch";
import { TIME_ACCURACY_LABELS, TIME_ACCURACY_VALUES, type TimeAccuracy } from "@/lib/astrology/birth/profileInput";
import LocationPicker, { type PickedLocation } from "./LocationPicker";
import { astroFetch } from "../_lib/api";

export type ProfileFormInitial = {
  profileId: string;
  expectedRevision: number;
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  timeAccuracy: string;
  location: PickedLocation | null;
};

type DstOption = { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number };

function fmtOffset(sec: number): string {
  const sign = sec >= 0 ? "+" : "−";
  const a = Math.abs(sec);
  return `UTC${sign}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`;
}

export default function ProfileForm({
  mode,
  initial,
  onDone,
  onCancel,
  heading,
  onDirtyChange,
}: {
  /** Kaydedilmemiş giriş var mı (çıkış koruması; 2026-10-12). */
  onDirtyChange?: (dirty: boolean) => void;
  mode: "create" | "revise";
  /** İsteğe bağlı görünür başlık (D3.1: Hazırlık Merkezi "Yeni Danışan" / "Doğum Bilgilerini Düzenle"); veri modeli aynı. */
  heading?: string;
  initial?: ProfileFormInitial;
  onDone: (profileId: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [client, setClient] = useState<ClientCandidate | null>(null);
  const [pickClient, setPickClient] = useState(false);
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [timeKnown, setTimeKnown] = useState(initial?.timeKnown ?? true);
  const [birthTime, setBirthTime] = useState(initial?.birthTime?.slice(0, 8) ?? "");
  const [accuracy, setAccuracy] = useState<TimeAccuracy>((initial?.timeAccuracy as TimeAccuracy) ?? "exact_record");
  const [location, setLocation] = useState<PickedLocation | null>(initial?.location ?? null);
  const [note, setNote] = useState("");
  const [dstOptions, setDstOptions] = useState<DstOption[] | null>(null);
  const [dstChoice, setDstChoice] = useState<"auto" | "earlier" | "later">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    mode === "create"
      ? !!(label.trim() || client || birthDate || birthTime || location || !timeKnown)
      : birthDate !== (initial?.birthDate ?? "") ||
        timeKnown !== (initial?.timeKnown ?? true) ||
        birthTime !== (initial?.birthTime?.slice(0, 8) ?? "") ||
        accuracy !== ((initial?.timeAccuracy as TimeAccuracy) ?? "exact_record") ||
        (location?.id ?? null) !== (initial?.location?.id ?? null) ||
        note.trim() !== "";
  const onDirtyRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyRef.current = onDirtyChange;
  });
  useEffect(() => {
    onDirtyRef.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => onDirtyRef.current?.(false), []);

  async function submit() {
    setError(null);
    if (mode === "create" && !label.trim()) return setError("Profil adı gerekli.");
    if (!birthDate) return setError("Doğum tarihi gerekli (GG.AA.YYYY biçiminde eksiksiz ve geçerli olmalı).");
    if (timeKnown && !birthTime) return setError("Doğum saati gerekli (bilinmiyorsa kutuyu işaretleyin).");
    if (!location) return setError("Doğum yeri listeden seçilmelidir.");
    setBusy(true);
    const birth = {
      birthDate,
      timeKnown,
      birthTime: timeKnown ? birthTime : null,
      timeAccuracy: timeKnown ? accuracy : "unknown",
      locationId: location.id,
      dstChoice,
    };
    const res =
      mode === "create"
        ? await astroFetch<{ profile: { id: string } }>("/api/admin/astroloji/profiles", {
            method: "POST",
            body: { label: label.trim(), clientId: client?.id ?? null, ...birth },
          })
        : await astroFetch<{ profile: { id: string } }>(`/api/admin/astroloji/profiles/${initial!.profileId}/revisions`, {
            method: "POST",
            body: { expectedRevision: initial!.expectedRevision, changeNote: note.trim() || null, ...birth },
          });
    setBusy(false);
    if (res.ok) {
      onDirtyRef.current?.(false);
      onDone(res.data.profile.id);
      return;
    }
    if (res.code === "BIRTH_TIME_AMBIGUOUS" && Array.isArray(res.data?.dstOptions)) {
      setDstOptions(res.data!.dstOptions as DstOption[]);
    }
    setError(res.error);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-800">{heading ?? (mode === "create" ? "Yeni doğum profili" : "Doğum bilgisini düzelt (yeni revizyon)")}</h3>
      {mode === "revise" && (
        <p className="text-xs text-slate-500">
          Düzeltme yeni bir revizyon oluşturur; önceki revizyon ve ona bağlı sonuçlar değiştirilmez ve silinmez.
        </p>
      )}

      {mode === "create" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Profil adı</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="ör. Ali Yılmaz — natal" />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Danışan Yolculuğu eşleştirmesi (opsiyonel)</span>
            {client ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span>
                  {client.name ?? "Adsız danışan"} <span className="font-mono text-xs text-slate-500">#{client.ref}</span>
                </span>
                <button type="button" className="text-xs underline" onClick={() => setClient(null)}>
                  Kaldır
                </button>
              </div>
            ) : pickClient ? (
              <ClientCandidateSearch
                initialName={label.split(/\s[—–-]\s/)[0]?.trim() ?? ""}
                initialBirthDate={birthDate}
                currentClientId={null}
                onChoose={(c) => {
                  setClient(c);
                  setPickClient(false);
                }}
              />
            ) : (
              <button type="button" className="self-start text-xs text-sky-700 underline" onClick={() => setPickClient(true)}>
                Olası danışan kaydını ara
              </button>
            )}
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <BirthDateInput value={birthDate} onChange={setBirthDate} />
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Doğum saati (yerel)</span>
          <input
            type="time"
            step={1}
            value={birthTime}
            disabled={!timeKnown}
            onChange={(e) => {
              setBirthTime(e.target.value);
              setDstOptions(null);
              setDstChoice("auto");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={!timeKnown}
              onChange={(e) => {
                setTimeKnown(!e.target.checked);
                if (e.target.checked) setAccuracy("unknown");
                else if (accuracy === "unknown") setAccuracy("exact_record");
              }}
            />
            Doğum saati bilinmiyor
          </label>
        </div>
      </div>

      {timeKnown && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Saat doğruluğu</span>
          <select value={accuracy} onChange={(e) => setAccuracy(e.target.value as TimeAccuracy)} className="rounded-lg border border-slate-300 px-3 py-2">
            {TIME_ACCURACY_VALUES.filter((v) => v !== "unknown").map((v) => (
              <option key={v} value={v}>
                {TIME_ACCURACY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Doğum yeri</span>
        <LocationPicker value={location} onChange={(v) => { setLocation(v); setDstOptions(null); setDstChoice("auto"); }} />
      </div>

      {dstOptions && (
        <fieldset className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <legend className="px-1 font-medium text-amber-900">Yaz saati belirsizliği — hangi an?</legend>
          {dstOptions.map((o) => (
            <label key={o.choice} className="flex items-center gap-2 py-0.5">
              <input type="radio" name="dst" checked={dstChoice === o.choice} onChange={() => setDstChoice(o.choice)} />
              {o.choice === "earlier" ? "İlk yaşanan an" : "İkinci yaşanan an"} — {fmtOffset(o.offsetSeconds)} · {o.utcIso.replace("T", " ").slice(0, 19)} UTC
            </label>
          ))}
        </fieldset>
      )}

      {mode === "revise" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Değişiklik notu (opsiyonel)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="ör. Doğum belgesine göre saat düzeltildi" />
        </label>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={submit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1430] font-semibold text-white transition hover:bg-[#1a2b5c] disabled:cursor-not-allowed disabled:opacity-50 px-4 py-2 text-sm disabled:opacity-60">
          {busy ? "Kaydediliyor…" : mode === "create" ? "Danışanı Oluştur" : "Yeni revizyonu kaydet"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
          Vazgeç
        </button>
      </div>
    </div>
  );
}
