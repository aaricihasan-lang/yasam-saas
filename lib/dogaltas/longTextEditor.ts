/**
 * Doğaltaş uzun metin alanları — geniş editör davranış sözleşmesi (saf mantık).
 *
 * Ürün kararı (satış öncesi kapanış): uzun metin alanına TIKLAMA/DOKUNMA geniş
 * editörü OTOMATİK açar; ⤢ butonu ikinci (manuel) yol olarak kalır. Klavye ile
 * (Tab) odaklanma editör AÇMAZ — kullanıcı yerinde yazar, focus döngüsü oluşmaz.
 *
 * Geniş editör TASLAK TUTMAZ: her tuş vuruşu doğrudan form state'ine yazılır
 * (canlı senkron). Bu yüzden Esc / × / arka plan / Tamam hangi yolla kapanırsa
 * kapansın metin kaybolmaz ve onay penceresine gerek kalmaz.
 */

export type LongTextOpenSource = "pointer" | "arrow" | "keyboard";

/** Yalnız fare/dokunma tıklaması ve ⤢ butonu açar; klavye odağı açmaz. */
export function shouldAutoOpenLongText(source: LongTextOpenSource, disabled = false): boolean {
  if (disabled) return false;
  return source === "pointer" || source === "arrow";
}

/**
 * Açılıştan hemen sonra gelen ikinci tıklama (çift tık / mobil "ghost click")
 * yeni açılan editörün arka planına düşüp onu anında kapatmasın diye koruma.
 */
export const LONG_TEXT_BACKDROP_GUARD_MS = 400;

export function canCloseFromBackdrop(openedAt: number, now: number): boolean {
  return now - openedAt >= LONG_TEXT_BACKDROP_GUARD_MS;
}

export type LongTextEditorState = {
  open: boolean;
  openedAt: number;
};

export const LONG_TEXT_EDITOR_CLOSED: LongTextEditorState = { open: false, openedAt: 0 };

/** İdempotent: zaten açıksa aynı state döner → çift olayla ikinci modal oluşmaz. */
export function openLongTextEditor(
  state: LongTextEditorState,
  source: LongTextOpenSource,
  now: number,
  disabled = false,
): LongTextEditorState {
  if (state.open) return state;
  if (!shouldAutoOpenLongText(source, disabled)) return state;
  return { open: true, openedAt: now };
}

export type LongTextCloseReason = "done" | "close-button" | "escape" | "backdrop";

/**
 * Kapatma isteği. Arka plan tıklaması koruma süresi içindeyse yok sayılır.
 * Metin form state'inde yaşadığı için kapatma hiçbir yolda veri silmez.
 */
export function closeLongTextEditor(
  state: LongTextEditorState,
  reason: LongTextCloseReason,
  now: number,
): LongTextEditorState {
  if (!state.open) return state;
  if (reason === "backdrop" && !canCloseFromBackdrop(state.openedAt, now)) return state;
  return LONG_TEXT_EDITOR_CLOSED;
}

/**
 * DB'ye ayrı "Kaydet" ile yazan TASLAKLI editörler (ör. taş detay düzenleme modalı)
 * için: taslak açılıştaki değerden farklıysa kapatma öncesi onay gerekir.
 */
export function needsDiscardConfirm(initialSnapshot: string, currentSnapshot: string): boolean {
  return initialSnapshot !== currentSnapshot;
}
