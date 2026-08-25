"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  KupaShell,
  kupaBtnGhost,
  kupaBtnPrimary,
  kupaCard,
  kupaInput,
} from "../../components/KupaShell";
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

type NoteField = "notes" | "source_note";

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
    noteDialog === "notes"
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
      actions={
        <Link href={GUIDE_HREF} className={kupaBtnGhost}>
          ← Rehbere Dön
        </Link>
      }
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-2xl">
        <div className={kupaCard}>
          <div className="grid grid-cols-1 gap-4">
            {/* Rahatsızlık Adı */}
            <div>
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

            {/* Kategori */}
            <div>
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

            {/* Açıklama */}
            <div>
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

            {/* Profesyonel / Çalışma Notu — büyük editör (kart) */}
            <NoteFieldCard
              label="Profesyonel / Çalışma Notu"
              value={notes}
              emptyHint="Not eklemek için tıklayın"
              onOpen={() => setNoteDialog("notes")}
            />

            {/* Serbest Kaynak Notu — büyük editör (kart) */}
            <NoteFieldCard
              label="Serbest Kaynak Notu"
              value={sourceNote}
              emptyHint="Kaynak notu eklemek için tıklayın"
              helper="Yapısal kaynaklandırma için (kaydettikten sonra) rehberdeki Kaynaklar bölümünü kullanın. Bu alan yalnız serbest/editöryal kaynak notu içindir."
              onOpen={() => setNoteDialog("source_note")}
            />
          </div>

          <div className="mt-5 flex items-center gap-2">
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
    <div>
      <span className={labelCls}>{label}</span>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
      >
        {has ? (
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-slate-700">
              {value.trim().length} karakterlik not eklendi
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-slate-400">
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
