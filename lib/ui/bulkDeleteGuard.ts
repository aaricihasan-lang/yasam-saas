/**
 * Sistem geneli TOPLU SİLME güvenlik standardı — SAF (pure), test edilebilir çekirdek.
 *
 * HASAN HOCA'NIN NİHAİ KURALI:
 *   - 1–2 kayıt: mevcut tekli/çift silme onayı korunur (en az bir açık destructive onay).
 *   - 3 VEYA DAHA FAZLA kayıt: en az 3 AYRI açık onay aşaması zorunlu.
 *   - "TÜMÜNÜ SİL": kayıt sayısı ne olursa olsun en az 3 ayrı onay aşaması zorunlu.
 *
 * Aşamalar (her biri AYRI pencere; birinin altına gizlenmiş ikinci alan YOK):
 *   1) Açık uyarı — "X kayıt kalıcı olarak silinecek. Bu işlem geri alınamaz." → "Devam Et"
 *   2) Elle doğrulama — "X KAYDI SİL" / "TÜMÜNÜ SİL" ifadesi birebir yazılmadan ilerlenmez
 *   3) Son onay — "Son Onay — Bu işlem geri alınamaz." + sayı tekrar → "Kalıcı Olarak Sil"
 * Üçüncü onay verilmeden çağıran gerçek DELETE isteğini GÖNDERMEZ (fonksiyon false döner).
 */

/** 3+ kayıt toplu silmede 3 aşamalı onay zorunludur. */
export const BULK_DELETE_THRESHOLD = 3;

export const BULK_DELETE_ALL_PHRASE = "TÜMÜNÜ SİL";

/**
 * I18N-F1 — 3 aşamalı akışın ekran metinleri. Kontrol akışı (aşama sayısı, eşik, doğrulama kuralı) bu
 * metinlerden BAĞIMSIZDIR; yalnız görünen metin ve yazılacak ifade dile göre değişir. Varsayılan Türkçe
 * metinler (TR_BULK_DELETE_TEXTS) bugünkü ifadelerle BİREBİR aynıdır.
 */
export type BulkDeleteTexts = {
  phrase: (count: number) => string;
  deleteAllPhrase: string;
  defaultNoun: string;
  scope: (count: number, noun: string, deleteAll: boolean) => string;
  verbDelete: string;
  verbRemove: string;
  warnIrreversible: string;
  warnScope: string;
  stage1TitleAll: string;
  stage1Title: string;
  continueText: string;
  stage2Title: string;
  stage2Message: (phrase: string) => string;
  requireLabel: (phrase: string) => string;
  stage3TitleIrreversible: string;
  stage3Title: string;
  stage3MessageIrreversible: (scope: string) => string;
  stage3Message: (scope: string) => string;
  confirmIrreversible: (count: number) => string;
  confirm: (count: number) => string;
  cancelText: string;
};

/** Bu silme 3 aşamalı güvenlik akışı gerektiriyor mu? */
export function requiresBulkDeleteGuard(count: number, deleteAll = false): boolean {
  if (deleteAll) return true;
  return Number.isFinite(count) && count >= BULK_DELETE_THRESHOLD;
}

/** Aşama 2'de kullanıcının birebir yazması gereken ifade. */
export function bulkDeletePhrase(count: number, deleteAll = false, texts: BulkDeleteTexts = TR_BULK_DELETE_TEXTS): string {
  return deleteAll ? texts.deleteAllPhrase : texts.phrase(count);
}

/**
 * Doğrulama ifadesi karşılaştırması.
 *
 * Bilinçli ve kullanıcıya AÇIKÇA söylenen kural: büyük/küçük harf ve Türkçe ı/İ ↔ i/I farkı
 * önemsizdir (Türkçe olmayan klavyede "3 kaydi sil" de kabul edilir); SAYI ve kelimeler birebir
 * olmalıdır. Baş/son boşluk ve çoklu boşluk yok sayılır.
 */
export function normalizeBulkPhrase(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I");
}

export function bulkPhraseMatches(typed: string, expected: string): boolean {
  if (!expected) return false;
  return normalizeBulkPhrase(typed) === normalizeBulkPhrase(expected);
}

export const BULK_PHRASE_HINT = "Büyük/küçük harf ve ı/i farkı önemsizdir; sayı ve kelimeler aynen yazılmalıdır.";

/** Bugünkü Türkçe metinler (varsayılan; davranış ve metin birebir korunur). */
export const TR_BULK_DELETE_TEXTS: BulkDeleteTexts = {
  phrase: (count) => `${count} KAYDI SİL`,
  deleteAllPhrase: BULK_DELETE_ALL_PHRASE,
  defaultNoun: "kayıt",
  scope: (count, noun, deleteAll) => (deleteAll ? `TÜM ${count} ${noun}` : `${count} ${noun}`),
  verbDelete: "kalıcı olarak silinecek",
  verbRemove: "kaldırılacak",
  warnIrreversible: "Bu işlem geri alınamaz.",
  warnScope: "Lütfen kapsamı kontrol edin.",
  stage1TitleAll: "Tümünü Sil — Adım 1/3",
  stage1Title: "Toplu Silme — Adım 1/3",
  continueText: "Devam Et",
  stage2Title: "Doğrulama — Adım 2/3",
  stage2Message: (phrase) => `Yanlışlıkla toplu silmeyi önlemek için aşağıdaki ifadeyi yazın:\n\n${phrase}`,
  requireLabel: (phrase) => `“${phrase}” yazın. ${BULK_PHRASE_HINT}`,
  stage3TitleIrreversible: "Son Onay — Bu işlem geri alınamaz.",
  stage3Title: "Son Onay",
  stage3MessageIrreversible: (scope) => `${scope} kalıcı olarak silinecek.\n\nSilinen kayıtlar geri getirilemez. Onaylıyor musunuz?`,
  stage3Message: (scope) => `${scope} kaldırılacak. Onaylıyor musunuz?`,
  confirmIrreversible: (count) => `Kalıcı Olarak Sil (${count})`,
  confirm: (count) => `Onayla (${count})`,
  cancelText: "Vazgeç",
};

/** ConfirmProvider ile uyumlu minimal onay sözleşmesi (test edilebilirlik için soyut). */
export type BulkConfirmFn = (options: {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "info" | "success" | "warning";
  requireText?: string;
  requireTextLabel?: string;
  requireTextMatcher?: (typed: string) => boolean;
}) => Promise<boolean>;

export type BulkDeleteFlowOptions = {
  /** Silinecek kayıt sayısı (tümünü silde toplam kayıt). */
  count: number;
  /** "Tümünü Sil" mi? (sayıdan bağımsız 3 aşama) */
  deleteAll?: boolean;
  /** Aşama 1'de gösterilecek bağlam (ad listesi, kapsam satırları…). */
  detail?: string;
  /** Kalıcı silme değil de kaldırma/gizleme ise false (metinler yumuşar, aşama sayısı DEĞİŞMEZ). */
  irreversible?: boolean;
  /** Kayıt türü — "kayıt" varsayılan (ör. "danışan", "taş"). */
  noun?: string;
  cancelText?: string;
  /** Ekran dili metinleri (I18N-F1). Verilmezse Türkçe. */
  texts?: BulkDeleteTexts;
};

/** Aşama metinleri — saf; UI ve testler aynı kaynağı kullanır. */
export function buildBulkDeleteStages(opts: BulkDeleteFlowOptions) {
  const tx = opts.texts ?? TR_BULK_DELETE_TEXTS;
  const noun = opts.noun?.trim() || tx.defaultNoun;
  const irreversible = opts.irreversible ?? true;
  const phrase = bulkDeletePhrase(opts.count, opts.deleteAll, tx);
  const scope = tx.scope(opts.count, noun, opts.deleteAll === true);
  const verb = irreversible ? tx.verbDelete : tx.verbRemove;
  const warn = irreversible ? tx.warnIrreversible : tx.warnScope;
  const head = `${scope} ${verb}. ${warn}`;
  const detail = opts.detail?.trim();
  return {
    phrase,
    stage1: {
      title: opts.deleteAll ? tx.stage1TitleAll : tx.stage1Title,
      message: detail ? `${head}\n\n${detail}` : head,
      confirmText: tx.continueText,
    },
    stage2: {
      title: tx.stage2Title,
      message: tx.stage2Message(phrase),
      requireText: phrase,
      requireTextLabel: tx.requireLabel(phrase),
      confirmText: tx.continueText,
    },
    stage3: {
      title: irreversible ? tx.stage3TitleIrreversible : tx.stage3Title,
      message: irreversible ? tx.stage3MessageIrreversible(scope) : tx.stage3Message(scope),
      confirmText: irreversible ? tx.confirmIrreversible(opts.count) : tx.confirm(opts.count),
    },
  };
}

/**
 * 3 aşamalı akışı verilen onay fonksiyonuyla yürütür. Herhangi bir aşamada iptal (Vazgeç/ESC/
 * dışarı tıklama/yanlış ifade) → false; çağıran DELETE göndermez. Yalnız üç aşama da
 * onaylanırsa true döner.
 */
export async function runBulkDeleteConfirm(confirm: BulkConfirmFn, opts: BulkDeleteFlowOptions): Promise<boolean> {
  const s = buildBulkDeleteStages(opts);
  const cancelText = opts.cancelText ?? (opts.texts ?? TR_BULK_DELETE_TEXTS).cancelText;
  const ok1 = await confirm({ ...s.stage1, tone: "danger", cancelText });
  if (!ok1) return false;
  const ok2 = await confirm({
    ...s.stage2,
    tone: "danger",
    cancelText,
    requireTextMatcher: (typed) => bulkPhraseMatches(typed, s.phrase),
  });
  if (!ok2) return false;
  const ok3 = await confirm({ ...s.stage3, tone: "danger", cancelText });
  return ok3 === true;
}
