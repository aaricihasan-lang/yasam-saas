"use client";

/**
 * Hazır Eğitim Haritaları — OWNER aile incelemesi (owner kararı 29.10.2026).
 * Kaynakla doğrulanmış aile grubundaki seçili kişilerin KAYITLI BodyGraph'ları tek sayfada, aynı anda; ekran genişliğine göre
 * yan yana / alt alta. Her harita ayrıca büyütülür (Tam Ekran İncele). Yeni ilişki hesabı (Connection / Penta) YOK.
 * Erişim: üst layout katı owner; veri her istekte requireEducationOwner.
 */

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { premiumFontVars } from "@/app/_premium/fonts";
import css from "@/app/_premium/hd-education/egitimYonetim.module.css";
import ov from "../../ownerViews.module.css";
import { ownerGet } from "../../ownerApi";
import { EduBodygraphViewer } from "../../EduBodygraphViewer";
import { readListReturn } from "../../listState";
import { eduFamilyByKey } from "@/lib/human-design/education/educationFamilies";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { EduInventoryRow, EduOwnerSubjectDetail } from "@/lib/human-design/education/educationContract";

type Member = { id: string; naturalKey: string; name: string; role: string };

function FamilyCompare() {
  const params = useParams<{ aile: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const family = eduFamilyByKey(String(params?.aile ?? ""));
  const [members, setMembers] = useState<Member[] | null>(null);
  const [details, setDetails] = useState<Record<string, EduOwnerSubjectDetail | "err">>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!family) return;
    let live = true;
    void ownerGet<{ rows: EduInventoryRow[] }>("/api/admin/hd/education/subjects").then((r) => {
      if (!live) return;
      if (!r.ok) { setErr(r.error); return; }
      const byKey = new Map(r.data.rows.map((x) => [x.naturalKey, x]));
      // Yalnız kayıtta bulunan üyeler (uydurma yok).
      setMembers(family.members.flatMap((m) => { const x = byKey.get(m.naturalKey); return x ? [{ id: x.id, naturalKey: m.naturalKey, name: x.displayName, role: m.role }] : []; }));
    });
    return () => { live = false; };
  }, [family]);

  const selected = useMemo(() => {
    if (!members) return [];
    const want = (sp.get("sec") ?? "").split(",").filter(Boolean);
    const pick = want.length ? members.filter((m) => want.includes(m.id)) : members;
    return pick.length ? pick : members;
  }, [members, sp]);

  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const m of selected) {
      if (requested.current.has(m.id)) continue;
      requested.current.add(m.id);
      void ownerGet<EduOwnerSubjectDetail>(`/api/admin/hd/education/subjects/${m.id}`).then((r) => {
        setDetails((d) => ({ ...d, [m.id]: r.ok ? r.data : "err" }));
      });
    }
  }, [selected]);

  if (!family) return <p className={css.err} role="alert">Aile grubu bulunamadı.</p>;
  if (err) return <p className={css.err} role="alert">{err}</p>;
  const nameOf = (k: string) => members?.find((m) => m.naturalKey === k)?.name ?? null;
  return (
    <>
      <div className={ov.backBar}>
        <button type="button" className={ov.backBtn} onClick={() => router.push(readListReturn())} data-edu-back>← Listeye dön</button>
        <span className={ov.crumb}>Hazır Eğitim Haritaları / {family.title}</span>
      </div>
      <section className={css.panel} aria-labelledby="fam-title" data-edu-family-page={family.key}>
        <h2 id="fam-title" className={css.h2}>{family.title} — {selected.length === (members?.length ?? 0) ? "ailenin tamamı" : "seçili kişiler"}</h2>
        {family.links.map((l) => {
          const a = nameOf(l.from); const b = nameOf(l.to);
          return a && b ? <p key={`${l.from}-${l.to}`} className={ov.relLine} data-edu-family-link>{a} ⟷ {b} <span>· {l.label}</span></p> : null;
        })}
        <p className={ov.famNote}>Doğrulama: {family.evidence} Bu sayfa yeni ilişki hesabı yapmaz; kayıtlı bireysel haritalar yan yana gösterilir.</p>
        {members ? (
          <div className={ov.famActions}>
            {members.map((m) => (
              <Link key={m.id} className={ov.famBtn} href={`/admin/hd-egitim-haritalari/aile/${family.key}?sec=${m.id}`} aria-current={selected.length === 1 && selected[0].id === m.id ? "page" : undefined}>Yalnız {m.name} ({m.role})</Link>
            ))}
            <Link className={`${ov.famBtn} ${ov.famBtnMain}`} href={`/admin/hd-egitim-haritalari/aile/${family.key}`}>Ailenin Tamamını İncele</Link>
          </div>
        ) : null}
      </section>
      {members ? (
        <div className={ov.cmpGrid} data-edu-family-grid={selected.length}>
          {selected.map((m) => {
            const d = details[m.id];
            return (
              <article key={m.id} className={ov.cmpCard} data-edu-family-member={m.naturalKey}>
                <div className={ov.cmpHead}>
                  <h3 className={ov.cmpName}>{m.name} <span className={ov.famRole}>{m.role}</span></h3>
                  <Link className={ov.famOpen} href={`/admin/hd-egitim-haritalari/kisi/${m.id}`}>Ayrıntılı incele →</Link>
                </div>
                {!d ? <p className={css.empty}>Harita yükleniyor…</p>
                  : d === "err" ? <p className={css.err}>Harita okunamadı.</p>
                  : d.preview ? <EduBodygraphViewer result={d.preview.result as unknown as HdComputedChart} title={`${m.name} (${m.role})`} compact={selected.length > 1} />
                  : <p className={css.empty}>Bu kişi için kayıtlı harita yok.</p>}
              </article>
            );
          })}
        </div>
      ) : <p className={css.empty}>Yükleniyor…</p>}
    </>
  );
}

export default function EducationOwnerFamilyPage() {
  return (
    <main className={`${css.page} ${premiumFontVars}`}>
      <div className={css.inner}>
        <header className={css.hero}>
          <p className={css.eyebrow}>YAŞAM SİSTEMİ · OWNER YÖNETİMİ</p>
          <h1 className={css.title}>Aile Haritaları</h1>
          <p className={css.sub}>Kaynakla doğrulanmış aile bağları — kayıtlı haritalar tek sayfada</p>
        </header>
        <Suspense fallback={<p className={css.empty}>Yükleniyor…</p>}><FamilyCompare /></Suspense>
      </div>
    </main>
  );
}
