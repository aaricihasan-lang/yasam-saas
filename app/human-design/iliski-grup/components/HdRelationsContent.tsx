"use client";

// İlişki ve Grup Analizleri — TEK ortak giriş.
//   • Kişi sayısı: 2 → İlişki Analizi (Connection) · 3/4/5 → Grup Analizi (Penta).
//   • Danışan seçimi bu hesabın HD danışanlarından; bir kişi aynı analizde iki kez seçilemez.
//   • Yalnız "Oluştur" düğmesi sunucuya hesaplama isteği gönderir; ekranı açma, kişi sayısı değiştirme,
//     arama/seçim, kayıtlı analizi açma ve indirme Roxy çağrısı YAPMAZ.
//   • Detay URL'de (?id=) → Android/ tarayıcı geri tuşu listeye döner; yenileme kayıtlı sonucu açar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import type { RelationAnalysisView, RelationCandidate, RelationListRow, RelationType } from "@/lib/human-design/relations/relationService";
import {
  CONNECTION_RELATION_TYPES,
  PENTA_RELATION_TYPES,
  participantTag,
  RELATION_DISCLAIMER,
  RELATION_KIND_LABEL,
  RELATION_TYPE_LABEL,
} from "@/lib/human-design/relations/labels";
import { createRelation, deleteRelation, fetchRelationAnalysis, fetchRelationCandidates, fetchRelationList } from "../helpers/relationsClient";
import { ExpertCommentEditor, RelationReportPanel, RelationSourcesPanel } from "./RelationWorkspace";
import { ConnectionResultView, PentaResultView } from "./RelationResultViews";

const COUNTS = [2, 3, 4, 5] as const;
const REASON: Record<NonNullable<RelationCandidate["reason"]>, string> = {
  no_auto_chart: "Önce otomatik BodyGraph analizi gerekli",
  birth_data_changed: "Doğum bilgisi değişti — bireysel analizi güncelleyin",
  chart_incomplete: "Kayıtlı analiz eksik — bireysel analizi yeniden oluşturun",
};

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
  return (
    <HumanDesignShell maxWidthClass="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600">Human Design</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">İlişki ve Grup Analizleri</h1>
        </div>
        <Link href={openId ? "/human-design/iliski-grup" : "/human-design"} className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 no-underline hover:bg-indigo-50">
          {openId ? "← Analizler" : "← Human Design"}
        </Link>
      </div>
      {openId ? <RelationDetail key={openId} id={openId} onDeleted={() => router.push("/human-design/iliski-grup")} /> : <RelationsHome onOpen={(id) => router.push(`/human-design/iliski-grup?id=${encodeURIComponent(id)}`)} />}
    </HumanDesignShell>
  );
}

function RelationsHome({ onOpen }: { onOpen: (id: string) => void }) {
  const { showToast } = useToast();
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
      else setCandErr(r.error);
    });
    fetchRelationList().then((r) => {
      if (!alive) return;
      if (r.ok) setList(r.rows);
      else setListErr(r.error);
    });
    return () => {
      alive = false;
    };
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
        showToast({ message: r.reused ? "Bu katılımcılarla kayıtlı analiz açıldı (yeni hesaplama yapılmadı)." : "Analiz oluşturuldu ve kaydedildi.", type: "success" });
        onOpen(r.id);
      } else {
        showToast({ message: r.error, type: "error" });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [chosen, ready, relType, showToast, onOpen]);

  return (
    <div className="space-y-5">
      <section className={cardCls} data-hd-rel-builder>
        <h2 className="text-sm font-black uppercase tracking-widest text-indigo-700">Yeni Analiz</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Kaç kişiyi analiz edeceğinizi seçin. 2 kişi için <b>İlişki Analizi (Connection)</b>, 3–5 kişi için <b>Grup Analizi (Penta)</b> hazırlanır. Katılımcıların doğum bilgileri kayıtlı ve doğrulanmış bireysel Human Design analizlerinden alınır.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Kişi sayısı">
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
              {n} kişi · {n === 2 ? "İlişki" : "Grup (Penta)"}
            </button>
          ))}
        </div>

        {candErr ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{candErr}</p> : null}
        {cands === null && !candErr ? <p className="mt-3 text-xs text-slate-500">Danışanlar yükleniyor…</p> : null}
        {cands && cands.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            Henüz Human Design danışanınız yok. Önce <Link href="/human-design/danisanlar" className="font-bold text-indigo-700">Human Design Hesaplama</Link> bölümünden danışan ekleyip bireysel analizini oluşturun.
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
            İlişki bağlamı (isteğe bağlı)
            <select
              value={relType}
              onChange={(e) => setRelType(e.target.value as RelationType | "")}
              disabled={busy}
              className="mt-1 h-10 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-medium text-slate-900"
              data-hd-rel-type
            >
              <option value="">— Seçilmedi —</option>
              {(kind === "connection" ? CONNECTION_RELATION_TYPES : PENTA_RELATION_TYPES).map((t) => (
                <option key={t} value={t}>{RELATION_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Yalnız kayıt bilgisidir; hesaplamayı ve sonucu değiştirmez.</span>
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            data-hd-rel-create
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Hazırlanıyor…" : kind === "connection" ? "İlişki Analizini Oluştur" : "Grup Analizini Oluştur"}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Yeni analiz 1 hesaplama hakkı kullanır. Aynı katılımcılarla kayıtlı analiz varsa yeniden hesaplanmaz, kayıtlı sonuç açılır.
        </p>
      </section>

      <section className={cardCls} data-hd-rel-list>
        <h2 className="text-sm font-black uppercase tracking-widest text-indigo-700">Kayıtlı Analizler</h2>
        {listErr ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{listErr}</p> : null}
        {list === null && !listErr ? <p className="mt-2 text-xs text-slate-500">Yükleniyor…</p> : null}
        {list && list.length === 0 ? <p className="mt-2 text-xs text-slate-500">Henüz kayıtlı ilişki veya grup analizi yok.</p> : null}
        {list && list.length > 0 ? (
          <ul className="mt-3 divide-y divide-indigo-50">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-left hover:bg-indigo-50/50" data-hd-rel-row={r.id}>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 break-words">{r.names.join(r.kind === "connection" ? " & " : ", ")}</span>
                    <span className="block text-[11px] text-slate-500">
                      {RELATION_KIND_LABEL[r.kind]}
                      {r.relationType ? ` · ${RELATION_TYPE_LABEL[r.relationType]}` : ""} · {dmy(r.createdAt)}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-indigo-700">Aç →</span>
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
  const sel = candidates.find((c) => c.clientId === value) ?? null;
  const norm = (s: string) => s.toLocaleLowerCase("tr-TR");
  const filtered = candidates.filter((c) => !q || norm(c.name).includes(norm(q)));
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3" data-hd-rel-slot={index}>
      <p className="mb-1.5 text-xs font-black text-indigo-800">Kişi {tag}</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Danışan ara…"
        disabled={disabled}
        className="mb-1.5 h-9 w-full rounded-lg border border-indigo-200 bg-white px-2.5 text-sm"
        aria-label={`Kişi ${tag} için danışan ara`}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-lg border border-indigo-200 bg-white px-2.5 text-sm font-medium text-slate-900"
        aria-label={`Kişi ${tag}`}
        data-hd-rel-select={index}
      >
        <option value="">— Danışan seçin —</option>
        {filtered.map((c) => {
          const taken = takenIds.includes(c.clientId);
          const unusable = !c.chart;
          return (
            <option key={c.clientId} value={c.clientId} disabled={taken || unusable}>
              {c.name}
              {c.birthDate ? ` · ${dmy(c.birthDate)}` : ""}
              {taken ? " (bu analizde seçili)" : unusable ? ` — ${REASON[c.reason ?? "no_auto_chart"]}` : ""}
            </option>
          );
        })}
      </select>
      {sel ? (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px] text-slate-600" data-hd-rel-birth={index}>
          <dt className="font-semibold">Doğum</dt>
          <dd>{dmy(sel.birthDate)} {sel.birthTime ?? ""}</dd>
          <dt className="font-semibold">Yer</dt>
          <dd className="break-words">{sel.chart?.birthPlace ?? "—"}</dd>
          <dt className="font-semibold">Kaynak</dt>
          <dd>{sel.chart ? `Bireysel analiz · ${dmy(sel.chart.createdAt)}` : REASON[sel.reason ?? "no_auto_chart"]}</dd>
        </dl>
      ) : null}
    </div>
  );
}

function RelationDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { showToast } = useToast();
  const [state, setState] = useState<{ loading: boolean; a: RelationAnalysisView | null; error: string | null }>({ loading: true, a: null, error: null });
  const [confirmDel, setConfirmDel] = useState(false);
  const [working, setWorking] = useState<"" | "delete">("");

  useEffect(() => {
    let alive = true;
    fetchRelationAnalysis(id).then((r) => {
      if (alive) setState(r.ok ? { loading: false, a: r.analysis, error: null } : { loading: false, a: null, error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.loading) return <p className="text-sm text-slate-500">Analiz yükleniyor…</p>;
  if (!state.a) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{state.error}</p>;
  const a = state.a;

  const doDelete = async () => {
    if (working) return;
    setWorking("delete");
    const r = await deleteRelation(a.id);
    setWorking("");
    if (r.ok) {
      showToast({ message: "Analiz silindi. Danışanlar ve bireysel analizleri etkilenmedi.", type: "success" });
      onDeleted();
    } else showToast({ message: r.error, type: "error" });
  };

  return (
    <div className="space-y-4" data-hd-rel-detail={a.kind}>
      <section className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-violet-700">{RELATION_KIND_LABEL[a.kind]}</p>
            <h2 className="mt-0.5 break-words text-lg font-black text-slate-900">{a.participants.map((p) => p.name).join(a.kind === "connection" ? " & " : ", ")}</h2>
            <p className="text-[11px] text-slate-500">
              {a.relationType ? `${RELATION_TYPE_LABEL[a.relationType]} · ` : ""}Analiz tarihi {dmy(a.createdAt)} · Kayıtlı sonuç (görüntülemede yeniden hesap yapılmaz)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="no-android">
              <a href="#hd-rel-reports" className="inline-flex min-h-[40px] items-center rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 no-underline hover:bg-emerald-50" data-hd-rel-word>
                Raporu Hazırla
              </a>
            </div>
            {confirmDel ? (
              <span className="flex flex-wrap items-center gap-1.5" data-hd-rel-confirm-delete>
                <span className="text-[11px] font-semibold text-rose-700">Yalnız bu analiz silinir.</span>
                <button type="button" onClick={doDelete} disabled={!!working} className="min-h-[40px] rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" data-hd-rel-delete-confirm>
                  {working === "delete" ? "Siliniyor…" : "Evet, sil"}
                </button>
                <button type="button" onClick={() => setConfirmDel(false)} disabled={!!working} className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Vazgeç</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="min-h-[40px] rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50" data-hd-rel-delete>
                Sil
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
                    ? "Doğum bilgisi sonradan değişti — bu sonuç o tarihteki kayıtlı bilgilerle hazırlandı."
                    : p.status === "source_chart_deleted"
                      ? "Kaynak bireysel analiz sonradan silindi/değişti — tarihsel kayıt."
                      : "Danışan profili silindi — ad tarihsel kayıttan."}
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
        <RelationReportPanel id={a.id} />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{RELATION_DISCLAIMER} Kayıtlı sonuç gösterilmektedir; görüntülemede yeniden hesap yapılmaz.</p>
    </div>
  );
}
