import { connection } from "next/server";
import { notFound } from "next/navigation";

/**
 * Hazırlık kapısı (sunucu). Ekran yalnız STONE_LIBRARY_ENABLED tam "true" ise vardır; aksi halde 404.
 * connection(): karar istek anında verilir (derleme anındaki ortam değeriyle statik sayfa üretilmez).
 */
export async function requireStoneLibraryFlag(): Promise<void> {
  await connection();
  if (process.env.STONE_LIBRARY_ENABLED !== "true") notFound();
}
