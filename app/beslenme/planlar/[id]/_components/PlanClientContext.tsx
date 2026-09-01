"use client";
/**
 * Plan editörü — danışan bağlam şeridi (FAZ 7). Bağlıysa "Danışan: X" (immutable;
 * değiştir dropdown'u YOK — §30). Bağsızsa "Danışana Bağla" (ClientPicker → assign).
 * Sensitive PII (telefon/adres) render EDİLMEZ; yalnız ad. Kendi fetch'i (planId).
 */
import { useEffect, useState } from "react";
import { getPlanBinding, assignPlanClient } from "@/lib/beslenme/clientTabClient";
import ClientPicker from "@/components/danisan/ClientPicker";

export default function PlanClientContext({ planId }: { planId: string }) {
  const [state, setState] = useState<"loading" | "bound" | "unbound" | "locked">("loading");
  const [name, setName] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getPlanBinding(planId);
      if (!alive) return;
      if (!r.ok || !r.data) { setState("unbound"); return; }
      if (r.data.bound) { setName(r.data.client?.display_name ?? "Danışan"); setState("bound"); }
      else setState(r.data.canBind === false ? "locked" : "unbound");
    })();
    return () => { alive = false; };
  }, [planId]);

  const bind = async (clientId: string) => {
    const a = await assignPlanClient(planId, clientId);
    if (a.ok && a.data) { setName(a.data.client.display_name); setState("bound"); setMsg(null); }
    else setMsg(a.code === "PLAN_CLIENT_IMMUTABLE" ? "Bu plan zaten başka bir danışana bağlı; değiştirilemez." : "Danışana bağlanamadı.");
  };

  if (state === "loading") return null;

  return (
    <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2 text-sm">
      {state === "bound" ? (
        <span className="text-emerald-900">Danışan: <strong>{name}</strong></span>
      ) : state === "locked" ? (
        <span className="text-slate-500">Bu plan arşiv revizyonu içerdiğinden danışana bağlanamaz.</span>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-600">Bu plan bir danışana bağlı değil.</span>
          <button className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white" onClick={() => setPicker((v) => !v)}>
            {picker ? "Kapat" : "Danışana Bağla"}
          </button>
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
      {picker && state === "unbound" && (
        <div className="mt-2 max-w-md">
          <ClientPicker onSelect={(c) => { setPicker(false); void bind(c.id); }} />
        </div>
      )}
    </div>
  );
}
