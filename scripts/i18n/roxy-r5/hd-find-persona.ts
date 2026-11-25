// R5 ROXY — ağsız: yerel HD motoruyla sentetik kişi seçimi (Manifestor + Emotional + triple split adayı) ve P1–P3 tipleri. ÇAĞRI YOK.
import { computeHumanDesignChart } from "@/lib/human-design/engine/compute";

const show = (label: string, date: string, time: string, timezone: string, lat: number, lon: number) => {
  const r = computeHumanDesignChart({ date, time, timezone, location: { latitude: lat, longitude: lon } } as never) as unknown as Record<string, unknown>;
  const g = r as { type?: string; authority?: string; profile?: string; definition?: unknown };
  console.log(label, date, time, timezone, JSON.stringify({ type: g.type, authority: g.authority, profile: g.profile, definition: g.definition }).slice(0, 220));
  return r;
};

show("P1", "1990-04-01", "14:30", "Europe/Istanbul", 41.0082, 28.9784);
show("P2", "1985-12-21", "03:15", "Europe/Oslo", 69.6492, 18.9553);
show("P3", "2000-02-29", "23:50", "Australia/Sydney", -33.8688, 151.2093);
show("FIX", "2018-07-20", "16:00", "UTC", 37.871399, 32.484699);

const want = new Map<string, string>();
for (let d = 0; d < 3000 && want.size < 5; d++) {
  const dt = new Date(Date.UTC(1960, 0, 1) + d * 7 * 86400000 + ((d * 5) % 24) * 3600000 + (d % 4) * 900000);
  const date = dt.toISOString().slice(0, 10);
  const time = dt.toISOString().slice(11, 16);
  const r = computeHumanDesignChart({ date, time, timezone: "Europe/Istanbul", location: { latitude: 38.4192, longitude: 27.1287 } } as never) as unknown as Record<string, unknown>;
  const def = r.definition as { kind?: string };
  const k = `${r.type}|${String(r.type) === "Manifestor" ? r.authority : ""}|${String(r.type) === "Manifestor" ? def.kind : ""}`;
  const tag = String(r.type) === "Manifestor" && /Emotional/.test(String(r.authority)) && def.kind === "triple-split" ? "MANIFESTOR-EMO-TRIPLE" : ["Projector", "Reflector", "Manifestor"].includes(String(r.type)) ? String(r.type) : "";
  if (tag && !want.has(tag)) { want.set(tag, date + " " + time); console.log("ADAY", tag, date, time, JSON.stringify({ type: r.type, authority: r.authority, profile: r.profile, def: def.kind })); }
  void k;
}
