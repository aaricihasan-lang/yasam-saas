"use client";

// AŞAMA 3C — Mevcut merkezî danışanı seç (Danışan Yolculuğu). Yalnız aynı tenant; yalnız ad/soyad/
// doğum tarihi görünür. Seçilen danışanın HD profili varsa doğrudan açılır; yoksa HD'ye özgü doğum
// saati/yeri tamamlanıp profil oluşturulur (merkezî kayıt DEĞİŞMEZ). Otomatik eşleştirme yoktur.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { formatIsoDateTr, journeyAction, searchJourneyClients, type JourneyClientOption } from "@/lib/human-design/api/journeyClient";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { hdFieldBase, hdLabelCls } from "./HdClientForm";

export function HdJourneyClientPicker() {
  const router = useRouter();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<JourneyClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<JourneyClientOption | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthLoc, setBirthLoc] = useState<HdPickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchJourneyClients(query.trim()).then((r) => {
        if (my !== seq.current) return;
        setLoading(false);
        setError(r.error);
        setRows(r.rows);
      });
    }, query.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(c: JourneyClientOption) {
    if (c.hd_client_id) {
      router.push(`/human-design/danisanlar/${c.hd_client_id}`);
      return;
    }
    setSelected(c);
    setBirthDate(c.dogum ?? "");
    setBirthTime("");
    setBirthLoc(null);
  }

  async function createProfile() {
    if (!selected || saving) return;
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında danışan işlemi yapılamaz.", type: "info" });
      return;
    }
    const missing = [!birthDate && "Doğum Tarihi", !birthTime && "Doğum Saati", !birthLoc && "Doğum Yeri (listeden seçin)"].filter(Boolean);
    if (missing.length > 0) {
      showToast({ message: `Zorunlu alanlar: ${missing.join(", ")}.`, type: "warning" });
      return;
    }
    setSaving(true);
    const r = await journeyAction("create_for_existing", {
      journey_client_id: selected.id,
      birth_time: birthTime,
      birth_location_ref: birthLoc!.id,
      ...(selected.dogum ? {} : { birth_date: birthDate }),
    });
    setSaving(false);
    if (r.ok && r.hdClientId) {
      router.push(`/human-design/danisanlar/${r.hdClientId}`);
      return;
    }
    if (!r.ok && r.code === "HD_PROFILE_EXISTS" && r.hdClientId) {
      router.push(`/human-design/danisanlar/${r.hdClientId}`);
      return;
    }
    showToast({ message: r.ok ? "Human Design profili oluşturulamadı." : r.error, type: "error" });
  }

  if (selected) {
    const name = `${selected.ad} ${selected.soyad}`.trim();
    return (
      <div className="space-y-4" data-hd-picker-complete>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-indigo-500">Seçilen danışan</p>
            <p className="m-0 break-words text-sm font-bold text-slate-900">{name}</p>
          </div>
          <button type="button" onClick={() => setSelected(null)} className="text-xs font-bold text-indigo-600 hover:underline">
            Başka danışan seç
          </button>
        </div>
        <p className="text-xs text-slate-600">Human Design hesabı için doğum saati ve doğum yerini tamamlayın.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hd-pick-dogum" className={hdLabelCls}>Doğum Tarihi *</label>
            <input
              id="hd-pick-dogum"
              type="date"
              value={birthDate}
              disabled={!!selected.dogum}
              onChange={(e) => setBirthDate(e.target.value)}
              className={`h-10 ${hdFieldBase} disabled:bg-slate-50 disabled:text-slate-600`}
            />
            {selected.dogum ? <p className="mt-1 text-[11px] text-slate-500">Danışan Yolculuğu kaydından.</p> : null}
          </div>
          <div>
            <label htmlFor="hd-pick-saat" className={hdLabelCls}>Doğum Saati *</label>
            <input id="hd-pick-saat" type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} className={`h-10 ${hdFieldBase}`} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="hd-pick-birth-place" className={hdLabelCls}>Doğum Yeri *</label>
            <HdBirthLocationPicker id="hd-pick-birth-place" value={birthLoc} onChange={setBirthLoc} />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void createProfile()}
            disabled={saving}
            className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Devam Et"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-hd-journey-picker>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Danışan adı veya soyadı ara..."
        aria-label="Danışan ara"
        className={`h-10 ${hdFieldBase}`}
      />
      {error ? (
        <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>
      ) : loading && rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Yükleniyor...</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">{query.trim() ? "Eşleşen danışan bulunamadı." : "Henüz danışan yok."}</p>
      ) : (
        <ul className="m-0 max-h-80 list-none divide-y divide-indigo-50 overflow-y-auto rounded-xl border border-indigo-100 bg-white p-0">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => choose(c)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-indigo-50/60"
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-bold text-slate-900">{`${c.ad} ${c.soyad}`.trim()}</span>
                  <span className="block text-xs text-slate-500">Doğum: {formatIsoDateTr(c.dogum)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.hd_client_id ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  {c.hd_client_id ? "Human Design profili var" : "Yeni Human Design profili"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
