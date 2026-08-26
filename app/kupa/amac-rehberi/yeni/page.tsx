"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KupaShell, kupaBtnGhost, kupaBtnPrimary, kupaEdgeCard, kupaInput } from "../../components/KupaShell";
import { BigNoteEditorDialog } from "../../components/BigNoteEditorDialog";
import { createTopic, type CuppingTopic } from "../../lib/api";

/**
 * YENİ RAHATSIZLIK KAYDI — AYRI SAYFA.
 *
 * Amaç: "+ Yeni Kayıt" akışını okuma ekranından tamamen ayırmak. Bu sayfada mevcut
 * rahatsızlık detayı / kaynak listeleri / ilişkili noktalar / teknik edit GÖRÜNMEZ;
 * yalnız yeni kayıt formu vardır. Uzun not alanları (Profesyonel/Serbest Kaynak Notu)
 * form içinde küçük textarea DEĞİL; tıklanabilir kart + büyük editör (dialog) olarak
 * yönetilir; metin parent form state'inde tutulur ve asıl "Kaydet" ile create API'ye gider.
 *
 * DÜZEN (responsive):
 *   - Desktop (≥1024px): geniş premium çalışma ekranı — kart ekranı kullanır; alanlar
 *     grid'e geçer (Ad geniş + Kategori dar / Açıklama INLINE textarea / iki not kartı yan yana).
 *   - Mobile & tablet (<1024px): kart viewport kenarlarına GERÇEK sıfır yaslanır (edge-to-edge,
 *     köşesiz). KupaShell `fullBleedBelowLg` shell padding'i sıfırlar — negatif-margin HACK YOK.
 *     Açıklama dahil uzun metin alanları küçük textarea DEĞİL; büyük (full-screen) editör açar.
 *   Navigasyon: sağ üstte özel geri/kapat butonu YOK — kullanıcı tarayıcının ileri/geri
 *   tuşlarını kullanır; breadcrumb bilgilendirme amaçlıdır (özel geri aksiyonu üretmez).
 *
 * ALANLAR (mevcut şema — değişmez): title, category, description, notes, source_note.
 */

const TOPIC_CATEGORY_OPTIONS = [
  "Kas & İskelet",
  "Baş & Boyun",
  "Sindirim",
  "Solunum",
  "Dolaşım",
  "Kadın Sağlığı",
  "Genel / Koruyucu",
  "Psikolojik / Duygusal",
];
const CATEGORY_OTHER = "__other__";

const labelCls = "mb-1 block text-[11px] font-semibold text-slate-600";
const helperCls = "mt-1 text-[10.5px] leading-snug text-slate-400";
const GUIDE_HREF = "/kupa/amac-rehberi";

/** Uzun metin alanları için büyük (full-screen <1024px) editörle yönetilen alanlar. */
type NoteField = "description" | "notes" | "source_note";

export default function YeniRahatsizlikPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [categorySelect, setCategorySelect] = useState("");
  const [categoryOther, setCategoryOther] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceNote, setSourceNote] = useState("");

  const [noteDialog, setNoteDialog] = useState<NoteField | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = useMemo(
    () => (categorySelect === CATEGORY_OTHER ? categoryOther.trim() : categorySelect.trim()),
    [categorySelect, categoryOther],
  );

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Rahatsızlık adı gerekli.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Partial<CuppingTopic> = {
        title: title.trim(),
        category: category || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        source_note: sourceNote.trim() || null,
      };
      const created = await createTopic(body);
      // Başarılı: yeni kaydı seçili şekilde rehber okuma ekranına döndür.
      // (Demo hesapta topic null döner → generic rehbere dön.)
      if (created && created.id) {
        router.push(`${GUIDE_HREF}?topic=${encodeURIComponent(created.id)}`);
      } else {
        router.push(GUIDE_HREF);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt oluşturulamadı.");
      setSaving(false);
    }
  };

  const noteDialogConfig =
    noteDialog === "description"
      ? {
          title: "Açıklama",
          value: description,
          placeholder: "Bu amacın/konunun genel açıklaması.",
          onSave: (t: string) => {
            setDescription(t);
            setNoteDialog(null);
          },
        }
      : noteDialog === "notes"
      ? {
          title: "Profesyonel / Çalışma Notu",
          value: notes,
          placeholder: "Bu rahatsızlık için uzman çalışma notun (iç kullanım)…",
          onSave: (t: string) => {
            setNotes(t);
            setNoteDialog(null);
          },
        }
      : noteDialog === "source_note"
        ? {
            title: "Serbest Kaynak Notu",
            value: sourceNote,
            placeholder: "Serbest / editöryal kaynak notu (yapısal atıf değil)…",
            onSave: (t: string) => {
              setSourceNote(t);
              setNoteDialog(null);
            },
          }
        : null;

  return (
    <KupaShell
      title="Yeni Rahatsızlık Kaydı"
      subtitle="Yeni bir rahatsızlık/amaç kaydı oluştur. Kaydettikten sonra bölge ilişkilerini, kaynakları ve notları rehber ekranından ekleyebilirsin."
      breadcrumb={[
        { label: "Amaç / Rahatsızlık Rehberi", href: GUIDE_HREF },
        { label: "Yeni Kayıt" },
      ]}
      fullBleedBelowLg
    >
      {error ? (
        <div className="mb-3 px-4 sm:px-6 lg:px-0">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </div>
        </div>
      ) : null}

      <div className="w-full">
        <div className={kupaEdgeCard}>
          <div className="grid grid-cols-1 gap-4 lg:gap-6">
            {/* Satır 1: Rahatsızlık Adı (geniş) + Kategori (dar) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
              <div className="lg:col-span-2">
                <label className={labelCls} htmlFor="new-title">
                  Rahatsızlık Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn. Sık İdrara Çıkma"
                  className={kupaInput}
                  autoFocus
                />
              </div>
              <div className="lg:col-span-1">
                <label className={labelCls} htmlFor="new-category">
                  Kategori
                </label>
                <select
                  id="new-category"
                  value={categorySelect}
                  onChange={(e) => setCategorySelect(e.target.value)}
                  className={kupaInput}
                >
                  <option value="">— seçilmedi —</option>
                  {TOPIC_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={CATEGORY_OTHER}>Diğer (serbest)…</option>
                </select>
                {categorySelect === CATEGORY_OTHER ? (
                  <input
                    value={categoryOther}
                    onChange={(e) => setCategoryOther(e.target.value)}
                    placeholder="Kategori adı"
                    className={`${kupaInput} mt-1.5`}
                  />
                ) : null}
              </div>
            </div>

            {/* Satır 2: Açıklama — full width. Mobile/tablet (<1024px): büyük (full-screen)
                editör kartı; desktop (>=1024px): beğenilen INLINE textarea. Aynı `description`
                state — duplicate alan YOK. */}
            <div>
              {/* Mobile/tablet: büyük editör tetikleyicisi */}
              <div className="lg:hidden">
                <NoteFieldCard
                  label="Açıklama"
                  value={description}
                  emptyHint="Açıklama eklemek için tıklayın"
                  onOpen={() => setNoteDialog("description")}
                />
              </div>
              {/* Desktop: inline textarea (korunur) */}
              <div className="hidden lg:block">
                <label className={labelCls} htmlFor="new-desc">
                  Açıklama
                </label>
                <textarea
                  id="new-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Bu amacın/konunun genel açıklaması."
                  className={kupaInput}
                />
              </div>
            </div>

            {/* Satır 3: iki büyük not kartı (desktop'ta yan yana, mobilde alt alta) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
              <NoteFieldCard
                label="Profesyonel / Çalışma Notu"
                value={notes}
                emptyHint="Not eklemek için tıklayın"
                onOpen={() => setNoteDialog("notes")}
              />
              <NoteFieldCard
                label="Serbest Kaynak Notu"
                value={sourceNote}
                emptyHint="Kaynak notu eklemek için tıklayın"
                helper="Yapısal kaynaklandırma için (kaydettikten sonra) rehberdeki Kaynaklar bölümünü kullanın. Bu alan yalnız serbest/editöryal kaynak notu içindir."
                onOpen={() => setNoteDialog("source_note")}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className={kupaBtnPrimary}
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <Link
              href={GUIDE_HREF}
              className={kupaBtnGhost}
              aria-disabled={saving}
              onClick={(e) => {
                if (saving) e.preventDefault();
              }}
            >
              Vazgeç
            </Link>
          </div>
        </div>
      </div>

      {noteDialogConfig ? (
        <BigNoteEditorDialog
          open
          title={noteDialogConfig.title}
          value={noteDialogConfig.value}
          placeholder={noteDialogConfig.placeholder}
          onSave={noteDialogConfig.onSave}
          onCancel={() => setNoteDialog(null)}
        />
      ) : null}
    </KupaShell>
  );
}

/** Tıklanabilir sade not kartı — küçük textarea yerine büyük editörü açar. */
function NoteFieldCard({
  label,
  value,
  emptyHint,
  helper,
  onOpen,
}: {
  label: string;
  value: string;
  emptyHint: string;
  helper?: string;
  onOpen: () => void;
}) {
  const has = value.trim().length > 0;
  return (
    <div className="flex flex-col">
      <span className={labelCls}>{label}</span>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 lg:min-h-[112px] lg:items-start lg:py-4"
      >
        {has ? (
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-slate-700">
              {value.trim().length} karakterlik not eklendi
            </span>
            <span className="mt-0.5 line-clamp-3 block text-[11.5px] leading-snug text-slate-400">
              {value.trim()}
            </span>
          </span>
        ) : (
          <span className="text-[13px] text-slate-400">{emptyHint}</span>
        )}
        <span className="shrink-0 text-[11px] font-semibold text-amber-700">
          {has ? "Düzenle" : "Ekle"}
        </span>
      </button>
      {helper ? <p className={helperCls}>{helper}</p> : null}
    </div>
  );
}
