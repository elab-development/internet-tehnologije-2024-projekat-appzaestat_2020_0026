import fetch from 'node-fetch'; // Uvoz fetch funkcije za HTTP zahteve (Node okruženje)
import { parse } from 'csv-parse'; // CSV parser za stream parsiranje
import { Router } from 'express'; // Express Router za definisanje API ruta
import { auth } from '../middleware/auth.js'; // Middleware za autentikaciju (štiti rute)

const router = Router(); // Kreiranje novog Express routera

const BASE_CSV = // Osnovni CSV endpoint za potrošnju domaćinstava (RSD, godišnji)
  'https://opendata.stat.gov.rs/data/WcfJsonRestService.Service1.svc/dataset/010201IND01/3/csv';

// ── Cache (1h)
const cache = new Map(); // Prosta in-memory keš mapa (ključ -> {ts, data})
const TTL_MS = 1000 * 60 * 60; // Vreme života keša: 1h u milisekundama
const getCache = (k) => {
  // Dohvat iz keša sa proverom isteka
  const v = cache.get(k); // Uzmi zapis iz mape
  return v && Date.now() - v.ts < TTL_MS ? v.data : null; // Vrati podatke ako nisu istekli, inače null
};
const setCache = (k, data) => cache.set(k, { ts: Date.now(), data }); // Upis u keš sa timestampom
const delCache = (prefix) => {
  // Brisanje svih keševa koji počinju na dati prefiks
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
};

// ── Helpers
const toNum = (v) => Number(String(v).replace(',', '.')); // Pretvara broj sa zarezom u JS Number (npr. "3,14" -> 3.14)
const clampInt = (v, min, max, dflt) => {
  // Parsira ceo broj i ograničava ga u opsegu [min, max]
  const n = Number(v); // Pokušaj konverzije u broj
  if (!Number.isFinite(n)) return dflt; // Ako nije broj, vrati podrazumevanu vrednost
  return Math.max(min, Math.min(max, Math.trunc(n))); // Zaokruži naniže i uklopi u dozvoljeni opseg
};

async function streamCsv(url, onRow) {
  // Stream parsiranje CSV-a sa callback-om po redu
  const r = await fetch(url, {
    // HTTP GET ka zadatom URL-u
    headers: { 'Accept-Encoding': 'gzip, deflate' }, // Dozvoli kompresiju odgovora
  });
  if (!r.ok) throw new Error(`Upstream ${r.status} ${r.statusText}`); // Baci grešku ako upstream ne vrati 2xx
  return new Promise((resolve, reject) => {
    // Vraća promise koji se resolve-uje kada se CSV isparsirа
    const parser = parse({
      // Podesi CSV parser
      delimiter: ';', // Polja razdvojena tačka-zarezom
      columns: true, // Mapiraj red u objekat (ključ = ime kolone)
      bom: true, // Ignoriši BOM ako postoji
      trim: true, // Trimuj whitespace oko polja
      relax_column_count: true, // Dozvoli različit broj kolona po redu
      skip_empty_lines: true, // Preskoči prazne redove
    });
    r.body // Uđi u stream odgovora
      .on('error', reject) // Greška tokom preuzimanja
      .pipe(parser) // Prosledi u CSV parser
      .on('data', onRow) // Za svaki red pozovi onRow callback
      .on('end', resolve) // Gotovo parsiranje
      .on('error', reject); // Greška tokom parsiranja
  });
}

// Build per-year totals (RSD) using the TOTAL row only (IDCOICOP="0000")
async function buildPerYearMap() {
  // Gradi mapu godina -> ukupno (RSD) koristeći samo TOTAL red
  const key = `perYear`; // Keš ključ
  const cached = getCache(key); // Pokušaj keša
  if (cached) return cached; // Vrati keš ako postoji i važi

  const perYear = new Map(); // Mapa: godina -> suma RSD
  await streamCsv(BASE_CSV, (row) => {
    // Streamuj i parsiraj CSV
    if (row.IDTer !== 'RS' || row.mes !== '00' || row.IDVrPod !== '1') return; // Samo: teritorija RS, godišnji red (mes=00), jedinica RSD
    if (row.IDCOICOP !== '0000') return; // Samo TOTAL red (COICOP 0000)
    const y = Number(row.god); // Godina
    const v = toNum(row.vrednost); // Vrednost (RSD)
    if (!Number.isFinite(y) || !Number.isFinite(v)) return; // Validacija brojeva
    perYear.set(y, (perYear.get(y) ?? 0) + v); // Saberi po godini (teoretski može biti više redova)
  });

  const yearsDesc = Array.from(perYear.keys()).sort((a, b) => b - a); // Sortiraj godine opadajuće
  const payload = { perYear, yearsDesc }; // Pripremi povratni objekat
  setCache(key, payload); // Keširaj
  return payload; // Vrati rezultat
}

// Category breakdown (still available for one year)
async function buildByCategory(year, metric = 'percent') {
  // Gradi listu kategorija za zadatu godinu
  const idVrPod = metric === 'rsd' ? '1' : '2'; // Biraj metrik (1=RSD, 2=procenat)
  const key = `byCat:${year}:${idVrPod}`; // Keš ključ
  const cached = getCache(key); // Pokušaj keša
  if (cached) return cached; // Vrati keš ako postoji

  const arr = []; // Akumulira kategorije: {code, label, value}
  await streamCsv(BASE_CSV, (row) => {
    // Stream CSV-a potrošnje
    if (row.IDTer !== 'RS' || row.mes !== '00') return; // Samo RS i godišnji redovi
    if (row.IDVrPod !== idVrPod) return; // Samo tražena metrika
    if (row.IDCOICOP === '0000') return; // Isključi TOTAL red
    const y = Number(row.god); // Godina reda
    if (y !== year) return; // Samo tražena godina
    const value = toNum(row.vrednost); // Vrednost (RSD ili %)
    if (!Number.isFinite(value)) return; // Validacija
    arr.push({ code: row.IDCOICOP, label: row.nCOICOP, value }); // Dodaj kategoriju
  });

  arr.sort((a, b) => b.value - a.value); // Sortiraj opadajuće po vrednosti
  setCache(key, arr); // Keširaj rezultat
  return arr; // Vrati listu kategorija
}

// ── CPI helpers (monthly by year, cached)
const BASE_CPI = // CSV endpoint za CPI (indeks potrošačkih cena), mesečni podaci
  'https://opendata.stat.gov.rs/data/WcfJsonRestService.Service1.svc/dataset/03010601IND01/1/csv';

/** Build map: { year -> Map(month -> index) } for a given COICOP (default 0000) */
async function buildCpiMonthlyByYear(coicop = '0000') {
  // Gradi mapu: godina -> (mesec -> CPI indeks), za dati COICOP (0000 = all-items)
  const key = `cpiMonthly:${coicop}`; // Keš ključ
  const cached = getCache(key); // Pokušaj keša
  if (cached) return cached; // Vrati keš ako postoji

  const byYear = new Map(); // Godina -> mapa meseci
  await streamCsv(BASE_CPI, (row) => {
    // Streamuj CPI CSV
    if (row.IDTer !== 'RS') return; // Samo RS
    if (row.mes === '00') return; // Preskoči godišnje redove (trebaju nam meseci)
    if (row.IDCOICOP !== coicop) return; // Samo traženi COICOP
    const y = Number(row.god); // Godina
    const m = Number(row.mes); // Mesec (1..12)
    const v = toNum(row.vrednost); // Indeks (baza 2006=100)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(v))
      return; // Validacija
    if (!byYear.has(y)) byYear.set(y, new Map()); // Inicijalizuj mapu meseci po godini
    byYear.get(y).set(m, v); // Upis indeksa za dati mesec
  });

  setCache(key, byYear); // Keširaj kompletnu mapu
  return byYear; // Vrati rezultat
}

/** Build annual CPI per year using monthly maps: method 'avg' or 'december' */
async function buildCpiAnnual(coicop = '0000', method = 'avg') {
  // Izračunaj godišnji CPI po godini: prosek meseci ili vrednost za decembar
  const key = `cpiAnnual:${coicop}:${method}`; // Keš ključ
  const hit = getCache(key); // Pokušaj keša
  if (hit) return hit; // Vrati keš ako postoji

  const monthly = await buildCpiMonthlyByYear(coicop); // Učitaj mesečne mape
  const annual = new Map(); // Godina -> godišnji CPI

  for (const [year, mMap] of monthly.entries()) {
    // Prođi kroz svaku godinu
    if (method === 'december') {
      // Ako je metod "december"
      const dec = mMap.get(12); // Uzmi CPI za decembar
      if (Number.isFinite(dec)) annual.set(year, dec); // Ako postoji, upiši
    } else {
      // Inače "avg" metod (aritmetička sredina dostupnih meseci)
      const vals = Array.from(mMap.values()).filter(Number.isFinite); // Svi meseci te godine
      if (vals.length) {
        // Ako ima podataka
        const sum = vals.reduce((s, x) => s + x, 0); // Saberi
        annual.set(year, sum / vals.length); // Podeli sa brojem meseci
      }
    }
  }

  const yearsDesc = Array.from(annual.keys()).sort((a, b) => b - a); // Sortiraj godine opadajuće
  const payload = { annual, yearsDesc, method, coicop }; // Spakuj rezultat
  setCache(key, payload); // Keširaj
  return payload; // Vrati
}

// ── ROUTES

router.get('/cache/refresh', auth, (_req, res) => {
  // Ručno čišćenje kompletnog keša
  cache.clear(); // Isprazni Map
  res.json({ ok: true }); // Vrati potvrdu
});

// Years list (TOTAL only)
router.get('/consumption/years', auth, async (req, res) => {
  // Lista dostupnih godina (opciono ograniči "last")
  try {
    const refresh =
      String(req.query.refresh || 'false').toLowerCase() === 'true'; // Ako je ?refresh=true, počisti keš
    const order = (req.query.order || 'desc').toLowerCase(); // Redosled: asc/desc
    if (refresh) delCache('perYear'); // Počisti samo keš koji se tiče perYear

    const { yearsDesc } = await buildPerYearMap(); // Učitaj godine iz keširane mape
    const years = order === 'asc' ? [...yearsDesc].reverse() : yearsDesc; // Primenjuj redosled
    const last = clampInt(req.query.last, 1, 100, 10); // Ograniči broj godina koje vraćamo
    res.json({ years: years.slice(0, last) }); // Vrati traženi broj godina
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// Yearly totals (TOTAL only)
router.get('/consumption/yearly', auth, async (req, res) => {
  // Godišnji zbir potrošnje (RSD) po godinama
  try {
    const refresh =
      String(req.query.refresh || 'false').toLowerCase() === 'true'; // Optional refresh
    if (refresh) delCache('perYear'); // Počisti keš perYear

    const { perYear, yearsDesc } = await buildPerYearMap(); // Dobavi mapu godina -> iznos
    let years = [...yearsDesc].reverse(); // Sortiraj rastuće (ASC)

    const start = Number(req.query.start); // Filtriranje po rasponu godina: start
    const end = Number(req.query.end); // i end (opciono)
    if (Number.isFinite(start) || Number.isFinite(end)) {
      const s = Number.isFinite(start) ? start : Math.min(...years); // Ako nema start, uzmi minimum
      const e = Number.isFinite(end) ? end : Math.max(...years); // Ako nema end, uzmi maksimum
      years = years.filter((y) => y >= s && y <= e); // Primeni filter
    } else {
      const last = clampInt(req.query.last, 1, 100, 10); // Inače uzmi poslednjih N godina
      years = years.slice(-last);
    }

    const series = years.map((y) => ({ year: y, total: perYear.get(y) ?? 0 })); // Formiraj niz objekata
    res.json({ series }); // Vrati rezultat
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// NOTE: consumption dataset is annual-only → no monthly here
router.get('/consumption/monthly', auth, async (_req, res) => {
  // Ova ruta samo obaveštava da nema mesečnih podataka
  res.status(400).json({
    message:
      'Monthly series is not available for 010201IND01 (annual-only). Use /stats/prices/cpi/monthly for monthly CPI.',
  });
});

// Category breakdown (top N)
router.get('/consumption/by-category', auth, async (req, res) => {
  // Top N kategorija za datu godinu
  try {
    const metric = (req.query.metric || 'percent').toLowerCase(); // Metrika: 'percent' ili 'rsd'
    const top = clampInt(req.query.top, 1, 50, 10); // Koliko kategorija najviše
    const includeOthers =
      String(req.query.others || 'false').toLowerCase() === 'true'; // Da li dodati "Others" kao zbir ostatka

    const { yearsDesc } = await buildPerYearMap(); // Uzmi dostupne godine
    const qYear = Number(req.query.year); // Odabrana godina (opciono)
    const year = Number.isFinite(qYear) ? qYear : yearsDesc[0]; // Ako nije prosleđena, uzmi poslednju

    const all = await buildByCategory(year, metric); // Učitaj sve kategorije za godinu
    const topSeries = all.slice(0, top); // Uzmi top N
    let series = topSeries; // Početna serija = top N

    if (includeOthers && all.length > top) {
      // Ako treba i "Others"
      const othersValue = all // Saberemo preostale
        .slice(top)
        .reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0);
      if (othersValue > 0)
        series = [
          // Dodaj "Others" kao poslednji stub
          ...topSeries,
          { code: 'OTHER', label: 'Others', value: othersValue },
        ];
    }

    res.json({ year, metric, top, others: includeOthers, series }); // Vrati rezultat
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// CPI monthly (real monthly data)
router.get('/prices/cpi/monthly', auth, async (req, res) => {
  // Mesečni CPI za godinu (COICOP opcioni)
  try {
    const year = Number(req.query.year); // Tražena godina (obavezno)
    const coicop = String(req.query.coicop || '0000'); // COICOP (default all-items)
    if (!Number.isFinite(year)) {
      // Validacija godine
      return res
        .status(400)
        .json({ message: "Query param 'year' is required (e.g. 2024)." });
    }

    const CK = `cpi:${year}:${coicop}`; // Keš ključ za mesečni CPI po godini
    const hit = getCache(CK); // Probaj keš
    if (hit) return res.json(hit); // Vrati keš ako postoji

    const byYear = await buildCpiMonthlyByYear(coicop); // Učitaj mapu godina -> meseci
    const mMap = byYear.get(year) || new Map(); // Mapa meseci za traženu godinu

    const series = Array.from({ length: 12 }, (_, i) => {
      // Napravi niz za 12 meseci
      const m = i + 1;
      return { month: m, index: mMap.get(m) ?? null }; // index = vrednost ili null ako nedostaje
    });

    const payload = { year, coicop, base: '2006=100', series }; // Spakuj odgovor
    setCache(CK, payload); // Keširaj payload
    res.json(payload); // Vrati rezultat
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

//
// ───────────────────────────── NEW REPORT ENDPOINTS ───────────────────────────
//

// 1) YoY growth for consumption (absolute + percent)
router.get('/consumption/growth', auth, async (req, res) => {
  // Godišnja promena potrošnje: apsolutno i %
  try {
    const { perYear, yearsDesc } = await buildPerYearMap(); // Učitaj nominale po godini
    let years = [...yearsDesc].reverse(); // ASC niz godina

    const start = Number(req.query.start); // Opcioni filter start godine
    const end = Number(req.query.end); // Opcioni filter end godine
    if (Number.isFinite(start) || Number.isFinite(end)) {
      const s = Number.isFinite(start) ? start : Math.min(...years);
      const e = Number.isFinite(end) ? end : Math.max(...years);
      years = years.filter((y) => y >= s && y <= e); // Primeni filter
    } else {
      const last = clampInt(req.query.last, 2, 100, 10); // Minimalno 2 godine za YoY račun
      years = years.slice(-last);
    }

    const series = years.map((y) => {
      // Izračunaj YoY po godinama
      const curr = perYear.get(y) ?? 0; // Tekuća godina nominal
      const prev = perYear.get(y - 1) ?? null; // Prethodna godina nominal (može biti null)
      const yoy_abs = prev != null ? curr - prev : null; // Apsolutna promena
      const yoy_pct = prev && prev !== 0 ? (yoy_abs / prev) * 100 : null; // % promena
      return { year: y, total: curr, yoy_abs, yoy_pct }; // Vrati objekt
    });

    res.json({ series }); // Vrati seriju
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// 2) Consumption index (normalize to base=100)
router.get('/consumption/index', auth, async (req, res) => {
  // Indeks potrošnje: baza=100 za izabranu godinu
  try {
    const base = Number(req.query.base); // Godina koja predstavlja bazu (100)
    const { perYear, yearsDesc } = await buildPerYearMap(); // Učitaj nominale
    if (!Number.isFinite(base) || !perYear.has(base)) {
      // Validacija baze
      return res
        .status(400)
        .json({ message: "Valid 'base' year required (e.g. base=2015)." });
    }

    let years = [...yearsDesc].reverse(); // ASC niz godina
    const start = Number(req.query.start); // Opcioni filter start
    const end = Number(req.query.end); // Opcioni filter end
    if (Number.isFinite(start) || Number.isFinite(end)) {
      const s = Number.isFinite(start) ? start : Math.min(...years);
      const e = Number.isFinite(end) ? end : Math.max(...years);
      years = years.filter((y) => y >= s && y <= e); // Primeni filter
    } else {
      const last = clampInt(req.query.last, 1, 100, 10); // Poslednjih N godina
      years = years.slice(-last);
    }

    const baseVal = perYear.get(base); // Nominal baze
    const series = years.map((y) => {
      // Računaj indeks = (nominal / baza) * 100
      const nom = perYear.get(y) ?? 0;
      const index = baseVal && baseVal !== 0 ? (nom / baseVal) * 100 : null;
      return { year: y, index };
    });

    res.json({ base, series }); // Vrati indeksnu seriju
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// 3) Annual CPI (avg of months OR December)
router.get('/prices/cpi/annual', auth, async (req, res) => {
  // Godišnji CPI po godini: prosek meseci ili decembar
  try {
    const coicop = String(req.query.coicop || '0000'); // COICOP (default all-items)
    const method = (req.query.method || 'avg').toLowerCase(); // Metod agregacije
    if (!['avg', 'december'].includes(method)) {
      // Validacija metoda
      return res
        .status(400)
        .json({ message: "method must be 'avg' or 'december'." });
    }

    const { annual, yearsDesc } = await buildCpiAnnual(coicop, method); // Učitaj godišnje CPI vrednosti
    let years = [...yearsDesc].reverse(); // ASC godine

    const start = Number(req.query.start); // Opcioni filter start
    const end = Number(req.query.end); // Opcioni filter end
    if (Number.isFinite(start) || Number.isFinite(end)) {
      const s = Number.isFinite(start) ? start : Math.min(...years);
      const e = Number.isFinite(end) ? end : Math.max(...years);
      years = years.filter((y) => y >= s && y <= e); // Primeni filter
    } else {
      const last = clampInt(req.query.last, 1, 100, 10); // Poslednjih N godina
      years = years.slice(-last);
    }

    const series = years.map((y) => ({
      // Formiraj niz {year, index}
      year: y,
      index: annual.get(y) ?? null,
    }));
    res.json({ coicop, method, base: '2006=100', series }); // Vrati rezultat sa metapodacima
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// 4) CPI YoY by month for a given year (monthly inflation rates)
router.get('/prices/cpi/yoy', auth, async (req, res) => {
  // Mesečne YoY stope inflacije za datu godinu
  try {
    const year = Number(req.query.year); // Godina (obavezno)
    const coicop = String(req.query.coicop || '0000'); // COICOP (default all-items)
    if (!Number.isFinite(year)) {
      // Validacija
      return res
        .status(400)
        .json({ message: "Query param 'year' is required (e.g. 2024)." });
    }

    const byYear = await buildCpiMonthlyByYear(coicop); // Učitaj mesečne mape
    const thisYear = byYear.get(year) || new Map(); // Meseci tekuće godine
    const prevYear = byYear.get(year - 1) || new Map(); // Meseci prethodne godine

    const series = Array.from({ length: 12 }, (_, i) => {
      // Za svaki mesec 1..12
      const m = i + 1;
      const cur = thisYear.get(m); // CPI tekuće godine
      const base = prevYear.get(m); // CPI prethodne godine
      const yoy_pct =
        Number.isFinite(cur) && Number.isFinite(base) && base !== 0
          ? (cur / base - 1) * 100 // (CPI_t / CPI_{t-12}) - 1 u %
          : null;
      return { year, month: m, yoy_pct }; // Vrati objekat za mesec
    });

    res.json({ coicop, year, series }); // Vrati niz 12 vrednosti
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

// 5) Real (CPI-deflated) consumption — puts totals in prices of base CPI year
router.get('/consumption/real', auth, async (req, res) => {
  // „Realna“ potrošnja deflacionirana na cene bazne godine
  try {
    const baseYear = Number(req.query.base || 2006); // CPI baza je 2006=100, podrazumevano 2006
    const method = (req.query.method || 'avg').toLowerCase(); // Avg ili December CPI
    if (!Number.isFinite(baseYear)) {
      // Validacija baze
      return res
        .status(400)
        .json({ message: "Valid 'base' CPI year required (e.g. base=2006)." });
    }
    if (!['avg', 'december'].includes(method)) {
      // Validacija metoda
      return res
        .status(400)
        .json({ message: "method must be 'avg' or 'december'." });
    }

    const { perYear, yearsDesc } = await buildPerYearMap(); // Nominalna potrošnja po godinama
    const { annual: cpiAnnual } = await buildCpiAnnual('0000', method); // Godišnji CPI po metodu

    const baseCpi = cpiAnnual.get(baseYear); // CPI za baznu godinu
    if (!Number.isFinite(baseCpi) || baseCpi === 0) {
      // Ako nemamo bazni CPI, ne možemo izračunati realne
      return res
        .status(400)
        .json({ message: `Missing CPI for base year ${baseYear}.` });
    }

    let years = [...yearsDesc].reverse(); // ASC niz godina
    const start = Number(req.query.start); // Opcioni filter start
    const end = Number(req.query.end); // Opcioni filter end
    if (Number.isFinite(start) || Number.isFinite(end)) {
      const s = Number.isFinite(start) ? start : Math.min(...years);
      const e = Number.isFinite(end) ? end : Math.max(...years);
      years = years.filter((y) => y >= s && y <= e); // Primeni filter
    } else {
      const last = clampInt(req.query.last, 1, 100, 10); // Poslednjih N godina
      years = years.slice(-last);
    }

    // Real = nominal / (CPI_y / CPI_base)  → nominal prilagođen na cene bazne godine
    const series = years.map((y) => {
      const nom = perYear.get(y) ?? null; // Nominal
      const cpi = cpiAnnual.get(y) ?? null; // CPI te godine
      if (!Number.isFinite(nom) || !Number.isFinite(cpi) || cpi === 0) {
        return { year: y, real: null, nominal: nom, cpi_index: cpi }; // Ako nema podataka
      }
      const real = nom / (cpi / baseCpi); // Deflacioniranje
      return { year: y, real, nominal: nom, cpi_index: cpi }; // Vrati realnu vrednost
    });

    res.json({ base: baseYear, method, series }); // Vrati rezultat
  } catch (e) {
    res.status(500).json({ message: e.message }); // Greška servera
  }
});

export default router; // Izvoz routera za korišćenje u glavnoj aplikaciji
