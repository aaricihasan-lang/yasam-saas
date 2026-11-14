/**
 * AŞAMA 4a — migration dosyasının üst düzey işlem kontrol ifadelerini bulur ve "gövde"yi (BEGIN;/COMMIT; hariç) çıkarır.
 * Dolar tırnak ($$, $tag$), tek tırnaklı metin, çift tırnaklı tanımlayıcı ve -- / blok yorumlarını tanır; bu yüzden
 * PL/pgSQL gövdelerindeki BEGIN/END ile üst düzey işlem komutları KARIŞMAZ.
 *
 * Kural: dosyada üst düzeyde TAM OLARAK bir "BEGIN" (ilk ifade) ve bir "COMMIT" (son ifade) bulunur; başka hiçbir
 * işlem kontrol ifadesi (COMMIT/ROLLBACK/END/ABORT/START TRANSACTION/SAVEPOINT/RELEASE/PREPARE TRANSACTION/BEGIN)
 * bulunamaz. Gövde = dosya metninden yalnız bu iki ifadenin karakterleri çıkarılmış hâli (diğer her bayt aynen).
 */
export type TopStatement = { text: string; start: number; end: number };

export function splitTopLevel(sql: string): TopStatement[] {
  const out: TopStatement[] = [];
  let i = 0;
  let start = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'") { i++; while (i < n) { if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } if (sql[i] === "'") { i++; break; } i++; } continue; }
    if (c === '"') { i++; while (i < n && sql[i] !== '"') i++; i++; continue; }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) { const tag = m[0]; const e = sql.indexOf(tag, i + tag.length); i = e < 0 ? n : e + tag.length; continue; }
    }
    if (c === ";") { out.push({ text: sql.slice(start, i + 1), start, end: i + 1 }); i++; start = i; continue; }
    i++;
  }
  if (sql.slice(start).trim()) out.push({ text: sql.slice(start), start, end: n });
  return out;
}

/** Yorum ve boşluk temizlenmiş, büyük harfli ifade metni (yalnız sınıflandırma için). */
export function normalizeStatement(text: string): string {
  return text.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

const TX_CONTROL = /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT|RELEASE|PREPARE TRANSACTION|COMMIT PREPARED|ROLLBACK PREPARED)\b/;

export function extractMigrationBody(sql: string): { body: string; txStatements: string[] } {
  const stmts = splitTopLevel(sql).filter((s) => normalizeStatement(s.text) !== "");
  const tx = stmts.filter((s) => TX_CONTROL.test(normalizeStatement(s.text)));
  const txStatements = tx.map((s) => normalizeStatement(s.text));
  if (tx.length !== 2) throw new Error(`üst düzey işlem ifadesi sayısı 2 değil: ${JSON.stringify(txStatements)}`);
  if (normalizeStatement(stmts[0].text) !== "BEGIN;" || normalizeStatement(stmts[stmts.length - 1].text) !== "COMMIT;") {
    throw new Error(`ilk ifade BEGIN; son ifade COMMIT; olmalı: ${JSON.stringify(txStatements)}`);
  }
  const [b, c] = [stmts[0], stmts[stmts.length - 1]];
  // Yalnız "BEGIN;" ve "COMMIT;" karakterleri çıkarılır (önlerindeki yorumlar / boşluklar aynen kalır).
  const bIdx = sql.indexOf("BEGIN;", b.start);
  const cIdx = sql.lastIndexOf("COMMIT;", c.end);
  if (bIdx < 0 || bIdx >= b.end || cIdx < c.start) throw new Error("BEGIN;/COMMIT; konumu doğrulanamadı");
  const body = sql.slice(0, bIdx) + sql.slice(bIdx + "BEGIN;".length, cIdx) + sql.slice(cIdx + "COMMIT;".length);
  const left = splitTopLevel(body).map((s) => normalizeStatement(s.text)).filter((t) => TX_CONTROL.test(t));
  if (left.length) throw new Error(`gövdede işlem kontrol ifadesi kaldı: ${JSON.stringify(left)}`);
  return { body, txStatements };
}
