"use client";
/**
 * Danışan detay — Beslenme sekmesi (FAZ 7). Owner/super-admin-only içerik.
 * Self-fetch (clientId prop). Profil + Ölçümler + Beyan Alerjiler + Tercihler + Planlar.
 * PII tekrarı YOK; clients.kan/mizac read-only integrative badge. CRM paneli DEĞİL.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { runInEffect } from "@/lib/runInEffect";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";
import {
  getProfile, saveProfile, listMeasurements, addMeasurement, deleteMeasurement,
  getAllergens, setAllergens, getAllergenVocab, listPreferences, addPreference, deletePreference,
  listClientPlans,
  type ClientProfile, type ClientContext, type Measurement, type ClientAllergen,
  type FoodPreference, type PlanFamily, type AllergenVocab,
} from "@/lib/beslenme/clientTabClient";
import {
  GOAL_TYPES, GOAL_TYPE_LABELS, ACTIVITY_LEVELS, ACTIVITY_LEVEL_LABELS,
  MIZAC_LABELS, computeBmi,
} from "@/lib/beslenme/clientContracts";

type Props = { clientId: string; clientName?: string; tenantId?: string };

const KAN_LABEL: Record<string, string> = { "0": "0 (Sıfır)", A: "A", B: "B", AB: "AB" };
const STATUS_LABEL: Record<string, string> = { draft: "Taslak", active: "Aktif", archived: "Arşiv" };

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-emerald-100 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-emerald-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function BeslenmeTab({ clientId, clientName }: Props) {
  const [access, setAccess] = useState<"loading" | "ok" | "denied">("loading");
  const [client, setClient] = useState<ClientContext | null>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [allergens, setAllergensState] = useState<ClientAllergen[]>([]);
  const [vocab, setVocab] = useState<AllergenVocab[]>([]);
  const [prefs, setPrefs] = useState<FoodPreference[]>([]);
  const [families, setFamilies] = useState<PlanFamily[]>([]);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setBanner({ kind, text });
    setTimeout(() => setBanner(null), 3500);
  }, []);

  const reloadAll = useCallback(async () => {
    const [p, m, a, v, pr, pl] = await Promise.all([
      getProfile(clientId), listMeasurements(clientId), getAllergens(clientId),
      getAllergenVocab(), listPreferences(clientId), listClientPlans(clientId),
    ]);
    if (p.ok && p.data) { setProfile(p.data.profile); setClient(p.data.client); }
    if (m.ok && m.data) setMeasurements(m.data.measurements);
    if (a.ok && a.data) setAllergensState(a.data.allergens);
    if (v.ok && v.data) setVocab(v.data.allergens);
    if (pr.ok && pr.data) setPrefs(pr.data.preferences);
    if (pl.ok && pl.data) setFamilies(pl.data.families);
  }, [clientId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ok = await checkBeslenmeAccess().catch(() => false);
      if (!alive) return;
      if (!ok) { setAccess("denied"); return; }
      setAccess("ok");
      await reloadAll();
    })();
    return () => { alive = false; };
  }, [reloadAll]);

  if (access === "loading") return <p className="p-4 text-sm text-slate-400">Yükleniyor…</p>;
  if (access === "denied") return <p className="p-4 text-sm text-slate-500">Bu bölüm yalnız sistem sahibine açıktır.</p>;

  const name = client?.display_name || clientName || "Danışan";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-600">Beslenme</p>
            <h2 className="text-lg font-bold text-emerald-900">{name}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {client?.kan && <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-emerald-200">Kan Grubu: {KAN_LABEL[client.kan] ?? client.kan}</span>}
            {client?.mizac && <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-emerald-200">Mizaç: {MIZAC_LABELS[client.mizac] ?? client.mizac}</span>}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Kan grubu / mizaç bütüncül bağlamdır; besin bilimsel değerlerinden ayrıdır ve otomatik öneri üretmez.</p>
      </div>

      {banner && (
        <div className={`rounded-lg px-3 py-2 text-sm ${banner.kind === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{banner.text}</div>
      )}

      <ProfileSection clientId={clientId} profile={profile} onSaved={(p) => { setProfile(p); flash("ok", "Profil kaydedildi."); }} onErr={(t) => flash("err", t)} />
      <MeasurementsSection clientId={clientId} rows={measurements} onChange={async () => { const m = await listMeasurements(clientId); if (m.ok && m.data) setMeasurements(m.data.measurements); }} onMsg={flash} />
      <AllergensSection clientId={clientId} vocab={vocab} current={allergens} onSaved={async () => { const a = await getAllergens(clientId); if (a.ok && a.data) setAllergensState(a.data.allergens); flash("ok", "Alerjiler güncellendi."); }} onErr={(t) => flash("err", t)} />
      <PreferencesSection clientId={clientId} rows={prefs} onChange={async () => { const pr = await listPreferences(clientId); if (pr.ok && pr.data) setPrefs(pr.data.preferences); }} onMsg={flash} />
      <PlansSection clientId={clientId} clientName={name} families={families} />
    </div>
  );
}

// ── Profil ──
function ProfileSection({ clientId, profile, onSaved, onErr }: { clientId: string; profile: ClientProfile | null; onSaved: (p: ClientProfile) => void; onErr: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ClientProfile>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { runInEffect(() => setForm(profile ?? {})); }, [profile, editing]);

  const num = (v: number | null | undefined) => (v == null ? "" : String(v));
  const save = async () => {
    setSaving(true);
    const body: Record<string, unknown> = {
      goal_type: form.goal_type || null,
      goal_note: form.goal_note || null,
      activity_level: form.activity_level || null,
      dietary_pattern: form.dietary_pattern || null,
      daily_meal_count: form.daily_meal_count ?? null,
      target_weight_kg: form.target_weight_kg ?? null,
      water_note: form.water_note || null,
      lifestyle_note: form.lifestyle_note || null,
      general_note: form.general_note || null,
    };
    const r = await saveProfile(clientId, body as Partial<ClientProfile>);
    setSaving(false);
    if (r.ok && r.data) { onSaved(r.data.profile); setEditing(false); }
    else onErr("Profil kaydedilemedi" + (r.code ? ` (${r.code})` : ""));
  };

  return (
    <Section title="Beslenme Profili" action={!editing && <button className="text-sm text-emerald-700 hover:underline" onClick={() => setEditing(true)}>Düzenle</button>}>
      {!editing ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="Hedef" value={profile?.goal_type ? GOAL_TYPE_LABELS[profile.goal_type as keyof typeof GOAL_TYPE_LABELS] : "—"} />
          <Field label="Aktivite" value={profile?.activity_level ? ACTIVITY_LEVEL_LABELS[profile.activity_level as keyof typeof ACTIVITY_LEVEL_LABELS] : "—"} />
          <Field label="Beslenme Düzeni" value={profile?.dietary_pattern || "—"} />
          <Field label="Öğün Sayısı" value={num(profile?.daily_meal_count) || "—"} />
          <Field label="Hedef Kilo" value={profile?.target_weight_kg != null ? `${profile.target_weight_kg} kg` : "—"} />
          <Field label="Su Notu" value={profile?.water_note || "—"} />
          <Field label="Yaşam Tarzı" value={profile?.lifestyle_note || "—"} full />
          <Field label="Genel Not" value={profile?.general_note || "—"} full />
        </dl>
      ) : (
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Select label="Hedef" value={form.goal_type ?? ""} onChange={(v) => setForm({ ...form, goal_type: v || null })} options={GOAL_TYPES.map((g) => [g, GOAL_TYPE_LABELS[g]])} />
          <Select label="Aktivite" value={form.activity_level ?? ""} onChange={(v) => setForm({ ...form, activity_level: v || null })} options={ACTIVITY_LEVELS.map((a) => [a, ACTIVITY_LEVEL_LABELS[a]])} />
          <Text label="Beslenme Düzeni" value={form.dietary_pattern ?? ""} onChange={(v) => setForm({ ...form, dietary_pattern: v || null })} />
          <NumberInput label="Öğün Sayısı (1-12)" value={num(form.daily_meal_count)} onChange={(v) => setForm({ ...form, daily_meal_count: v === "" ? null : Number(v) })} />
          <NumberInput label="Hedef Kilo (20-500)" value={num(form.target_weight_kg)} onChange={(v) => setForm({ ...form, target_weight_kg: v === "" ? null : Number(v) })} />
          <Text label="Su Notu" value={form.water_note ?? ""} onChange={(v) => setForm({ ...form, water_note: v || null })} />
          <Textarea label="Yaşam Tarzı Notu" value={form.lifestyle_note ?? ""} onChange={(v) => setForm({ ...form, lifestyle_note: v || null })} />
          <Textarea label="Genel Not" value={form.general_note ?? ""} onChange={(v) => setForm({ ...form, general_note: v || null })} />
          <div className="col-span-full flex gap-2">
            <button disabled={saving} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Kaydet</button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Vazgeç</button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Ölçümler ──
function MeasurementsSection({ clientId, rows, onChange, onMsg }: { clientId: string; rows: Measurement[]; onChange: () => void; onMsg: (k: "ok" | "err", t: string) => void }) {
  const [w, setW] = useState(""); const [h, setH] = useState(""); const [waist, setWaist] = useState(""); const [hip, setHip] = useState(""); const [note, setNote] = useState("");
  const add = async () => {
    if (!w.trim()) { onMsg("err", "Kilo gerekli."); return; }
    const r = await addMeasurement(clientId, { weight_kg: Number(w), height_cm: h ? Number(h) : null, waist_cm: waist ? Number(waist) : null, hip_cm: hip ? Number(hip) : null, note: note || null });
    if (r.ok) { setW(""); setH(""); setWaist(""); setHip(""); setNote(""); onMsg("ok", "Ölçüm eklendi."); onChange(); }
    else onMsg("err", "Ölçüm eklenemedi" + (r.code ? ` (${r.code})` : ""));
  };
  const del = async (id: string) => { const r = await deleteMeasurement(clientId, id); if (r.ok) { onMsg("ok", "Ölçüm silindi."); onChange(); } };
  return (
    <Section title="Son Ölçümler">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">Tarih</th><th className="pr-3">Kilo</th><th className="pr-3">Boy</th><th className="pr-3">Bel</th><th className="pr-3">Kalça</th><th className="pr-3">BMI</th><th className="pr-3">Not</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-2 text-slate-400">Ölçüm yok.</td></tr>}
            {rows.map((m) => {
              const bmi = computeBmi(m.weight_kg, m.height_cm);
              return (
                <tr key={m.id} className="border-t border-emerald-50">
                  <td className="py-1 pr-3 text-slate-600">{new Date(m.measured_at).toLocaleDateString("tr-TR")}</td>
                  <td className="pr-3">{m.weight_kg} kg</td>
                  <td className="pr-3">{m.height_cm ?? "—"}</td>
                  <td className="pr-3">{m.waist_cm ?? "—"}</td>
                  <td className="pr-3">{m.hip_cm ?? "—"}</td>
                  <td className="pr-3">{bmi ?? "—"}</td>
                  <td className="pr-3 text-slate-500">{m.note ?? ""}</td>
                  <td><button onClick={() => del(m.id)} className="text-xs text-red-500 hover:underline">Sil</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input value={w} onChange={(e) => setW(e.target.value)} placeholder="Kilo*" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={h} onChange={(e) => setH(e.target.value)} placeholder="Boy" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="Bel" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={hip} onChange={(e) => setHip(e.target.value)} placeholder="Kalça" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <button onClick={add} className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">Ekle</button>
      </div>
    </Section>
  );
}

// ── Alerjiler ──
function AllergensSection({ clientId, vocab, current, onSaved, onErr }: { clientId: string; vocab: AllergenVocab[]; current: ClientAllergen[]; onSaved: () => void; onErr: (t: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { runInEffect(() => setSel(new Set(current.map((a) => a.allergen_id)))); }, [current]);
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const save = async () => {
    const r = await setAllergens(clientId, [...sel].map((id) => ({ allergen_id: id })));
    if (r.ok) onSaved(); else onErr("Alerjiler kaydedilemedi" + (r.code ? ` (${r.code})` : ""));
  };
  return (
    <Section title="Beyan Edilen Alerjiler" action={<button onClick={save} className="text-sm text-emerald-700 hover:underline">Kaydet</button>}>
      <p className="mb-2 text-[11px] text-amber-700">Bu bilgiler danışanın beyanına dayanır. Besinlerle otomatik alerjen eşlemesi yapılmaz.</p>
      <div className="flex flex-wrap gap-2">
        {vocab.length === 0 && <span className="text-sm text-slate-400">Alerjen listesi yükleniyor…</span>}
        {vocab.map((a) => (
          <button key={a.id} onClick={() => toggle(a.id)} className={`rounded-full px-3 py-1 text-sm ring-1 ${sel.has(a.id) ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-600 ring-emerald-200"}`}>
            {a.name_tr || a.code}{a.is_major ? " ★" : ""}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── Tercihler ──
function PreferencesSection({ clientId, rows, onChange, onMsg }: { clientId: string; rows: FoodPreference[]; onChange: () => void; onMsg: (k: "ok" | "err", t: string) => void }) {
  const [stance, setStance] = useState<"preferred" | "avoided">("preferred");
  const [label, setLabel] = useState(""); const [note, setNote] = useState("");
  const add = async () => {
    if (!label.trim()) { onMsg("err", "Besin adı gerekli."); return; }
    const r = await addPreference(clientId, { stance, food_label: label.trim(), note: note || null });
    if (r.ok) { setLabel(""); setNote(""); onMsg("ok", "Eklendi."); onChange(); } else onMsg("err", "Eklenemedi" + (r.code ? ` (${r.code})` : ""));
  };
  const del = async (id: string) => { const r = await deletePreference(clientId, id); if (r.ok) { onChange(); } };
  const group = (s: "preferred" | "avoided") => rows.filter((r) => r.stance === s);
  return (
    <Section title="Tercih Edilen / Kaçınılan Besinler">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["preferred", "avoided"] as const).map((s) => (
          <div key={s}>
            <h4 className="mb-1 text-sm font-semibold text-slate-700">{s === "preferred" ? "Tercih Edilenler" : "Kaçınılanlar"}</h4>
            <ul className="space-y-1">
              {group(s).length === 0 && <li className="text-sm text-slate-400">—</li>}
              {group(s).map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded bg-emerald-50/50 px-2 py-1 text-sm">
                  <span>{p.food_label}{p.note ? <span className="text-slate-400"> · {p.note}</span> : null}</span>
                  <button onClick={() => del(p.id)} className="text-xs text-red-500 hover:underline">sil</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select value={stance} onChange={(e) => setStance(e.target.value as "preferred" | "avoided")} className="rounded border border-emerald-200 px-2 py-1 text-sm">
          <option value="preferred">Tercih</option><option value="avoided">Kaçınılan</option>
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Besin adı*" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not" className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <button onClick={add} className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">Ekle</button>
      </div>
    </Section>
  );
}

// ── Planlar ──
function PlansSection({ clientId, clientName, families }: { clientId: string; clientName: string; families: PlanFamily[] }) {
  const newHref = `/beslenme/planlar?newForClient=${encodeURIComponent(clientId)}&clientName=${encodeURIComponent(clientName)}`;
  return (
    <Section title="Beslenme Planları" action={<Link href={newHref} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Yeni Beslenme Planı</Link>}>
      {families.length === 0 ? (
        <p className="text-sm text-slate-400">Bu danışana bağlı plan yok.</p>
      ) : (
        <ul className="space-y-2">
          {families.map((f) => (
            <li key={f.plan_family_id} className="rounded-lg border border-emerald-100 p-3">
              {f.latest && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Link href={`/beslenme/planlar/${f.latest.id}`} className="font-semibold text-emerald-800 hover:underline">{f.latest.title}</Link>
                    <span className="ml-2 text-xs text-slate-500">V{f.latest.revision_number} · {STATUS_LABEL[f.latest.status] ?? f.latest.status} · {f.latest.start_date} → {f.latest.end_date}</span>
                  </div>
                </div>
              )}
              {f.revisions.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  {f.revisions.map((r) => (
                    <Link key={r.id} href={`/beslenme/planlar/${r.id}`} className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200">V{r.revision_number} · {STATUS_LABEL[r.status] ?? r.status}</Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Küçük form yardımcıları ──
function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={full ? "sm:col-span-2" : ""}><dt className="text-xs text-slate-400">{label}</dt><dd className="text-slate-700">{value}</dd></div>;
}
function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-emerald-200 px-2 py-1" /></label>;
}
function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="rounded border border-emerald-200 px-2 py-1" /></label>;
}
function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">{label}</span><input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-emerald-200 px-2 py-1" /></label>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<readonly [string, string]> }) {
  return (
    <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-emerald-200 px-2 py-1">
        <option value="">—</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
