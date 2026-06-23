"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  HUMAN_DESIGN_TYPES,
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_PROFILES,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_GATES,
} from "@/lib/human-design/constants";
import { listHdClients, type HdClientRow } from "../../danisanlar/helpers/hdClients";
import { loadClientChart, saveClientChart } from "../helpers/hdCharts";
import { GateTechnicalInfo } from "../../components/GateTechnicalInfo";
import { GateKnowledgeNotes } from "../../components/GateKnowledgeNotes";
import { loadKnowledgeForCodes, type KnowledgeGroup } from "../../rapor-olustur/helpers/hdRapor";

function buildCodes(f: typeof emptyForm): string[] {
  const codes: string[] = [];
  if (f.type_code) codes.push(`tip_${f.type_code}`);
  if (f.authority_code) codes.push(`otorite_${f.authority_code}`);
  if (f.profile_code) codes.push(`profil_${f.profile_code}`);
  if (f.definition_code) codes.push(`tanim_${f.definition_code}`);
  for (const c of f.active_centers) codes.push(`merkez_tanimli_${c}`);
  for (const c of f.open_centers) codes.push(`merkez_acik_${c}`);
  for (const ch of f.channels) codes.push(`kanal_${ch.replace(/-/g, "_")}`);
  for (const g of f.gates) codes.push(`kapi_${g}`);
  return [...new Set(codes)];
}

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

const emptyForm = {
  type_code: "",
  authority_code: "",
  profile_code: "",
  definition_code: "",
  active_centers: [] as string[],
  open_centers: [] as string[],
  gates: [] as number[],
  channels: [] as string[],
  notes: "",
};

export function HdHaritaKaydiContent() {
  const { showToast } = useToast();
  const params = useSearchParams();
  const urlClientId = params.get("clientId") ?? "";

  const [clients, setClients] = useState<HdClientRow[]>([]);
  const [clientId, setClientId] = useState(urlClientId);
  const [form, setForm] = useState(emptyForm);
  const [loadingChart, setLoadingChart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [knowledgeGroups, setKnowledgeGroups] = useState<KnowledgeGroup[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Danışan listesini yükle
  useEffect(() => {
    listHdClients().then(({ rows }) => setClients(rows));
  }, []);

  // Form değişince bilgi bankasını debounce ile yükle
  useEffect(() => {
    const codes = buildCodes(form);
    if (codes.length === 0) {
      setKnowledgeGroups([]);
      setLoadingNotes(false);
      return;
    }
    setLoadingNotes(true);
    const timer = setTimeout(async () => {
      const { groups } = await loadKnowledgeForCodes(codes);
      setKnowledgeGroups(groups);
      setLoadingNotes(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [form]);

  // Seçili danışanın mevcut haritasını yükle
  const loadChart = useCallback(async (id: string) => {
    if (!id) { setForm(emptyForm); return; }
    setLoadingChart(true);
    const { row, error } = await loadClientChart(id);
    setLoadingChart(false);
    if (error) { showToast({ message: `Harita yüklenemedi: ${error}`, type: "error" }); return; }
    if (!row) { setForm(emptyForm); return; }
    setForm({
      type_code: row.type_code ?? "",
      authority_code: row.authority_code ?? "",
      profile_code: row.profile_code ?? "",
      definition_code: row.definition_code ?? "",
      active_centers: row.active_centers ?? [],
      open_centers: row.open_centers ?? [],
      gates: row.gates ?? [],
      channels: row.channels ?? [],
      notes: row.notes ?? "",
    });
  }, [showToast]);

  useEffect(() => { loadChart(clientId); }, [clientId, loadChart]);

  // Merkez toggle — iki listeden biri seçilebilir, diğerinden çıkarır
  function toggleCenter(code: string, as: "active" | "open") {
    setForm((p) => {
      if (as === "active") {
        const inActive = p.active_centers.includes(code);
        return {
          ...p,
          open_centers: p.open_centers.filter((c) => c !== code),
          active_centers: inActive
            ? p.active_centers.filter((c) => c !== code)
            : [...p.active_centers, code],
        };
      }
      const inOpen = p.open_centers.includes(code);
      return {
        ...p,
        active_centers: p.active_centers.filter((c) => c !== code),
        open_centers: inOpen
          ? p.open_centers.filter((c) => c !== code)
          : [...p.open_centers, code],
      };
    });
  }

  function toggleGate(gate: number) {
    setForm((p) => ({
      ...p,
      gates: p.gates.includes(gate)
        ? p.gates.filter((g) => g !== gate)
        : [...p.gates, gate].sort((a, b) => a - b),
    }));
  }

  function toggleChannel(code: string) {
    setForm((p) => ({
      ...p,
      channels: p.channels.includes(code)
        ? p.channels.filter((c) => c !== code)
        : [...p.channels, code],
    }));
  }

  async function handleSave() {
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında harita kaydı yapılamaz.", type: "info" });
      return;
    }
    if (!clientId) {
      showToast({ message: "Danışan seçin.", type: "warning" });
      return;
    }
    setSaving(true);
    const { error } = await saveClientChart(clientId, {
      type_code: form.type_code || null,
      authority_code: form.authority_code || null,
      profile_code: form.profile_code || null,
      definition_code: form.definition_code || null,
      active_centers: form.active_centers,
      open_centers: form.open_centers,
      gates: form.gates,
      channels: form.channels,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      showToast({ message: `Hata: ${error}`, type: "error" });
    } else {
      showToast({ message: "Harita kaydedildi.", type: "success" });
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
      {/* Danışan Seçimi */}
      <div className="border-b border-indigo-100/80 bg-white/75 p-4">
        <label className={labelCls}>Danışan Seç *</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={`h-10 ${fieldBase}`}
        >
          <option value="">— Danışan seçin —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.birth_date ? ` · ${c.birth_date}` : ""}
              {c.birth_place ? ` · ${c.birth_place}` : ""}
            </option>
          ))}
        </select>
        {selectedClient && (
          <p className="mt-1.5 text-xs text-slate-500">
            {loadingChart
              ? "Mevcut harita yükleniyor..."
              : "Mevcut harita kaydı varsa otomatik yüklendi."}
          </p>
        )}
      </div>

      {/* Form Alanları */}
      <div className="bg-gradient-to-b from-white/95 to-indigo-50/25 p-4">
        <div className="space-y-7">

          {/* Tip, Otorite, Profil, Tanım */}
          <section>
            <p className={sectionCls}>Temel Değerler</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Tip</label>
                <select
                  value={form.type_code}
                  onChange={(e) => setForm((p) => ({ ...p, type_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Otorite</label>
                <select
                  value={form.authority_code}
                  onChange={(e) => setForm((p) => ({ ...p, authority_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_AUTHORITIES.map((a) => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Profil</label>
                <select
                  value={form.profile_code}
                  onChange={(e) => setForm((p) => ({ ...p, profile_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_PROFILES.map((pr) => (
                    <option key={pr.code} value={pr.code}>{pr.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tanım</label>
                <select
                  value={form.definition_code}
                  onChange={(e) => setForm((p) => ({ ...p, definition_code: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                >
                  <option value="">— Seçin —</option>
                  {HUMAN_DESIGN_DEFINITIONS.map((d) => (
                    <option key={d.code} value={d.code}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Merkezler */}
          <section>
            <p className={sectionCls}>Merkezler</p>
            <p className="mb-2 text-xs text-slate-500">
              Her merkez için Tanımlı veya Açık seçin. Aynı anda ikisi birden seçilemez.
            </p>
            <div className="overflow-x-auto rounded-xl border border-indigo-100/80">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-indigo-50/80">
                    <th className="px-4 py-2 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                      Merkez
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-indigo-700">
                      Tanımlı
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-slate-500">
                      Açık
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50/80">
                  {HUMAN_DESIGN_CENTERS.map((center) => {
                    const isActive = form.active_centers.includes(center.code);
                    const isOpen = form.open_centers.includes(center.code);
                    return (
                      <tr key={center.code} className="bg-white hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">
                          {center.label}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleCenter(center.code, "active")}
                            className={`h-7 w-20 rounded-lg border text-xs font-bold transition-all ${
                              isActive
                                ? "border-transparent bg-indigo-600 text-white shadow-sm"
                                : "border-indigo-200 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-700"
                            }`}
                          >
                            {isActive ? "✓ Tanımlı" : "Tanımlı"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleCenter(center.code, "open")}
                            className={`h-7 w-16 rounded-lg border text-xs font-bold transition-all ${
                              isOpen
                                ? "border-transparent bg-slate-500 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600"
                            }`}
                          >
                            {isOpen ? "✓ Açık" : "Açık"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(form.active_centers.length > 0 || form.open_centers.length > 0) && (
              <p className="mt-2 text-xs text-slate-500">
                {form.active_centers.length > 0 && `Tanımlı: ${form.active_centers.length}`}
                {form.active_centers.length > 0 && form.open_centers.length > 0 && " · "}
                {form.open_centers.length > 0 && `Açık: ${form.open_centers.length}`}
              </p>
            )}
          </section>

          {/* Kanallar */}
          <section>
            <p className={sectionCls}>Kanallar</p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-indigo-200/80 bg-white/70 p-3">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {HUMAN_DESIGN_CHANNELS.map((ch) => {
                  const sel = form.channels.includes(ch.code);
                  return (
                    <label
                      key={ch.code}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        sel ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleChannel(ch.code)}
                        className="h-3.5 w-3.5 rounded border-indigo-300 accent-indigo-600"
                      />
                      {ch.label}
                    </label>
                  );
                })}
              </div>
            </div>
            {form.channels.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {form.channels.length} kanal seçildi
              </p>
            )}
          </section>

          {/* Kapılar */}
          <section>
            <p className={sectionCls}>Kapılar</p>
            <div className="rounded-xl border border-indigo-200/80 bg-white/70 p-3">
              <div className="grid grid-cols-8 gap-1.5">
                {HUMAN_DESIGN_GATES.map((gate) => {
                  const sel = form.gates.includes(gate.code);
                  return (
                    <button
                      key={gate.code}
                      type="button"
                      title={gate.label}
                      onClick={() => toggleGate(gate.code)}
                      className={`flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold transition-all ${
                        sel
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-800"
                      }`}
                    >
                      {gate.code}
                    </button>
                  );
                })}
              </div>
              {form.gates.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Seçili kapılar: {form.gates.join(", ")}
                </p>
              )}
            </div>
          </section>

          {/* Kapı Teknik Bilgileri + Bilgi Bankası Yorumları */}
          {clientId && (
            <section>
              <p className={sectionCls}>Kapı Teknik Bilgileri</p>
              {form.gates.length > 0 || form.channels.length > 0 ? (
                <GateTechnicalInfo gates={form.gates} channels={form.channels} />
              ) : (
                <p className="text-xs text-slate-400">Henüz kapı ya da kanal seçilmedi.</p>
              )}
              <GateKnowledgeNotes groups={knowledgeGroups} loading={loadingNotes} />
            </section>
          )}

          {/* Notlar */}
          <section>
            <p className={sectionCls}>Notlar</p>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Harita ile ilgili uzman notları..."
              rows={4}
              className={`${fieldBase} resize-y leading-relaxed`}
            />
          </section>

          {/* Aksiyon */}
          <div className="flex items-center justify-end gap-3 border-t border-indigo-100/80 pt-4">
            <button
              type="button"
              onClick={() => loadChart(clientId)}
              disabled={!clientId || loadingChart}
              className="h-9 rounded-xl border border-indigo-200/90 bg-white px-5 text-sm font-black uppercase tracking-wide text-indigo-900 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Yenile
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !clientId}
              className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
