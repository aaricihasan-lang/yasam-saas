"use client";

/**
 * Şifa Rehberi V2 — "Eski Rehber Kayıtları" (SALT-OKUNUR).
 * V2 açıkken tenant'ın V1 (healing_guides) kayıtlarını gösterir; V1'e YAZMAZ, V2'ye KOPYALAMAZ.
 * Veri yalnız V1'in MEVCUT okuma uçlarından gelir (GET /api/sifa-rehberi/guides, GET /guides/[id],
 * POST /photos/signed-urls = imzalı okuma): requireModuleAccess + tenant SUNUCUDAN — yeni sunucu yüzeyi yok.
 * Bu bileşen yazma/silme fonksiyonu içe aktarmaz. Kayıt yoksa hiçbir şey çizmez.
 * Demo hesap: V1 detay ekranıyla AYNI koruma — ad/kategori görünür, içerik DemoBlur ile.
 */
import { useEffect, useMemo, useState } from "react";
import {
  fetchHealingGuideDetail,
  fetchHealingGuideList,
  getHealingGuideSectionDisplayTitle,
  HEALING_SECTION_DISPLAY,
  type HealingGuideDetail,
  type HealingGuideListRow,
} from "@/lib/sifa-rehberi/healingGuideLiveData";
import { fetchSifaPhotoSignedUrls } from "@/lib/sifa-rehberi/stonePhotoClient";
import { TOPICS } from "@/lib/sifa-rehberi/topicTree";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { Modal } from "@/components/sifa-rehberi-v2/Modal";

const LEGACY_LABELS: { key: string; label: string; icon: string }[] = TOPICS.filter((t) => t.legacyKey).map((t) => ({
  key: t.legacyKey as string,
  label: t.label,
  icon: t.icon,
}));

type ImageItem = { id?: string; file_name?: string; caption?: string | null };

export default function LegacyGuides() {
  const [rows, setRows] = useState<HealingGuideListRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const isDemo = readYasamUser()?.is_demo_account === true;

  useEffect(() => {
    let alive = true;
    void fetchHealingGuideList("").then((r) => {
      if (alive && !r.error) setRows(r.rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!rows.length) return null;
  return (
    <section className="mt-8" data-testid="legacy-guides">
      <h3 className="mb-1 text-[12px] font-black uppercase tracking-[0.14em] text-amber-800">📜 Eski Rehber Kayıtları ({rows.length})</h3>
      <p className="mb-3 text-[12.5px] font-medium text-slate-500">Önceki Şifa Rehberi&apos;nden · salt-okunur · değiştirilemez.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpenId(r.id)}
            className="rounded-[22px] border border-amber-100 bg-amber-50/60 p-4 text-left ring-1 ring-amber-100 transition hover:-translate-y-0.5 hover:ring-amber-300"
            data-testid="legacy-card"
            data-guide-id={r.id}
          >
            <span className="inline-block rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-black text-white">Eski rehber · salt-okunur</span>
            <span className="mt-2 block break-words text-[18px] font-black uppercase leading-6 text-slate-950">{r.name}</span>
            {r.category ? <span className="mt-1 block text-[12.5px] font-semibold text-slate-500">{r.category}</span> : null}
            <span className="mt-3 block text-[13px] font-black text-amber-800">Oku →</span>
          </button>
        ))}
      </div>
      {openId ? <LegacyGuideReader id={openId} isDemo={isDemo} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}

function LegacyGuideReader({ id, isDemo, onClose }: { id: string; isDemo: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<HealingGuideDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void fetchHealingGuideDetail("", id).then((r) => {
      if (!alive) return;
      if (r.detail) setDetail(r.detail);
      else setError(r.notFound ? "Kayıt bulunamadı." : (r.error ?? "Kayıt yüklenemedi."));
    });
    if (!isDemo) {
      void fetchSifaPhotoSignedUrls(id).then((u) => {
        if (alive) setUrls(u.byId);
      });
    }
    return () => {
      alive = false;
    };
  }, [id, isDemo]);

  const sections = useMemo(() => {
    if (!detail) return [];
    const typeLabel = new Map(HEALING_SECTION_DISPLAY.map((d) => [d.type as string, d.label]));
    return detail.sections
      .filter((s) => [s.note, s.expert_note, s.attention, s.source].some((v) => v && v.trim()))
      .map((s) => ({ s, group: typeLabel.get(s.section_type) ?? s.section_type, title: getHealingGuideSectionDisplayTitle(s) }));
  }, [detail]);
  const legacy = detail ? LEGACY_LABELS.filter((l) => detail.guide.legacy[l.key]?.trim()) : [];
  const images = ((detail?.guide.images ?? []) as ImageItem[]).filter((i) => i.id && urls[i.id]);

  return (
    <Modal title={detail?.guide.name ?? "Eski rehber"} subtitle="Eski rehber kaydı · salt-okunur" onClose={onClose} wide testId="legacy-modal">
      <div data-testid="legacy-reader" className="space-y-4 text-[14px] leading-6 text-slate-800">
        {error ? <p className="font-semibold text-rose-700">{error}</p> : null}
        {!detail && !error ? <p className="text-slate-500">Yükleniyor…</p> : null}
        {detail ? (
          <>
            {detail.guide.category ? <p className="text-[13px] font-semibold text-slate-500">Kategori: {detail.guide.category}</p> : null}
            <DemoBlur isProtected={isDemo}>
              <div className="space-y-4">
                {detail.guide.symptoms ? <Field title="Belirtiler" text={detail.guide.symptoms} /> : null}
                {legacy.map((l) => (
                  <Field key={l.key} title={`${l.icon} ${l.label}`} text={detail.guide.legacy[l.key] ?? ""} />
                ))}
                {sections.map(({ s, group, title }) => (
                  <div key={s.id} className="rounded-xl border border-slate-100 bg-white p-3" data-testid="legacy-section">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{group}</p>
                    <p className="font-black text-slate-900">{title}</p>
                    {s.note ? <p className="mt-1 whitespace-pre-wrap">{s.note}</p> : null}
                    {s.expert_note ? <p className="mt-1 whitespace-pre-wrap"><b>Uzman notu:</b> {s.expert_note}</p> : null}
                    {s.attention ? <p className="mt-1 whitespace-pre-wrap"><b>Dikkat:</b> {s.attention}</p> : null}
                    {s.source ? <p className="mt-1 text-[12.5px] text-slate-500">Kaynak: {s.source}</p> : null}
                  </div>
                ))}
                {images.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="legacy-images">
                    {images.map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- imzalı kısa ömürlü URL
                      <img key={i.id} src={urls[i.id as string]} alt={i.caption ?? i.file_name ?? "Görsel"} className="aspect-square w-full rounded-xl object-cover" />
                    ))}
                  </div>
                ) : null}
                {!legacy.length && !sections.length && !detail.guide.symptoms ? <p className="text-slate-500">Bu kayıtta içerik yok.</p> : null}
              </div>
            </DemoBlur>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function Field({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <p className="font-black text-slate-900">{title}</p>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
