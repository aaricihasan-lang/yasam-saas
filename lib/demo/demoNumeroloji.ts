/** Demo hesapta tam erişimli olan sabit numeroloji kaydı. */
export const DEMO_NUMEROLOJI_OPEN_NAME = "Hasan";
export const DEMO_NUMEROLOJI_OPEN_SURNAME = "YILMAZ";

/**
 * Verilen kaydın demo hesaptaki "açık" örnek analiz olup olmadığını kontrol eder.
 * Hasan YILMAZ ise true, diğer tüm demo seed kayıtlar false döner.
 */
export function isDemoNumerologiOpenRecord(row: { name: string; surname: string }): boolean {
  return (
    row.name.trim().toLocaleLowerCase("tr-TR") ===
      DEMO_NUMEROLOJI_OPEN_NAME.toLocaleLowerCase("tr-TR") &&
    row.surname.trim().toLocaleLowerCase("tr-TR") ===
      DEMO_NUMEROLOJI_OPEN_SURNAME.toLocaleLowerCase("tr-TR")
  );
}
