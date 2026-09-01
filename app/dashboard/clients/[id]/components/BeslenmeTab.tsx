"use client";
/**
 * Danışan detay — Beslenme sekmesi (FAZ 7). Owner/super-admin-only içerik.
 * Self-fetch (clientId prop). Profil + Ölçümler + Beyan Alerjiler + Tercihler + Planlar.
 * PII tekrarı YOK; clients.kan/mizac read-only integrative badge. CRM paneli DEĞİL.
 * i18n: beslenme.detail namespace (EN/TR). DB kodları (goal_type/activity/kan/mizac/
 * stance/status) canonical'dır; YALNIZ display çevrilir.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { runInEffect } from "@/lib/runInEffect";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";
import {
  getProfile, saveProfile, listMeasurements, addMeasurement, deleteMeasurement,
  getAllergens, setAllergens, getAllergenVocab, listPreferences, addPreference, deletePreference,
  listClientPlans,
  type ClientProfile, type ClientContext, type Measurement, type ClientAllergen,
  type FoodPreference, type PlanFamily, type AllergenVocab,
} from "@/lib/beslenme/clientTabClient";
import { GOAL_TYPES, ACTIVITY_LEVELS, computeBmi } from "@/lib/beslenme/clientContracts";

type Props = { clientId: string; clientName?: string; tenantId?: string };
type Tf = ReturnType<typeof useTranslations>;

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
  const t = useTranslations("beslenme.detail");
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

  if (access === "loading") return <p className="p-4 text-sm text-slate-400">{t("loading")}</p>;
  if (access === "denied") return <p className="p-4 text-sm text-slate-500">{t("denied")}</p>;

  const name = client?.display_name || clientName || t("clientFallback");
  const kanText = client?.kan ? (t.has(`kan.${client.kan}`) ? t(`kan.${client.kan}`) : client.kan) : null;
  const mizacText = client?.mizac ? (t.has(`mizac.${client.mizac}`) ? t(`mizac.${client.mizac}`) : client.mizac) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-600">{t("eyebrow")}</p>
            <h2 className="text-lg font-bold text-emerald-900">{name}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {kanText && <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-emerald-200">{t("bloodLabel")}: {kanText}</span>}
            {mizacText && <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-emerald-200">{t("temperamentLabel")}: {mizacText}</span>}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t("integrativeNote")}</p>
      </div>

      {banner && (
        <div className={`rounded-lg px-3 py-2 text-sm ${banner.kind === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{banner.text}</div>
      )}

      <ProfileSection t={t} clientId={clientId} profile={profile} onSaved={(p) => { setProfile(p); flash("ok", t("banner.profileSaved")); }} onErr={(text) => flash("err", text)} />
      <MeasurementsSection t={t} clientId={clientId} rows={measurements} onChange={async () => { const m = await listMeasurements(clientId); if (m.ok && m.data) setMeasurements(m.data.measurements); }} onMsg={flash} />
      <AllergensSection t={t} clientId={clientId} vocab={vocab} current={allergens} onSaved={async () => { const a = await getAllergens(clientId); if (a.ok && a.data) setAllergensState(a.data.allergens); flash("ok", t("banner.allergensUpdated")); }} onErr={(text) => flash("err", text)} />
      <PreferencesSection t={t} clientId={clientId} rows={prefs} onChange={async () => { const pr = await listPreferences(clientId); if (pr.ok && pr.data) setPrefs(pr.data.preferences); }} onMsg={flash} />
      <PlansSection t={t} clientId={clientId} clientName={name} families={families} />
    </div>
  );
}

// ── Profil ──
function ProfileSection({ t, clientId, profile, onSaved, onErr }: { t: Tf; clientId: string; profile: ClientProfile | null; onSaved: (p: ClientProfile) => void; onErr: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ClientProfile>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { runInEffect(() => setForm(profile ?? {})); }, [profile, editing]);

  const num = (v: number | null | undefined) => (v == null ? "" : String(v));
  const goalLabel = (g: string) => (t.has(`goalType.${g}`) ? t(`goalType.${g}`) : g);
  const activityLabel = (a: string) => (t.has(`activity.${a}`) ? t(`activity.${a}`) : a);
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
    else onErr(t("banner.profileSaveFailed") + (r.code ? ` (${r.code})` : ""));
  };

  return (
    <Section title={t("profile.title")} action={!editing && <button className="text-sm text-emerald-700 hover:underline" onClick={() => setEditing(true)}>{t("profile.edit")}</button>}>
      {!editing ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label={t("profile.goal")} value={profile?.goal_type ? goalLabel(profile.goal_type) : "—"} />
          <Field label={t("profile.activity")} value={profile?.activity_level ? activityLabel(profile.activity_level) : "—"} />
          <Field label={t("profile.dietaryPattern")} value={profile?.dietary_pattern || "—"} />
          <Field label={t("profile.mealCount")} value={num(profile?.daily_meal_count) || "—"} />
          <Field label={t("profile.targetWeight")} value={profile?.target_weight_kg != null ? t("profile.targetWeightValue", { kg: profile.target_weight_kg }) : "—"} />
          <Field label={t("profile.waterNote")} value={profile?.water_note || "—"} />
          <Field label={t("profile.lifestyle")} value={profile?.lifestyle_note || "—"} full />
          <Field label={t("profile.generalNote")} value={profile?.general_note || "—"} full />
        </dl>
      ) : (
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Select label={t("profile.goal")} value={form.goal_type ?? ""} onChange={(v) => setForm({ ...form, goal_type: v || null })} options={GOAL_TYPES.map((g) => [g, goalLabel(g)])} />
          <Select label={t("profile.activity")} value={form.activity_level ?? ""} onChange={(v) => setForm({ ...form, activity_level: v || null })} options={ACTIVITY_LEVELS.map((a) => [a, activityLabel(a)])} />
          <Text label={t("profile.dietaryPattern")} value={form.dietary_pattern ?? ""} onChange={(v) => setForm({ ...form, dietary_pattern: v || null })} />
          <NumberInput label={t("profile.mealCountEdit")} value={num(form.daily_meal_count)} onChange={(v) => setForm({ ...form, daily_meal_count: v === "" ? null : Number(v) })} />
          <NumberInput label={t("profile.targetWeightEdit")} value={num(form.target_weight_kg)} onChange={(v) => setForm({ ...form, target_weight_kg: v === "" ? null : Number(v) })} />
          <Text label={t("profile.waterNote")} value={form.water_note ?? ""} onChange={(v) => setForm({ ...form, water_note: v || null })} />
          <Textarea label={t("profile.lifestyleEdit")} value={form.lifestyle_note ?? ""} onChange={(v) => setForm({ ...form, lifestyle_note: v || null })} />
          <Textarea label={t("profile.generalNote")} value={form.general_note ?? ""} onChange={(v) => setForm({ ...form, general_note: v || null })} />
          <div className="col-span-full flex gap-2">
            <button disabled={saving} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("profile.save")}</button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{t("profile.cancel")}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Ölçümler ──
function MeasurementsSection({ t, clientId, rows, onChange, onMsg }: { t: Tf; clientId: string; rows: Measurement[]; onChange: () => void; onMsg: (k: "ok" | "err", text: string) => void }) {
  const locale = useLocale();
  const [w, setW] = useState(""); const [h, setH] = useState(""); const [waist, setWaist] = useState(""); const [hip, setHip] = useState(""); const [note, setNote] = useState("");
  const add = async () => {
    if (!w.trim()) { onMsg("err", t("banner.weightRequired")); return; }
    const r = await addMeasurement(clientId, { weight_kg: Number(w), height_cm: h ? Number(h) : null, waist_cm: waist ? Number(waist) : null, hip_cm: hip ? Number(hip) : null, note: note || null });
    if (r.ok) { setW(""); setH(""); setWaist(""); setHip(""); setNote(""); onMsg("ok", t("banner.measurementAdded")); onChange(); }
    else onMsg("err", t("banner.measurementAddFailed") + (r.code ? ` (${r.code})` : ""));
  };
  const del = async (id: string) => { const r = await deleteMeasurement(clientId, id); if (r.ok) { onMsg("ok", t("banner.measurementDeleted")); onChange(); } };
  return (
    <Section title={t("measurements.title")}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">{t("measurements.date")}</th><th className="pr-3">{t("measurements.weight")}</th><th className="pr-3">{t("measurements.height")}</th><th className="pr-3">{t("measurements.waist")}</th><th className="pr-3">{t("measurements.hip")}</th><th className="pr-3">{t("measurements.bmi")}</th><th className="pr-3">{t("measurements.note")}</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-2 text-slate-400">{t("measurements.empty")}</td></tr>}
            {rows.map((m) => {
              const bmi = computeBmi(m.weight_kg, m.height_cm);
              return (
                <tr key={m.id} className="border-t border-emerald-50">
                  <td className="py-1 pr-3 text-slate-600">{new Date(m.measured_at).toLocaleDateString(locale === "en" ? "en-GB" : "tr-TR")}</td>
                  <td className="pr-3">{t("measurements.weightValue", { kg: m.weight_kg })}</td>
                  <td className="pr-3">{m.height_cm ?? "—"}</td>
                  <td className="pr-3">{m.waist_cm ?? "—"}</td>
                  <td className="pr-3">{m.hip_cm ?? "—"}</td>
                  <td className="pr-3">{bmi ?? "—"}</td>
                  <td className="pr-3 text-slate-500">{m.note ?? ""}</td>
                  <td><button onClick={() => del(m.id)} className="text-xs text-red-500 hover:underline">{t("measurements.delete")}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input value={w} onChange={(e) => setW(e.target.value)} placeholder={t("measurements.phWeight")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={h} onChange={(e) => setH(e.target.value)} placeholder={t("measurements.phHeight")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={waist} onChange={(e) => setWaist(e.target.value)} placeholder={t("measurements.phWaist")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={hip} onChange={(e) => setHip(e.target.value)} placeholder={t("measurements.phHip")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("measurements.phNote")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <button onClick={add} className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">{t("measurements.add")}</button>
      </div>
    </Section>
  );
}

// ── Alerjiler ──
function AllergensSection({ t, clientId, vocab, current, onSaved, onErr }: { t: Tf; clientId: string; vocab: AllergenVocab[]; current: ClientAllergen[]; onSaved: () => void; onErr: (text: string) => void }) {
  const locale = useLocale();
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { runInEffect(() => setSel(new Set(current.map((a) => a.allergen_id)))); }, [current]);
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const save = async () => {
    const r = await setAllergens(clientId, [...sel].map((id) => ({ allergen_id: id })));
    if (r.ok) onSaved(); else onErr(t("banner.allergensSaveFailed") + (r.code ? ` (${r.code})` : ""));
  };
  const allergenName = (a: AllergenVocab) => (locale === "en" ? a.name_en || a.name_tr || a.code : a.name_tr || a.code);
  return (
    <Section title={t("allergens.title")} action={<button onClick={save} className="text-sm text-emerald-700 hover:underline">{t("allergens.save")}</button>}>
      <p className="mb-2 text-[11px] text-amber-700">{t("allergens.advisory")}</p>
      <div className="flex flex-wrap gap-2">
        {vocab.length === 0 && <span className="text-sm text-slate-400">{t("allergens.loadingVocab")}</span>}
        {vocab.map((a) => (
          <button key={a.id} onClick={() => toggle(a.id)} className={`rounded-full px-3 py-1 text-sm ring-1 ${sel.has(a.id) ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-600 ring-emerald-200"}`}>
            {allergenName(a)}{a.is_major ? " ★" : ""}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── Tercihler ──
function PreferencesSection({ t, clientId, rows, onChange, onMsg }: { t: Tf; clientId: string; rows: FoodPreference[]; onChange: () => void; onMsg: (k: "ok" | "err", text: string) => void }) {
  const [stance, setStance] = useState<"preferred" | "avoided">("preferred");
  const [label, setLabel] = useState(""); const [note, setNote] = useState("");
  const add = async () => {
    if (!label.trim()) { onMsg("err", t("banner.foodNameRequired")); return; }
    const r = await addPreference(clientId, { stance, food_label: label.trim(), note: note || null });
    if (r.ok) { setLabel(""); setNote(""); onMsg("ok", t("banner.prefAdded")); onChange(); } else onMsg("err", t("banner.prefAddFailed") + (r.code ? ` (${r.code})` : ""));
  };
  const del = async (id: string) => { const r = await deletePreference(clientId, id); if (r.ok) { onChange(); } };
  const group = (s: "preferred" | "avoided") => rows.filter((r) => r.stance === s);
  return (
    <Section title={t("preferences.title")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["preferred", "avoided"] as const).map((s) => (
          <div key={s}>
            <h4 className="mb-1 text-sm font-semibold text-slate-700">{s === "preferred" ? t("preferences.preferredGroup") : t("preferences.avoidedGroup")}</h4>
            <ul className="space-y-1">
              {group(s).length === 0 && <li className="text-sm text-slate-400">{t("preferences.empty")}</li>}
              {group(s).map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded bg-emerald-50/50 px-2 py-1 text-sm">
                  <span>{p.food_label}{p.note ? <span className="text-slate-400"> · {p.note}</span> : null}</span>
                  <button onClick={() => del(p.id)} className="text-xs text-red-500 hover:underline">{t("preferences.delete")}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select value={stance} onChange={(e) => setStance(e.target.value as "preferred" | "avoided")} className="rounded border border-emerald-200 px-2 py-1 text-sm">
          <option value="preferred">{t("preferences.optPreferred")}</option><option value="avoided">{t("preferences.optAvoided")}</option>
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("preferences.phFood")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("preferences.phNote")} className="rounded border border-emerald-200 px-2 py-1 text-sm" />
        <button onClick={add} className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">{t("preferences.add")}</button>
      </div>
    </Section>
  );
}

// ── Planlar ──
function PlansSection({ t, clientId, clientName, families }: { t: Tf; clientId: string; clientName: string; families: PlanFamily[] }) {
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  const newHref = `/beslenme/planlar?newForClient=${encodeURIComponent(clientId)}&clientName=${encodeURIComponent(clientName)}`;
  return (
    <Section title={t("plans.title")} action={<Link href={newHref} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">{t("plans.new")}</Link>}>
      {families.length === 0 ? (
        <p className="text-sm text-slate-400">{t("plans.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {families.map((f) => (
            <li key={f.plan_family_id} className="rounded-lg border border-emerald-100 p-3">
              {f.latest && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Link href={`/beslenme/planlar/${f.latest.id}`} className="font-semibold text-emerald-800 hover:underline">{f.latest.title}</Link>
                    <span className="ml-2 text-xs text-slate-500">V{f.latest.revision_number} · {statusLabel(f.latest.status)} · {f.latest.start_date} → {f.latest.end_date}</span>
                  </div>
                </div>
              )}
              {f.revisions.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  {f.revisions.map((r) => (
                    <Link key={r.id} href={`/beslenme/planlar/${r.id}`} className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200">V{r.revision_number} · {statusLabel(r.status)}</Link>
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
