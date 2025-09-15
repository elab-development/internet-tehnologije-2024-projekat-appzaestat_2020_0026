import fetch from 'node-fetch'; // Uvoz fetch funkcije za HTTP zahteve u Node okruženju
import { parse } from 'csv-parse'; // Uvoz CSV parsera koji ume da čita stream i mapira kolone

// Mali pomoćni util: strimuje CSV sa ';' kao delimiterom i za svaki red poziva onRow callback.
// - url: string ka CSV fajlu
// - onRow: funkcija (rowObj) koja se poziva za SVAKI isparsiran red
export async function streamCsv(url, onRow) {
  // Izvoz asinhrone funkcije streamCsv
  const r = await fetch(url, {
    // Slanje HTTP GET zahteva ka prosleđenom URL-u
    headers: { 'Accept-Encoding': 'gzip, deflate' }, // Tražimo kompresovani odgovor radi manjeg protoka
  });
  if (!r.ok) throw new Error(`Upstream ${r.status} ${r.statusText}`); // Ako status nije 2xx → baci grešku

  return new Promise((resolve, reject) => {
    // Vraćamo Promise koji se razrešava kad CSV bude isparsiran
    const parser = parse({
      // Kreiranje CSV parsera sa odgovarajućim podešavanjima
      delimiter: ';', // CSV kolone su razdvojene tačka-zarezom
      columns: true, // Prvi red sadrži nazive kolona → mapiraj red u objekat
      bom: true, // Ignoriši BOM ako postoji na početku fajla
      relax_column_count: true, // Dozvoli varijacije u broju kolona po redu
      trim: true, // Trimuj whitespace oko vrednosti
      skip_empty_lines: true, // Preskači prazne redove
    });

    r.body // r.body je ReadableStream HTTP odgovora
      .on('error', reject) // Ako dođe do greške pri čitanju stream-a → odbij Promise
      .pipe(parser) // Prosledi stream CSV parseru (stream piping)
      .on('data', onRow) // Za SVAKI red: pozovi onRow(rowObj)
      .on('end', resolve) // Kada parser stigne do kraja → razreši Promise
      .on('error', reject); // Ako parser prijavi grešku → odbij Promise
  });
}
