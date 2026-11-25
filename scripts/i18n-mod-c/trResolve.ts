/**
 * I18N gece (Ajan C, 2026-11-25) — kaynak-metin sözleşme testleri için TR çözücü.
 *
 * Neden: Kupa/Biyoenerji/Refleksoloji/Aromaterapi/Ürün-Stok ekranlarının sabit Türkçe metinleri
 * messages/tr/<ns>.json kataloğuna taşındı. Eski harness'lar kaynak dosyada Türkçe metni regex'le arıyordu
 * (ör. /Hacamat Takvimi/.test(landing)). Testin NİYETİ ("ekranda bu metin var / yok / şu sırada") korunarak,
 * kaynak dosya okunurken `t("anahtar")` çağrıları TR katalog değeriyle (çift tırnak içinde) yer değiştirir. Böylece:
 *   - metin katalogda yoksa / anahtar yanlışsa test yine FAIL eder (gevşetme yok),
 *   - TR değeri kaynak metinle birebir olduğundan eski regex'ler aynen geçerlidir.
 * Çözülen çağrılar: `const X = useTranslations("ns")` / `await getTranslations("ns")` ile tanımlanan X için
 * `X("düz.anahtar")`, `X("düz.anahtar", {...})` ve `X.rich(…)` (yer tutucu adları `{ad}`, etiketler `<b>…</b>` olarak kalır). Şablon anahtarlar
 * (`X(\`a.${b}\`)`) çözülmez.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

let trCatalog: Record<string, unknown> | null = null;

function merge(into: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(from)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const cur = (into[k] ??= {}) as Record<string, unknown>;
      merge(cur, v as Record<string, unknown>);
    } else into[k] = v;
  }
}

export function trMessages(root = process.cwd()): Record<string, unknown> {
  if (trCatalog) return trCatalog;
  const dir = path.join(root, "messages", "tr");
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    merge(out, JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>);
  }
  trCatalog = out;
  return out;
}

export function trValue(fullKey: string): string | undefined {
  let cur: unknown = trMessages();
  for (const seg of fullKey.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Kaynak metindeki t("…") çağrılarını TR katalog değeriyle değiştirir. */
export function resolveTrSource(src: string): string {
  const vars = new Map<string, string>();
  const decl = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of src.matchAll(decl)) vars.set(m[1], m[2]);
  if (vars.size === 0) return src;
  let out = src;
  for (const [v, ns] of vars) {
    const esc = v.replace(/\$/g, "\\$");
    // JSX özniteliği: attr={t("k")} → attr="Değer" (eski `closeLabel="Kapat"` kalıpları birebir eşleşsin).
    const attr = new RegExp(String.raw`=\{\s*${esc}\(\s*["']([^"'${"`"}]+)["']\s*\)\s*\}`, "g");
    out = out.replace(attr, (whole, key: string) => {
      const val = trValue(`${ns}.${key}`);
      return val === undefined ? whole : `="${val}"`;
    });
    const call = new RegExp(String.raw`(?<![\w$.])${esc}(?:\.rich)?\(\s*["']([^"'${"`"}]+)["']\s*(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)`, "g");
    out = out.replace(call, (whole, key: string) => {
      const val = trValue(`${ns}.${key}`);
      // Değer çift tırnak içinde döner (ham, kaçışsız): eski `title="X"` / `"X"` kalıpları da eşleşir.
      return val === undefined ? whole : `"${val}"`;
    });
  }
  return out;
}
