"use client";

/**
 * FAZ 14 — KURGUSAL EĞİTİM HARİTASI formu. Tamamen kurgusal doğum bilgisi + eğitim alanları + zorunlu kurgusal beyan.
 * Danışan izni / dosya / imza İSTENMEZ; danışan ve normal HD arşivi kaydı OLUŞMAZ. Hesap sunucuda MEVCUT Human Design
 * motoruyla yapılır (normal analizle aynı ücret / kota kuralları); sonuç yalnız eğitmenin özel eğitim arşivine yazılır.
 */
import Link from "next/link";
import { useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { HdBirthDateInput } from "@/app/human-design/components/HdBirthDateInput";
import { HdBirthTimeInput } from "@/app/human-design/components/HdBirthTimeInput";
import { HdBirthLocationPicker, type HdPickedLocation } from "@/app/human-design/components/HdBirthLocationPicker";
import {
  PRIV_CATEGORIES, PRIV_CATEGORY_LABEL, PRIV_FICTIONAL_DECLARATION_TEXT, PRIV_FICTIONAL_DECLARATION_VERSION, type PrivCategory,
} from "@/lib/human-design/education/private/privateContract";
import { privCall } from "./privApi";

export function FictionalForm({ onDone }: { onDone: (id: string) => void }) {
  const [f, setF] = useState({ title: "", alias: "Kurgusal kişi", category: "genel" as PrivCategory, notes: "", date: "", time: "" });
  const [loc, setLoc] = useState<HdPickedLocation | null>(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; itemId?: string } | null>(null);
  const missing = [
    !f.title.trim() && "Eğitim başlığı",
    !f.date && "Kurgusal doğum tarihi",
    !f.time && "Kurgusal doğum saati",
    !loc && "Doğum yeri (listeden)",
    !accept && "Kurgusal beyan onayı",
  ].filter(Boolean) as string[];

  async function submit() {
    if (missing.length || busy || !loc) return;
    setBusy(true); setErr(null);
    const r = await privCall<{ id: string; itemId?: string }>("trainer", "/api/hd/education/private/fictional", { method: "POST", body: {
      title: f.title.trim(), aliasLabel: f.alias.trim() || "Kurgusal kişi", category: f.category, teachingNotes: f.notes.trim() || null,
      birthDate: f.date, birthTime: f.time, locationRef: loc.id, declarationAccepted: accept, declarationVersion: PRIV_FICTIONAL_DECLARATION_VERSION,
    } });
    setBusy(false);
    if (r.ok && r.body.id) { onDone(r.body.id); return; }
    if (!r.ok && r.code === "DUPLICATE") {
      const itemId = typeof r.data?.itemId === "string" ? r.data.itemId : undefined;
      setErr({ text: "Bu kurgusal doğum bilgileriyle oluşturduğunuz bir eğitim haritası zaten var; ikinci kayıt oluşturulmadı.", itemId });
      return;
    }
    setErr({ text: r.ok ? "Sunucu kayıt kimliği döndürmedi; kayıt oluşturulmadı." : r.error });
  }

  return (
    <section className={base.panel} data-edu-fictional-form>
      <h2 className={base.h2}>Kurgusal Eğitim Haritası</h2>
      <p className={base.lead}>
        Tamamen kurgusal bir doğum tarihi, saati ve yeri girin. Harita Yaşam Sistemi&apos;nin Human Design motoruyla hesaplanır ve yalnız
        sizin özel eğitim arşivinize eklenir. <b>Danışan izni, imza veya belge gerekmez</b>; danışan kaydı oluşturulmaz.
      </p>
      <div className={oz.form2}>
        <label className={oz.field}>Eğitim başlığı
          <input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ör. Sakral otorite örneği" data-edu-fic-title />
        </label>
        <label className={oz.field}>Görünen ad (kurgusal)
          <input value={f.alias} maxLength={80} onChange={(e) => setF({ ...f, alias: e.target.value })} data-edu-fic-alias />
        </label>
        <label className={oz.field}>Kategori
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PrivCategory })} data-edu-fic-category>
            {PRIV_CATEGORIES.map((c) => <option key={c} value={c}>{PRIV_CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className={oz.field} htmlFor="edu-fic-date">Kurgusal doğum tarihi
          <HdBirthDateInput id="edu-fic-date" value={f.date} onChange={(v) => setF({ ...f, date: v })} className={base.input} disabled={busy} />
        </label>
        <label className={oz.field} htmlFor="edu-fic-time">Kurgusal doğum saati
          <HdBirthTimeInput id="edu-fic-time" value={f.time} onChange={(v) => setF({ ...f, time: v })} className={base.input} disabled={busy} />
        </label>
        <div className={oz.field}>Doğum yeri (listeden seçin)
          <HdBirthLocationPicker id="edu-fic-place" value={loc} onChange={setLoc} disabled={busy} />
        </div>
        <label className={`${oz.field} ${oz.wide}`}>Anlatım notları (yalnız siz ve sistem sahibi)
          <textarea value={f.notes} maxLength={20000} rows={4} onChange={(e) => setF({ ...f, notes: e.target.value })} data-edu-fic-notes />
        </label>
      </div>
      <label className={oz.declare} data-edu-fic-declare>
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} data-edu-fic-accept />
        <span>{PRIV_FICTIONAL_DECLARATION_TEXT}</span>
      </label>
      {missing.length && !busy ? <p className={oz.hint} data-edu-fic-missing>Eksik: {missing.join(" · ")}</p> : null}
      {err ? (
        <div className={`${oz.result} ${err.itemId ? oz.resultWarn : oz.resultBad}`} role="alert" data-edu-fic-error>
          <span>{err.text}{err.itemId ? <> <Link className={base.ext} href={`/human-design/egitim-merkezi/ozel/${err.itemId}`}>Mevcut kaydı aç</Link></> : null}</span>
        </div>
      ) : null}
      <div className={base.actions}>
        <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={submit} disabled={busy || missing.length > 0} data-edu-fic-submit>
          {busy ? "Hesaplanıyor…" : "Haritayı Hesapla ve Arşivime Ekle"}
        </button>
      </div>
      <p className={oz.hint}>Hesaplama normal Human Design analiziyle aynı kurallara ve hesap limitlerine tabidir. Aynı kurgusal bilgilerle ikinci kez eklenmez.</p>
    </section>
  );
}
