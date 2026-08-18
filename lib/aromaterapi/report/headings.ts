/**
 * Aromaterapi başlık sarmalayıcıları — orphan/pagination için keepNext+keepLines
 * VARSAYILAN AÇIK. Paylaşımlı reportHelpers.h2/h3 defaultunu (Şifa Rehberi & diğer
 * modüller için byte-identical opt-in tasarımı) DEĞİŞTİRMEZ; keepNext yalnız aromaterapi
 * çağrılarında opts üzerinden uygulanır. Çağıran opts geçerse (ör. pageBreakBefore) korunur.
 */
import type { Paragraph } from "docx";
import { h2 as baseH2, h3 as baseH3, type HeadingOptions } from "@/lib/docx/reportHelpers";

const AROMA_DEFAULT: HeadingOptions = { keepNext: true, keepLines: true };

export const h2 = (text: string, opts?: HeadingOptions): Paragraph => baseH2(text, { ...AROMA_DEFAULT, ...opts });
export const h3 = (text: string, opts?: HeadingOptions): Paragraph => baseH3(text, { ...AROMA_DEFAULT, ...opts });
