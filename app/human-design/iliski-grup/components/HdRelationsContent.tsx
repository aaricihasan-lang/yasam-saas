"use client";

// İlişki ve Grup Analizleri — TEK ortak giriş.
//   • Kişi sayısı: 2 → İlişki Analizi (Connection) · 3/4/5 → Grup Analizi (Penta).
//   • Danışan seçimi bu hesabın HD danışanlarından; bir kişi aynı analizde iki kez seçilemez.
//   • Yalnız "Oluştur" düğmesi sunucuya hesaplama isteği gönderir; ekranı açma, kişi sayısı değiştirme,
//     arama/seçim, kayıtlı analizi açma ve indirme Roxy çağrısı YAPMAZ.
//   • Detay URL'de (?id=) → Android/ tarayıcı geri tuşu listeye döner; yenileme kayıtlı sonucu açar.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import type { RelationAnalysisView, RelationCandidate, RelationListRow, RelationType } from "@/lib/human-design/relations/relationService";
import { CONNECTION_RELATION_TYPES, PENTA_RELATION_TYPES, participantTag } from "@/lib/human-design/relations/labels";
import { createRelation, deleteRelation, fetchRelationAnalysis, fetchRelationCandidates, fetchRelationList } from "../helpers/relationsClient";
import { useRelationLabels } from "../helpers/useRelationLabels";
import { useRelationError } from "../helpers/useRelationError";
import { ExpertCommentEditor, RelationReportPanel, RelationSourcesPanel } from "./RelationWorkspace";
import { ConnectionResultView, PentaResultView } from "./RelationResultViews";

const COUNTS = [2, 3, 4, 5] as const;

function dmy(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}
const cardCls = "rounded-2xl border border-indigo-200/80 bg-white/95 px-4 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 sm:px-5";

export function HdRelationsContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const openId = sp.get("id");
  const { t } = useRelationLabels();
  return (
    <HumanDesignShell maxWidthClass="max-w-[1480px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600">{t("page.eyebrow")}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{t("page.title")}</h1>
        </div>
        <Link href={openId ? "/human-design/iliski-grup" : "/human-design"} className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 no-underline hover:bg-indigo-50">
          {openId ? t("page.backList") : t("page.backHub")}
        </Link>
      </div>
      {openId ? <RelationDetail key={openId} id={openId} onDeleted={() => router.push("/human-design/iliski-grup")} /> : <RelationsHome onOpen={(id) => router.push(`/human-design/iliski-grup?id=${encodeURIComponent(id)}`)} />}
    </HumanDesignShell>
  );
}

const noSubscribe = () => () => undefined;
const readIsDemo = () => readYasamUser()?.is_demo_account === true;

function RelationsHome({ onOpen }: { onOpen: (id: string) => void }) {
  const { showToast } = useToast();
  const L = useRelationLabels();
  const t = L.t;
  const errText = useRelationError();
  // D3 (owner kararı 2026-11-02): demo hesabında yeni analiz yok → oluşturma bölümü yerine bilgi (sunucu da 403 döner).
  const isDemo = useSyncExternalStore(noSubscribe, readIsDemo, () => false);
  const [count, setCount] = useState<number>(2);
  const [cands, setCands] = useState<RelationCandidate[] | null>(null);
  const [candErr, setCandErr] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>(["", ""]);
  const [relType, setRelType] = useState<RelationType | "">("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [list, setList] = useState<RelationListRow[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRelationCandidates().then((r) => {
      if (!alive) return;
      if (r.ok) setCands(r.rows);
      else setCandErr(errText(r));
    });
    fetchRelationList().then((r) => {
      if (!alive) return;
      if (r.ok) setList(r.rows);
      else setListErr(errText(r));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız ilk açılışta (dil değişimi sayfayı yeniden kurar)
  }, []);

  const changeCount = (n: number) => {
    setCount(n);
    setSlots((s) => Array.from({ length: n }, (_, i) => s[i] ?? ""));
    setRelType("");
  };
  const kind = count === 2 ? "connection" : "penta";
  const byId = useMemo(() => new Map((cands ?? []).map((c) => [c.clientId, c])), [cands]);
  const chosen = slots.map((id) => (id ? byId.get(id) ?? null : null));
  const ready = chosen.every((c) => c && c.chart) && new Set(slots).size === slots.length;

  const submit = useCallback(async () => {
    if (inFlight.current || !ready) return; // çift tık / tekrar gönderim koruması (sunucu da idempotent)
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createRelation(
        chosen.map((c) => ({ client_id: c!.clientId, chart_id: c!.chart!.id })),
        relType || null,
      );
      if (r.ok) {
        showToast({ message: r.reused ? t("home.reused") : t("home.created"), type: "success" });
        onOpen(r.id);
      } else {
        showToast({ message: errText(r), type: "error" });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [chosen, ready, relType, showToast, onOpen, t, errText]);

  return (
    <div className="space-y-5">
      {isDemo ? (
        <DemoModuleBanner message={t("home.demo")} />
      ) : (
      <section className={cardCls} data-hd-rel-builder>
        <h2 className="text-sm font-black uppercase tracking-widest text-indigo-700">{t("home.newTitle")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {t.rich("home.intro", { b: (chunks) => <b>{chunks}</b> })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t("home.countGroup")}>
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={count === n}
              onClick={() => changeCount(n)}
              disabled={busy}
              data-hd-rel-count={n}
              className={`min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-bold transition ${count === n ? "border-transparent bg-indigo-600 text-white shadow-sm" : "border-indigo-200 bg-white text-slate-700 hover:border-indigo-400"}`}
            >
              {n === 2 ? t("home.countConnection", { n }) : t("home.countPenta", { n })}
            </button>
          ))}
        </div>

        {candErr ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{candErr}</p> : null}
        {cands === null && !candErr ? <p className="mt-3 text-xs text-slate-500">{t("home.loadingClients")}</p> : null}
        {cands && cands.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            {t.rich("home.noClients", {
              link: (chunks) => (
                <Link href="/human-design/danisanlar" className="font-bold text-indigo-700">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : null}

        {cands && cands.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {slots.map((sel, i) => (
              <ParticipantPicker
                key={i}
                index={i}
                tag={participantTag(kind, i)}
                value={sel}
                candidates={cands}
                takenIds={slots.filter((x, j) => j !== i && x)}
                disabled={busy}
                onChange={(id) => setSlots((s) => s.map((x, j) => (j === i ? id : x)))}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-xs font-bold text-slate-700">
            {t("home.contextLabel")}
            <select
              value={relType}
              onChange={(e) => setRelType(e.target.value as RelationType | "")}
              disabled={busy}
              className="mt-1 h-10 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-medium text-slate-900"
              data-hd-rel-type
            >
              <option value="">{t("home.contextNone")}</option>
              {(kind === "connection" ? CONNECTION_RELATION_TYPES : PENTA_RELATION_TYPES).map((rt) => (
                <option key={rt} value={rt}>{L.type(rt)}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">{t("home.contextHint")}</span>
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            data-hd-rel-create
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("home.preparing") : kind === "connection" ? t("home.createConnection") : t("home.createPenta")}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {t("home.costNote")}
        </p>
      </section>
      )}

      <section className={cardCls} data-hd-rel-list>
        <h2 className="text-sm font-black uppercase tracking-widest text-indigo-700">{t("home.savedTitle")}</h2>
        {listErr ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{listErr}</p> : null}
        {list === null && !listErr ? <p className="mt-2 text-xs text-slate-500">{t("home.loading")}</p> : null}
        {list && list.length === 0 ? <p className="mt-2 text-xs text-slate-500">{t("home.noSaved")}</p> : null}
        {list && list.length > 0 ? (
          <ul className="mt-3 divide-y divide-indigo-50">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-left hover:bg-indigo-50/50" data-hd-rel-row={r.id}>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 break-words">{r.names.join(r.kind === "connection" ? " & " : ", ")}</span>
                    <span className="block text-[11px] text-slate-500">
                      {L.kind(r.kind)}
                      {r.relationType ? ` · ${L.type(r.relationType)}` : ""} · {dmy(r.createdAt)}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-indigo-700">{t("home.open")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function ParticipantPicker({
  index,
  tag,
  value,
  candidates,
  takenIds,
  disabled,
  onChange,
}: {
  index: number;
  tag: string;
  value: string;
  candidates: RelationCandidate[];
  takenIds: string[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const { t } = useRelationLabels();
  const reason = (k: RelationCandidate["reason"]) => t(`reason.${k ?? "no_auto_chart"}`);
  const sel = candidates.find((c) => c.clientId === value) ?? null;
  const norm = (s: string) => s.toLocaleLowerCase("tr-TR");
  const filtered = candidates.filter((c) => !q || norm(c.name).includes(norm(q)));
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3" data-hd-rel-slot={index}>
      <p className="mb-1.5 text-xs font-black text-indigo-800">{t("picker.person", { tag })}</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("picker.searchPlaceholder")}
        disabled={disabled}
        className="mb-1.5 h-9 w-full rounded-lg border border-indigo-200 bg-white px-2.5 text-sm"
        aria-label={t("picker.searchAria", { tag })}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-lg border border-indigo-200 bg-white px-2.5 text-sm font-medium text-slate-900"
        aria-label={t("picker.person", { tag })}
        data-hd-rel-select={index}
      >
        <option value="">{t("picker.choose")}</option>
        {filtered.map((c) => {
          const taken = takenIds.includes(c.clientId);
          const unusable = !c.chart;
          return (
            <option key={c.clientId} value={c.clientId} disabled={taken || unusable}>
              {c.name}
              {c.birthDate ? ` · ${dmy(c.birthDate)}` : ""}
              {taken ? t("picker.taken") : unusable ? ` — ${reason(c.reason)}` : ""}
            </option>
          );
        })}
      </select>
      {sel ? (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px] text-slate-600" data-hd-rel-birth={index}>
          <dt className="font-semibold">{t("picker.birth")}</dt>
          <dd>{dmy(sel.birthDate)} {sel.birthTime ?? ""}</dd>
          <dt className="font-semibold">{t("picker.place")}</dt>
          <dd className="break-words">{sel.chart?.birthPlace ?? "—"}</dd>
          <dt className="font-semibold">{t("picker.source")}</dt>
          <dd>{sel.chart ? t("picker.sourceValue", { date: dmy(sel.chart.createdAt) }) : reason(sel.reason)}</dd>
        </dl>
      ) : null}
    </div>
  );
}

function RelationDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { showToast } = useToast();
  const L = useRelationLabels();
  const t = L.t;
  const errText = useRelationError();
  const [state, setState] = useState<{ loading: boolean; a: RelationAnalysisView | null; error: string | null }>({ loading: true, a: null, error: null });
  const [confirmDel, setConfirmDel] = useState(false);
  const [working, setWorking] = useState<"" | "delete">("");

  useEffect(() => {
    let alive = true;
    fetchRelationAnalysis(id).then((r) => {
      if (alive) setState(r.ok ? { loading: false, a: r.analysis, error: null } : { loading: false, a: null, error: errText(r) });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız kimlik değişince yeniden okunur
  }, [id]);

  if (state.loading) return <p className="text-sm text-slate-500">{t("detail.loading")}</p>;
  if (!state.a) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{state.error}</p>;
  const a = state.a;

  const doDelete = async () => {
    if (working) return;
    setWorking("delete");
    const r = await deleteRelation(a.id);
    setWorking("");
    if (r.ok) {
      showToast({ message: t("detail.deleted"), type: "success" });
      onDeleted();
    } else showToast({ message: errText(r), type: "error" });
  };

  return (
    <div className="space-y-4" data-hd-rel-detail={a.kind}>
      <section className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-violet-700">{L.kind(a.kind)}</p>
            <h2 className="mt-0.5 break-words text-lg font-black text-slate-900">{a.participants.map((p) => p.name).join(a.kind === "connection" ? " & " : ", ")}</h2>
            <p className="text-[11px] text-slate-500">
              {a.relationType ? `${L.type(a.relationType)} · ` : ""}{t("detail.meta", { date: dmy(a.createdAt) })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="no-android">
              <a href="#hd-rel-reports" className="inline-flex min-h-[40px] items-center rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 no-underline hover:bg-emerald-50" data-hd-rel-word>
                {t("detail.prepareReport")}
              </a>
            </div>
            {confirmDel ? (
              <span className="flex flex-wrap items-center gap-1.5" data-hd-rel-confirm-delete>
                <span className="text-[11px] font-semibold text-rose-700">{t("detail.deleteOnly")}</span>
                <button type="button" onClick={doDelete} disabled={!!working} className="min-h-[40px] rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" data-hd-rel-delete-confirm>
                  {working === "delete" ? t("detail.deleting") : t("detail.confirmDelete")}
                </button>
                <button type="button" onClick={() => setConfirmDel(false)} disabled={!!working} className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">{t("detail.cancel")}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="min-h-[40px] rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50" data-hd-rel-delete>
                {t("detail.delete")}
              </button>
            )}
          </div>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-hd-rel-participants>
          {a.participants.map((p) => (
            <li key={p.position} className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" data-hd-rel-participant={participantTag(a.kind, p.position)}>
              <p className="font-black text-indigo-800">{participantTag(a.kind, p.position)} · <span className="text-slate-900">{p.name}</span></p>
              <p className="text-slate-600">{dmy(p.birthDate)} {p.birthTime ?? ""}{p.birthPlace ? ` · ${p.birthPlace}` : ""}</p>
              {p.status !== "current" ? (
                <p className="mt-1 font-semibold text-amber-700" data-hd-rel-historical={p.status}>
                  {p.status === "birth_data_changed"
                    ? t("detail.histBirthChanged")
                    : p.status === "source_chart_deleted"
                      ? t("detail.histSourceDeleted")
                      : t("detail.histClientDeleted")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {a.kind === "connection" ? <ConnectionResultView a={a} /> : <PentaResultView a={a} />}
      <RelationSourcesPanel id={a.id} />
      <ExpertCommentEditor id={a.id} />
      <div id="hd-rel-reports" className="scroll-mt-20">
        <RelationReportPanel id={a.id} analysis={a} />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{t("note.disclaimer")} {t("detail.savedNote")}</p>
    </div>
  );
}
