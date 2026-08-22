import { createFontSizeStore } from "@/lib/dogaltas/createFontSizeStore";

/**
 * Genel amaçlı büyük-okuyucu (ReaderModal) yazı boyutu deposu.
 * Doğaltaş modal font store'undan AYRI storageKey kullanır → modüller birbirinin
 * tercihini ezmez. createFontSizeStore paylaşılan yardımcıdır (davranış birebir aynı).
 */
export const READER_FONT_DEFAULT = 18;
export const READER_FONT_MIN = 16;
export const READER_FONT_MAX = 24;
export const READER_FONT_STEP = 1;
export const READER_LINE_HEIGHT = 1.8;

/** Human Design bilgi bankası büyük okuyucu için yazı boyutu deposu. */
export const hdReaderFontStore = createFontSizeStore({
  storageKey: "hd-reader-font-size",
  defaultPx: READER_FONT_DEFAULT,
  minPx: READER_FONT_MIN,
  maxPx: READER_FONT_MAX,
  stepPx: READER_FONT_STEP,
  lineHeight: READER_LINE_HEIGHT,
});
