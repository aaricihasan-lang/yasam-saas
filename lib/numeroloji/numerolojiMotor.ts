import { calcAnaKulvar } from "./anaKulvar";
import { calcYanKulvar } from "./yanKulvar";
import { calcIfadeSayisi } from "./ifadeSayisi";
import { calcHayatYolu } from "./hayatYolu";
import { hesaplaPinKodu, formatlaPinKutular } from "./pinKodu";
import { hesaplaCakraSutunu, formatlaCakraSutunu } from "./cakraOmurgasi";
import { calcElementleri, formatlaElementler } from "./elementler";
import { formatlaDegisimYillari } from "./degisimDonusum";
import { calcZirveYillari, formatlaZirveYillari } from "./zirveYillari";
import { calcMucadeleYillari, formatlaMucadeleYili } from "./mucadeleYillari";
import { calcHarflerinYankilanisi, formatlaHarflerinYankilanisi } from "./harflerinYankilanisi";

export type NumerolojiInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export function hesaplaNumeroloji(input: NumerolojiInput) {
  const { firstName, lastName, birthDate } = input;

  return {
    anaKulvar: calcAnaKulvar(firstName, lastName),
    yanKulvar: calcYanKulvar(firstName, lastName),
    ifadeSayisi: calcIfadeSayisi(firstName, lastName),
    hayatYolu: calcHayatYolu(birthDate),
    pinKodu: hesaplaPinKodu(birthDate),
    pinKoduMetni: formatlaPinKutular(birthDate),
    cakraOmurgasi: hesaplaCakraSutunu(firstName, lastName, birthDate),
    cakraOmurgasiMetni: formatlaCakraSutunu(firstName, lastName, birthDate),
    elementler: calcElementleri(birthDate),
    elementlerMetni: formatlaElementler(birthDate),
    degisimDonusumMetni: formatlaDegisimYillari(birthDate),
    zirveYillari: calcZirveYillari(birthDate),
    zirveYillariMetni: formatlaZirveYillari(birthDate),
    mucadeleYillari: calcMucadeleYillari(birthDate),
    mucadeleYillariMetni: formatlaMucadeleYili(birthDate),
    harflerinYankilanisi: calcHarflerinYankilanisi(firstName, lastName, birthDate),
    harflerinYankilanisiMetni: formatlaHarflerinYankilanisi(firstName, lastName, birthDate),
  };
}
