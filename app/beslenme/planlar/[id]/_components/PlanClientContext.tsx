"use client";
/**
 * Plan editörü — danışan bağlam şeridi (FAZ 7 §15/§16). Bağlıysa kompakt özet:
 * Danışan / Hedef / Beyan Alerjiler / Kaçınılan Besinler + ikincil Kan Grubu · Mizaç.
 * Immutable recipient (değiştir dropdown'u YOK — §21). Sensitive PII (telefon/adres)
 * render EDİLMEZ. Bağlam SERVER'dan (plan→family→binding→client) çözülür; spoof edilemez.
 * Bağsızsa "Danışana Bağla" (ClientPicker → assign). Kaçınılan food_id'leri parent'a
 * bildirir (item advisory — §17). Owner-only; API owner-authoritative.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getPlanBinding,
  assignPlanClient,
  type PlanClientSummary,
} from "@/lib/beslenme/clientTabClient";
import ClientPicker from "@/components/danisan/ClientPicker";

function avoidedIdsOf(ctx: PlanClientSummary | null | undefined): Set<string> {
  const s = new Set<string>();
  for (const a of ctx?.avoided ?? []) if (a.food_id) s.add(a.food_id);
  return s;
}

export default function PlanClientContext({
  planId,
  onAvoidedFoodIdsChange,
}: {
  planId: string;
  onAvoidedFoodIdsChange?: (ids: Set<string>) => void;
}) {
  const t = useTranslations("beslenme.plan.context");
  const td = useTranslations("beslenme.detail");
  const locale = useLocale();
  const [state, setState] = useState<"loading" | "bound" | "unbound" | "locked">("loading");
  const [name, setName] = useState<string>("");
  const [ctx, setCtx] = useState<PlanClientSummary | null>(null);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getPlanBinding(planId);
      if (!alive) return;
      if (!r.ok || !r.data) { setState("unbound"); onAvoidedFoodIdsChange?.(new Set()); return; }
      if (r.data.bound) {
        setName(r.data.client?.display_name ?? "");
        setCtx(r.data.context ?? null);
        setState("bound");
        onAvoidedFoodIdsChange?.(avoidedIdsOf(r.data.context));
      } else {
        setState(r.data.canBind === false ? "locked" : "unbound");
        onAvoidedFoodIdsChange?.(new Set());
      }
    })();
    return () => { alive = false; };
  }, [planId, reloadKey, onAvoidedFoodIdsChange]);

  const bind = async (clientId: string) => {
    const a = await assignPlanClient(planId, clientId);
    if (a.ok) { setPicker(false); setMsg(null); setReloadKey((k) => k + 1); }
    else setMsg(a.code === "PLAN_CLIENT_IMMUTABLE" ? t("immutableError") : t("bindFailed"));
  };

  const goalText = useMemo(() => {
    if (!ctx) return t("none");
    const parts: string[] = [];
    if (ctx.goal_type) parts.push(td.has(`goalType.${ctx.goal_type}`) ? td(`goalType.${ctx.goal_type}`) : ctx.goal_type);
    if (ctx.goal_note) parts.push(ctx.goal_note);
    return parts.length ? parts.join(" · ") : t("none");
  }, [ctx, t, td]);

  const allergensText = useMemo(() => {
    if (!ctx || ctx.allergens.length === 0) return t("none");
    return ctx.allergens
      .map((a) => (locale === "en" ? a.name_en || a.name_tr || a.code : a.name_tr || a.code))
      .join(", ");
  }, [ctx, t, locale]);

  const avoidedText = useMemo(() => {
    if (!ctx || ctx.avoided.length === 0) return t("none");
    return ctx.avoided.map((a) => a.food_label).join(", ");
  }, [ctx, t]);

  const kanText = ctx?.kan ? (td.has(`kan.${ctx.kan}`) ? td(`kan.${ctx.kan}`) : ctx.kan) : null;
  const mizacText = ctx?.mizac ? (td.has(`mizac.${ctx.mizac}`) ? td(`mizac.${ctx.mizac}`) : ctx.mizac) : null;

  if (state === "loading") return null;

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm">
      {state === "bound" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-emerald-900">
              {t("clientLabel")}: <strong>{name}</strong>
            </span>
            {(kanText || mizacText) && (
              <span className="text-[12px] text-slate-500">
                {kanText ? `${t("bloodLabel")}: ${kanText}` : ""}
                {kanText && mizacText ? " · " : ""}
                {mizacText ? `${t("temperamentLabel")}: ${mizacText}` : ""}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
            <Item label={t("goalLabel")} value={goalText} />
            <Item label={t("allergensLabel")} value={allergensText} />
            <Item label={t("avoidedLabel")} value={avoidedText} />
          </dl>
          <p className="text-[11px] text-slate-400">{t("advisory")}</p>
        </div>
      ) : state === "locked" ? (
        <span className="text-slate-500">{t("lockedArchived")}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-600">{t("unbound")}</span>
          <button
            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
            onClick={() => setPicker((v) => !v)}
          >
            {picker ? t("close") : t("bind")}
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

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate text-slate-700" title={value}>{value}</dd>
    </div>
  );
}
