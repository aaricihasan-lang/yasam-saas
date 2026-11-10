"use client";

/**
 * Admin › Üye Yönetimi — V2 (Aşama 2; Owner PASS önizlemesi sürüm 3).
 *
 * Bugün dikkat · beş gösterge · sade liste (tek aşama etiketi) · 6 görünür + 9 “Diğer” filtre · arama ·
 * öncelikli sıralama · gelişmiş filtre · mobil kart görünümü · mevcut üye detayına bağlantı.
 * Veri: GET /api/admin/members (admin_list_members_v2 — satır + sayaç + filtre sayıları tek tanımdan).
 * YALNIZ GÖRÜNTÜLEME: üyelik / ödeme / erişim davranışı değişmez. Önceki ekranın tüm işlemleri
 * (yeni uzman, arşivden geri alma, kalıcı silme, 360° filtreleri, Yönetim Özeti) /admin/users/klasik'te aynen durur;
 * eski parametreli bağlantılar oraya yönlendirilir.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import styles from "@/components/admin/members/list/memberListV2.module.css";
import { MemberOverviewPanel, OVERVIEW_TARGET_QUERY } from "@/components/admin/members/MemberOverviewPanel";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useConfirmedLogout } from "@/hooks/useConfirmedLogout";
import { isAdminUser, readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import {
  ADMIN_MODULE_UI_LABELS,
  enabledAccessModules,
  parseAdminModulePermissions,
} from "@/lib/admin/userManagement";
import {
  DEFAULT_MEMBER_LIST_QUERY,
  MEMBER_FILTER_MODULE_KEYS,
  MEMBER_LIST_RETURN_KEY,
  memberListQueryToSearch,
  type MemberModuleFilter,
} from "@/lib/admin/memberListQuery";
import {
  agoTr,
  DEFAULT_MEMBER_V2_QUERY,
  fmtDateTr,
  legacyMemberListRedirect,
  MEMBER_CLASSIC_PATH,
  MEMBER_V2_MAIN_FILTERS,
  MEMBER_V2_MORE_FILTERS,
  MEMBER_V2_PAGE_SIZE,
  MEMBER_V2_PAYMENT_LABELS,
  MEMBER_V2_RETURN_PREFIX,
  MEMBER_V2_SORT_LABELS,
  memberPeriodText,
  memberStageLabel,
  memberV2QueryToSearch,
  parseMemberV2Query,
  type MemberV2Counts,
  type MemberV2Decisions,
  type MemberV2Filter,
  type MemberV2Payment,
  type MemberV2Presets,
  type MemberV2Query,
  type MemberV2Row,
  type MemberV2Sort,
} from "@/lib/admin/memberListV2";

type Loaded = {
  rows: MemberV2Row[];
  total: number;
  presets: MemberV2Presets;
  counts: MemberV2Counts;
  decisions: MemberV2Decisions;
  today: string;
  nowMs: number;
};
type State = { kind: "loading" } | { kind: "error"; denied: boolean } | { kind: "ready"; data: Loaded };

const noopSubscribe = () => () => {};
const readStoredUserRaw = () => {
  try {
    return localStorage.getItem("yasam_user");
  } catch {
    return null;
  }
};

function adminHeaders(adminId: string): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": adminId };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  return h;
}

function StagePill({ row, nowMs }: { row: MemberV2Row; nowMs: number }) {
  const s = memberStageLabel(row.stage, {
    exempt: (row.payment_status ?? "").toLowerCase() === "exempt",
    trialEndsAt: row.trial_ends_at,
    nowMs,
  });
  return (
    <span className={`${styles.pill} ${styles[`t-${s.tone}`]}`} data-stage={row.stage}>
      <span className={styles.pillDot} aria-hidden />
      {s.label}
    </span>
  );
}

function Pills({ row, nowMs }: { row: MemberV2Row; nowMs: number }) {
  return (
    <span className={styles.pills}>
      <StagePill row={row} nowMs={nowMs} />
      {row.pro_request_at && row.stage !== "pro" ? (
        <span className={`${styles.pill} ${styles["t-act"]}`} data-pro-request>Pro talebi</span>
      ) : null}
    </span>
  );
}

function modSummary(row: MemberV2Row): { text: string; more: number } | null {
  if (row.role !== "expert") return null;
  const mods = enabledAccessModules(parseAdminModulePermissions(row.module_permissions)).filter(
    (k) => k !== "digital_content" || row.stage === "pro",
  );
  if (!mods.length) return null;
  return { text: mods.slice(0, 3).map((k) => ADMIN_MODULE_UI_LABELS[k]).join(" · "), more: Math.max(0, mods.length - 3) };
}

function Mods({ row }: { row: MemberV2Row }) {
  const m = modSummary(row);
  if (row.role !== "expert") return <span className={styles.muted}>—</span>;
  if (!m) return <span className={styles.muted}>Açık modül yok</span>;
  return (
    <>
      {m.text}
      {m.more ? <span className={styles.muted}> +{m.more}</span> : null}
    </>
  );
}

function MembersV2Content() {
  useBfcacheRefresh();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handleLogout = useConfirmedLogout();

  const legacyTarget = legacyMemberListRedirect(searchParams);
  const parsed = parseMemberV2Query(searchParams);
  const query: MemberV2Query = parsed.ok ? parsed.value : DEFAULT_MEMBER_V2_QUERY;
  const queryKey = memberV2QueryToSearch(query);

  const storedUserRaw = useSyncExternalStore(noopSubscribe, readStoredUserRaw, () => null);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const sessionUser = useMemo(() => (storedUserRaw ? readYasamUser() : null), [storedUserRaw]);
  const allowed = isAdminUser(sessionUser);
  const adminId = sessionUser?.id ?? "";

  const [reloadTick, setReloadTick] = useState(0);
  const requestKey = `${queryKey}|${reloadTick}`;
  const [result, setResult] = useState<{ key: string; state: State } | null>(null);
  const state: State = result && result.key === requestKey ? result.state : { kind: "loading" };
  // Son başarılı veri: yeni sayfa yüklenirken göstergeler / sayılar boşa düşmez.
  const [lastData, setLastData] = useState<Loaded | null>(null);
  const data = state.kind === "ready" ? state.data : lastData;

  const [attnAll, setAttnAll] = useState(false);
  const [adv, setAdv] = useState(query.module !== "all" || query.payment !== "all" || query.role !== "expert");
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchText, setSearchText] = useState(query.q);
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (syncedQ !== query.q) {
    setSyncedQ(query.q);
    if (searchText.trim() !== query.q) setSearchText(query.q);
  }

  const setQuery = useCallback(
    (patch: Partial<MemberV2Query>, mode: "push" | "replace" = "push") => {
      const next: MemberV2Query = { ...query, ...patch };
      const qs = memberV2QueryToSearch(next);
      if (qs === queryKey) return;
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [query, queryKey, pathname, router],
  );

  // Eski (klasik) parametrelerle gelen bağlantı → aynı sonucu gösteren klasik liste.
  useEffect(() => {
    if (legacyTarget) router.replace(legacyTarget);
  }, [legacyTarget, router]);

  // Arama: 350 ms bekleme → URL (sayfa 1).
  useEffect(() => {
    if (searchText.trim() === query.q) return;
    const t = setTimeout(() => setQuery({ q: searchText.trim(), page: 1 }, "replace"), 350);
    return () => clearTimeout(t);
  }, [searchText, query.q, setQuery]);

  // Detaydan "Üye listesine dön" aynı filtreye döner (sekme-yerel).
  useEffect(() => {
    try {
      window.sessionStorage.setItem(MEMBER_LIST_RETURN_KEY, `${MEMBER_V2_RETURN_PREFIX}${queryKey}`);
    } catch {
      /* depolama kapalı → dönüş düz listeye */
    }
  }, [queryKey]);

  useEffect(() => {
    if (!hydrated || !allowed || !adminId || legacyTarget) return;
    const ctrl = new AbortController();
    const key = requestKey;
    fetch(`/api/admin/members${queryKey ? `?${queryKey}` : ""}`, { headers: adminHeaders(adminId), cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          setResult({ key, state: { kind: "error", denied: res.status === 401 || res.status === 403 } });
          return;
        }
        const j = (await res.json()) as Record<string, unknown>;
        const serverNow = typeof j.serverNow === "string" ? Date.parse(j.serverNow) : NaN;
        const loaded: Loaded = {
          rows: (Array.isArray(j.rows) ? j.rows : []) as MemberV2Row[],
          total: Number(j.total) || 0,
          presets: j.presets as MemberV2Presets,
          counts: j.counts as MemberV2Counts,
          decisions: j.decisions as MemberV2Decisions,
          today: typeof j.today === "string" ? j.today : "",
          nowMs: Number.isFinite(serverNow) ? serverNow : 0,
        };
        setResult({ key, state: { kind: "ready", data: loaded } });
        setLastData(loaded);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setResult({ key, state: { kind: "error", denied: false } });
      });
    return () => ctrl.abort();
  }, [hydrated, allowed, adminId, legacyTarget, queryKey, requestKey]);

  // Aralık dışı sayfa → son geçerli sayfa.
  const total = state.kind === "ready" ? state.data.total : 0;
  useEffect(() => {
    if (state.kind !== "ready" || total === 0) return;
    const last = Math.max(1, Math.ceil(total / MEMBER_V2_PAGE_SIZE));
    if (query.page > last) setQuery({ page: last }, "replace");
  }, [state.kind, total, query.page, setQuery]);

  if (!hydrated || legacyTarget) {
    return <main className={styles.root}><div className={styles.page}><p className={styles.muted}>Yükleniyor…</p></div></main>;
  }
  if (!allowed) {
    return (
      <main className={styles.root}>
        <div className={styles.page}>
          <div className={styles.card} style={{ padding: 18 }}>
            <h1 style={{ margin: 0, fontSize: 18 }}>Erişim reddedildi</h1>
            <p className={styles.muted}>Bu sayfa yalnız yöneticilere açıktır.</p>
            <Link href="/" className={styles.linkbtn}>Ana panele dön</Link>
          </div>
        </div>
      </main>
    );
  }

  const pick = (filter: MemberV2Filter) => {
    if (!MEMBER_V2_MORE_FILTERS.some(([k]) => k === filter)) setMoreOpen(false);
    setQuery({ filter, page: 1, role: "expert" });
  };
  const c = data?.counts;
  const dec = data?.decisions;
  const pc = data?.presets;
  const nowMs = data?.nowMs ?? 0;
  const todayIso = data?.today ?? "";

  // Karar gerektirenler (zildeki açık kararlarla AYNI kaynak) — öncelik sırasıyla.
  const decide: [MemberV2Filter, number, string, string][] = dec
    ? ([
        ["prores", dec.pro_talebi, "Pro üyelik talebi", "Ödemeyi doğrula, Pro'ya geçir veya kapat"],
        ["basvuru", dec.basvuru, "Onay bekleyen başvuru", "Deneme veya Pro kararı"],
        ["inceleme", dec.inceleme, "Şüpheli hesap incelemesi", "Risk işareti olan kayıt"],
        ["pay", dec.odeme, "Ödemesi “Gecikti” işaretli Pro", "Ödemeyi doğrula ve kaydet"],
        ["eski", dec.eski_kayit, "Eski kayıt · paket eksik", "Owner kararı gerekir"],
      ] as [MemberV2Filter, number, string, string][]).filter((r) => r[1] > 0)
    : [];
  const LIMIT = 3;
  const shownDecide = attnAll ? decide : decide.slice(0, LIMIT);
  // Yalnız bilgi: ödeme tarihi geçmiş ama “Gecikti” işaretlenmemiş Pro'lar borç sayılmaz → “kontrol”.
  const payDateOnly = c && dec ? Math.max(0, c.pay_check - dec.odeme) : 0;
  const fyi: [MemberV2Filter, number, string][] = c
    ? ([
        ["soon", c.soon, "2 gün içinde bitecek deneme"],
        ["bitti", c.ended, "denemesi biten"],
        ["notstarted", c.not_started, "başlamamış deneme"],
        ["paynext", c.pay_next, "7 gün içinde ödeme"],
        ["pay", payDateOnly, "ödeme tarihi geçen (kontrol)"],
      ] as [MemberV2Filter, number, string][]).filter((r) => r[1] > 0)
    : [];

  const kpis: [string, string, number | null, string, () => void][] = [
    ["today", "Bugün yeni kayıt", c ? c.today : null, "Türkiye saatiyle bugün", () => pick("yeni")],
    ["trial", "Denemede", c ? c.trial : null, c && c.not_started ? `Süresi başlamış · +${c.not_started} başlamamış` : "Süresi başlamış", () => pick("trial")],
    ["pro", "Aktif Pro", c ? c.pro : null, c && c.pro_exempt ? `${c.pro_exempt} ödemeden muaf dahil` : "Ödemeden muaf dahil", () => pick("pro")],
    ["ended", "Denemesi biten", c ? c.ended : null, "Pro'ya geçmemiş", () => pick("bitti")],
    ["waiting", "Karar bekleyen", dec ? dec.total : null, "Yönetim zilindeki turuncu sayı", () => setAttnAll(true)],
  ];

  const activeMore = MEMBER_V2_MORE_FILTERS.find(([k]) => k === query.filter);
  const rows = state.kind === "ready" ? state.data.rows : [];
  const pages = Math.max(1, Math.ceil(total / MEMBER_V2_PAGE_SIZE));
  const from = total ? (query.page - 1) * MEMBER_V2_PAGE_SIZE + 1 : 0;
  const to = Math.min(total, query.page * MEMBER_V2_PAGE_SIZE);
  const todayLabel = todayIso ? fmtDateTr(todayIso) : "";

  return (
    <main className={styles.root} data-members-v2>
      <div className={styles.page}>
        <nav className={styles.topnav} aria-label="Üst gezinme">
          <Link href="/" className={styles.navlink}>Ana Panele Dön</Link>
          <Link href="/admin" className={styles.navlink}>Yönetim Merkezi</Link>
          <span className={styles.grow} />
          <button type="button" className={styles.navlink} onClick={handleLogout}>Çıkış Yap</button>
        </nav>

        <div className={styles.ph}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <h1>Üye Yönetimi</h1>
            <p>{todayLabel ? `${todayLabel} · ` : ""}demo ve test hesapları sayılara dahil değil</p>
          </div>
          <Link href={`${MEMBER_CLASSIC_PATH}?yeni=1`} className={`${styles.btn} ${styles.btnPri}`} data-new-expert>+ Yeni uzman</Link>
        </div>

        <section className={`${styles.card} ${styles.attn}`} aria-labelledby="attn-t" data-attn>
          <header className={styles.attnHead}>
            <h2 id="attn-t">Bugün dikkat</h2>
            <span className={styles.muted} style={{ fontSize: 12.5 }}>
              Karar bekleyen <b className={styles.num} style={{ color: "var(--act)" }} data-attn-total>{dec ? dec.total : "—"}</b>
            </span>
          </header>
          {!data ? (
            <div className={styles.empty}>{state.kind === "error" ? "Veriler okunamadı." : "Yükleniyor…"}</div>
          ) : shownDecide.length ? (
            shownDecide.map(([f, n, t, s]) => (
              <button type="button" key={f} className={styles.attnRow} onClick={() => pick(f)} data-attn-row={f}>
                <span className={styles.big}>{n}</span>
                <span><b>{t}</b><br /><span className={styles.muted} style={{ fontSize: 12.5 }}>{s}</span></span>
                <span className={styles.go}>Gör →</span>
              </button>
            ))
          ) : (
            <div className={styles.okEmpty}>Karar bekleyen iş yok.</div>
          )}
          {decide.length > LIMIT ? (
            <div className={styles.attnMore}>
              <span className={styles.muted}>{attnAll ? "Tüm karar satırları gösteriliyor" : `+${decide.length - LIMIT} karar satırı daha`}</span>
              <button type="button" className={styles.linkbtn} onClick={() => setAttnAll((v) => !v)} data-attn-all>
                {attnAll ? "Daha az göster" : "Tümünü gör"}
              </button>
            </div>
          ) : null}
          {fyi.length ? (
            <div className={styles.fyi} data-fyi>
              <span className={styles.fyiLbl}>Bilgi</span>
              {fyi.map(([f, n, t]) => (
                <button type="button" key={`${f}-${t}`} className={styles.fyiChip} onClick={() => pick(f)}>
                  <b>{n}</b> {t}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.kpis} aria-label="Üyelik göstergeleri">
          {kpis.map(([k, l, v, h, on]) => (
            <button type="button" key={k} className={styles.kpi} onClick={on} data-kpi={k}>
              <div className={styles.kpiL}>{l}</div>
              <div className={styles.kpiV} data-kpi-value>{v ?? "—"}</div>
              <div className={styles.kpiH}>{h}</div>
            </button>
          ))}
        </section>

        <section className={styles.card} aria-labelledby="list-t">
          <div className={styles.ltHead}>
            <h2 id="list-t">
              Üyeler{" "}
              <span className={`${styles.muted} ${styles.num}`} style={{ fontWeight: 600, fontSize: 13 }} data-list-total>
                {state.kind === "ready" ? `${total} kişi` : ""}
              </span>
            </h2>
            <label className={styles.search}>
              <span className={styles.muted} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              </span>
              <span className={styles.sr}>Ad veya e-posta ara</span>
              <input id="member-v2-q" type="search" placeholder="Ad veya e-posta ara" value={searchText} maxLength={120}
                autoComplete="off" onChange={(e) => setSearchText(e.target.value)} />
            </label>
            <label className={styles.sr} htmlFor="member-v2-sort">Sıralama</label>
            <select id="member-v2-sort" className={styles.select} value={query.sort}
              onChange={(e) => setQuery({ sort: e.target.value as MemberV2Sort, page: 1 })}>
              {(Object.keys(MEMBER_V2_SORT_LABELS) as MemberV2Sort[]).map((s) => (
                <option key={s} value={s}>{MEMBER_V2_SORT_LABELS[s]}</option>
              ))}
            </select>
            <button type="button" className={styles.chip} aria-expanded={adv} onClick={() => setAdv((v) => !v)} data-adv-toggle>
              Gelişmiş filtre {adv ? "▴" : "▾"}
            </button>
          </div>

          <div className={styles.presets} role="toolbar" aria-label="Hazır filtreler" data-presets>
            {MEMBER_V2_MAIN_FILTERS.map(([k, l]) => (
              <button type="button" key={k} className={styles.chip} aria-pressed={query.role === "expert" && query.filter === k}
                onClick={() => pick(k)} data-preset={k}>
                {l} <span className={styles.chipN}>{pc ? pc[k] : ""}</span>
              </button>
            ))}
            {activeMore && !moreOpen ? (
              <button type="button" className={styles.chip} aria-pressed="true" title="Filtreyi kaldır" onClick={() => pick("all")} data-active-more>
                {activeMore[1]} <span className={styles.chipN}>{pc ? pc[activeMore[0]] : ""}</span> ✕
              </button>
            ) : null}
            <button type="button" className={styles.chip} aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)} data-more>
              Diğer filtreler {moreOpen ? "▴" : "▾"}
            </button>
            {moreOpen ? (
              <div className={styles.morePanel} data-more-panel>
                {MEMBER_V2_MORE_FILTERS.map(([k, l]) => (
                  <button type="button" key={k} className={styles.chip} aria-pressed={query.role === "expert" && query.filter === k}
                    onClick={() => pick(k)} data-preset={k}>
                    {l} <span className={styles.chipN}>{pc ? pc[k] : ""}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {adv ? (
            <div className={styles.adv} data-adv>
              <label>
                Modül
                <select value={query.module} onChange={(e) => setQuery({ module: e.target.value as MemberModuleFilter, page: 1 })} data-adv-mod>
                  <option value="all">Tümü</option>
                  {MEMBER_FILTER_MODULE_KEYS.map((k) => (
                    <option key={k} value={k}>{ADMIN_MODULE_UI_LABELS[k]} açık olanlar</option>
                  ))}
                </select>
              </label>
              <label>
                Ödeme
                <select value={query.payment} onChange={(e) => setQuery({ payment: e.target.value as MemberV2Payment, page: 1 })} data-adv-pay>
                  {(Object.keys(MEMBER_V2_PAYMENT_LABELS) as MemberV2Payment[]).map((k) => (
                    <option key={k} value={k}>{MEMBER_V2_PAYMENT_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <label>
                Hesap türü
                <select value={query.role} onChange={(e) => setQuery({ role: e.target.value as MemberV2Query["role"], filter: "all", page: 1 })} data-adv-role>
                  <option value="expert">Uzmanlar</option>
                  <option value="admin">Yöneticiler{pc ? ` (${pc.admins})` : ""}</option>
                </select>
              </label>
              <div className={styles.note} style={{ alignSelf: "end" }}>
                Aktivite, güvenlik ve ödeme zamanı filtreleri ile arşiv işlemleri{" "}
                <Link href={MEMBER_CLASSIC_PATH} className={styles.linkbtn} data-classic-link>Ayrıntılı liste</Link> ekranında.
              </div>
            </div>
          ) : null}

          {query.filter === "askida" ? (
            <div className={styles.notice} data-notice="askida">
              Burada yalnız denemesi durdurulmuş hesaplar görünür. Hesap askısı ile arşiv şu an ayrı tutulmuyor; pasife alınan
              onaylı uzmanlar “Arşiv” filtresindedir.
            </div>
          ) : query.filter === "arsiv" ? (
            <div className={styles.notice} data-notice="arsiv">
              Arşiv = onaylı ancak pasife alınmış uzmanlar. Yeniden aktifleştirme ve kalıcı silme için{" "}
              <Link href={`${MEMBER_CLASSIC_PATH}?view=archive`} className={styles.linkbtn}>arşiv işlemleri</Link>.
            </div>
          ) : query.filter === "pay" ? (
            <div className={styles.notice} data-notice="pay">
              Ödeme tarihinin geçmesi borç anlamına gelmez; liste kontrol içindir. Karar sayısına yalnız “Gecikti” işaretli ödemeler girer.
            </div>
          ) : null}

          {state.kind === "error" ? (
            <div className={styles.err} role="alert" data-list-error>
              {state.denied ? "Bu listeyi görme yetkiniz yok." : "Üye listesi şu an okunamadı."}{" "}
              {!state.denied ? <button type="button" className={styles.linkbtn} onClick={() => setReloadTick((n) => n + 1)}>Tekrar dene</button> : null}
            </div>
          ) : state.kind === "loading" && !rows.length ? (
            <div className={styles.empty}>Üyeler yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty} data-list-empty>Bu filtrede üye yok.</div>
          ) : (
            <>
              <div className={styles.tblWrap}>
                <table className={styles.mem}>
                  <thead>
                    <tr><th>Üye</th><th>Aşama</th><th>Süre / tarih</th><th>Modüller</th><th>Son giriş</th><th><span className={styles.sr}>İşlem</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const href = `/admin/users/${encodeURIComponent(r.id)}`;
                      return (
                        <tr key={r.id} className={styles.row} data-row={r.id} onClick={() => router.push(href)}>
                          <td className={styles.who}>
                            <b><Link href={href} onClick={(e) => e.stopPropagation()}>{r.full_name || r.email || "—"}</Link></b>
                            <span>{r.email}</span>
                          </td>
                          <td><Pills row={r} nowMs={nowMs} /></td>
                          <td className={styles.num}>{memberPeriodText(r, todayIso, nowMs)}</td>
                          <td className={styles.mods}><Mods row={r} /></td>
                          <td className={styles.num}>{agoTr(r.last_login_at, nowMs)}</td>
                          <td>
                            <Link href={href} className={`${styles.btn} ${styles.btnSm}`} onClick={(e) => e.stopPropagation()} data-detail-link>
                              Detay
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={styles.cards}>
                {rows.map((r) => (
                  <Link key={r.id} href={`/admin/users/${encodeURIComponent(r.id)}`} className={styles.mcard} data-card={r.id}>
                    <span className={styles.r1}>
                      <span><b>{r.full_name || r.email || "—"}</b><br /><span className={styles.email}>{r.email}</span></span>
                      <Pills row={r} nowMs={nowMs} />
                    </span>
                    <span className={styles.meta}>
                      <span>{memberPeriodText(r, todayIso, nowMs)}</span>
                      <span>Son giriş: {agoTr(r.last_login_at, nowMs)}</span>
                    </span>
                    <span className={styles.mods}><Mods row={r} /></span>
                  </Link>
                ))}
              </div>
              <div className={styles.pager}>
                <span className={styles.num} data-pager>{total ? `${from}–${to} / ${total}` : ""}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`} disabled={query.page <= 1} onClick={() => setQuery({ page: query.page - 1 })}>Önceki</button>
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`} disabled={query.page >= pages} onClick={() => setQuery({ page: query.page + 1 })} data-next>Sonraki</button>
                </span>
              </div>
            </>
          )}
        </section>

        <details className={`${styles.card} ${styles.reports}`}>
          <summary>
            Raporlar <span className={styles.muted} style={{ fontWeight: 500 }}>— kullanım, ödeme ve güvenlik istatistikleri (Yönetim Özeti)</span>
          </summary>
          <div className={styles.reportsBody}>
            <MemberOverviewPanel
              adminId={adminId}
              reloadKey={reloadTick}
              query={DEFAULT_MEMBER_LIST_QUERY}
              onSelect={(target) => {
                const qs = memberListQueryToSearch({ ...DEFAULT_MEMBER_LIST_QUERY, ...OVERVIEW_TARGET_QUERY[target] });
                router.push(qs ? `${MEMBER_CLASSIC_PATH}?${qs}` : MEMBER_CLASSIC_PATH);
              }}
            />
          </div>
        </details>
      </div>
    </main>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<main className={styles.root}><div className={styles.page}><p className={styles.muted}>Yükleniyor…</p></div></main>}>
      <MembersV2Content />
    </Suspense>
  );
}
