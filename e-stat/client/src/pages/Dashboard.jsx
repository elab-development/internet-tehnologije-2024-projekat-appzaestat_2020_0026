import { useEffect, useState } from 'react'; // React hook-ovi za stanje i lifecycle (efekti)
import { useNavigate, useOutletContext } from 'react-router-dom'; // Navigacija i pristup context-u iz roditeljskog route-a
import ChartCard from '../components/ChartCard'; // Reusable kartica koja renderuje Chart.js grafikon
import { apiGet } from '../lib'; // Pomoćna funkcija za GET pozive ka našem backend API-ju

// Formatiranje brojeva (puni format, npr. 123,456)
const fmtFull = new Intl.NumberFormat('en-US');
// Kompaktno formatiranje (npr. 123k, 3.4M) za ose grafikona
const fmtCompact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
// Imena meseci za x-osu mesečnih serija
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Utility za predlog min/max osa grafika sa blagim padding-om
function axisRange(values, pad = 0.08) {
  const v = values.filter(Number.isFinite); // Zadrži samo brojeve
  if (!v.length) return { min: 0, max: 1 }; // Fallback kada nema podataka
  const min = Math.min(...v), // Minimum vrednost
    max = Math.max(...v); // Maksimum vrednost
  if (min === max) return { min: min * 0.9, max: max * 1.1 || 1 }; // Ako je sve isto, raširi skalu malo
  const span = max - min; // Raspon
  return { min: min - span * pad, max: max + span * pad }; // Dodaj padding oko min/max
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helper-i (klijent)
// Ovi util-i pretvaraju podatke u CSV i pokreću download u browseru.

function csvEscape(val) {
  // Escape za CSV polja (navodnici, zarez, novi red)
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; // Dupliraj navodnike i umotaj u navodnike ako treba
}

function toCSV(rows, headers) {
  // rows: niz objekata; headers: [{key, label}]
  const head = headers.map((h) => csvEscape(h.label)).join(','); // Prva linija: nazivi kolona
  const lines = rows.map(
    (r) => headers.map((h) => csvEscape(r[h.key])).join(',') // Svaki red: uzmi vrednosti po ključevima iz headers-a
  );
  return [head, ...lines].join('\n'); // Spoji u jedan CSV string
}

function downloadCSV(filename, csvText) {
  // Krene download CSV-a u browseru
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' }); // Napravi Blob iz teksta
  const url = URL.createObjectURL(blob); // Kreiraj privremeni URL
  const a = document.createElement('a'); // <a download> element
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click(); // Programski klik za preuzimanje
  a.remove(); // Očisti DOM
  URL.revokeObjectURL(url); // Oslobodi URL
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  // Glavna komponenta dashboard stranice
  const { isAuthed } = useOutletContext(); // Uzmemo flag iz roditeljskog layout-a (da li je korisnik ulogovan)
  const nav = useNavigate(); // Za redirekcije

  const [last, setLast] = useState(10); // Koliko poslednjih godina učitavamo (3/5/10/15/20)
  const [series, setSeries] = useState([]); // Godišnji total potrošnje (RSD) — niz objekata {year, total}
  const [selYear, setSelYear] = useState(''); // Godina za koju tražimo mesečni CPI i CPI YoY
  const [mSeries, setMSeries] = useState([]); // Mesečni CPI (indeks 2006=100) — niz {month, index}
  const [growth, setGrowth] = useState([]); // Godišnji YoY % za potrošnju — niz {year, yoy_pct}
  const [yoyMonthly, setYoyMonthly] = useState([]); // CPI YoY po mesecima (%) — niz {month, yoy_pct}

  const [loading, setLoading] = useState(true); // UI state: da li učitavamo
  const [err, setErr] = useState(''); // UI state: tekst greške

  // Učitavanje: godišnji total + YoY rast potrošnje
  useEffect(() => {
    if (!isAuthed) {
      // Ako nije ulogovan → na login
      nav('/login');
      return;
    }
    (async () => {
      try {
        setLoading(true); // Upali loader
        setErr(''); // Očisti grešku
        // Pararelno povuci godišnje total-e i YoY rast (treba min 2 godine)
        const [y, g] = await Promise.all([
          apiGet(`/stats/consumption/yearly?last=${last}`), // Backend endpoint: poslednjih N godina (TOTAL)
          apiGet(`/stats/consumption/growth?last=${Math.max(2, last)}`), // Backend endpoint: YoY niz
        ]);
        const arr = y.series || []; // Bezbedno pročitaj niz
        setSeries(arr); // Sačuvaj u state
        setGrowth(g.series || []); // Sačuvaj YoY seriju
        const latest = arr[arr.length - 1]?.year; // Izvuci najnoviju godinu iz niza
        setSelYear((prev) => prev || String(latest || '')); // Ako nije odabrana, postavi je na najnoviju
      } catch (e) {
        setErr(String(e)); // Prikaži grešku
      } finally {
        setLoading(false); // Ugasi loader
      }
    })();
  }, [isAuthed, nav, last]); // Re-run na promenu auth-a ili broja godina

  // Učitavanje: mesečni CPI indeks + CPI YoY po mesecima za odabranu godinu
  useEffect(() => {
    if (!selYear) return; // Ne radi ništa dok nemamo godinu
    (async () => {
      try {
        // Povuci mesečne CPI indekse i YoY po mesecima (oba za isti COICOP=0000 → ukupni CPI)
        const [m, yoy] = await Promise.all([
          apiGet(`/stats/prices/cpi/monthly?year=${selYear}&coicop=0000`),
          apiGet(`/stats/prices/cpi/yoy?year=${selYear}&coicop=0000`),
        ]);
        setMSeries(m.series || []); // Sačuvaj mesečne indekse
        setYoyMonthly(yoy.series || []); // Sačuvaj mesečne YoY stope
      } catch (e) {
        console.error(e); // Loguj grešku (ne ruši UI)
        setMSeries([]); // Resetuj podatke na prazan niz
        setYoyMonthly([]);
      }
    })();
  }, [selYear]); // Re-run kada promenimo godinu

  // Loading / Error UI
  if (loading)
    return (
      <div className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
        Loading…
      </div>
    );
  if (err)
    return (
      <div className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-red-600'>
        Error: {err}
      </div>
    );

  // ───────────────────────────────── Chart priprema: GODIŠNJI TOTAL ───────────
  const yLabels = series.map((d) => d.year); // Godine kao labele
  const yValues = series.map((d) => d.total); // Totele kao vrednosti
  const yr = axisRange(yValues); // Predlog opsega Y-ose
  const yearlyData = {
    labels: yLabels,
    datasets: [
      {
        label: 'Household consumption (RSD, yearly total)', // Naslov u legendi
        data: yValues, // Podaci
        borderColor: 'rgb(37, 99, 235)', // Plava linija
        backgroundColor: 'rgba(37, 99, 235, .15)', // Svetloplava ispuna
        pointRadius: 3, // Veličina tačke
        fill: true, // Popuni ispod linije
        tension: 0.25, // Krivljenje linije (smoothing)
      },
    ],
  };
  const yearlyOpts = {
    plugins: {
      legend: { display: true }, // Prikaži legendu
    },
    scales: {
      y: {
        beginAtZero: false, // Ne forsiraj nulu
        suggestedMin: yr.min, // Predloženi min
        suggestedMax: yr.max, // Predloženi max
        ticks: { callback: (v) => fmtCompact.format(v) }, // Kompaktno formatiranje tick-ova
      },
      x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, // Ograniči broj tick-ova na X
    },
  };

  // ─────────────────────────────── Chart priprema: Mesečni CPI ────────────────
  const mValues = mSeries.map((d) => (d.index == null ? null : d.index)); // Dozvoli rupe (null) za neobjavljene mesece
  const mr = axisRange(mValues.filter(Number.isFinite)); // Range prema dostupnim vrednostima
  const monthlyData = {
    labels: mSeries.map((d) => MONTHS[(d.month - 1 + 12) % 12]), // Prevedi 1..12 u nazive meseci
    datasets: [
      {
        label: `CPI All-items (2006=100) — ${selYear}`, // Oznaka dataset-a
        data: mValues, // Indeksi po mesecima
        borderColor: 'rgb(37, 99, 235)', // Plava linija
        backgroundColor: 'rgba(37, 99, 235, .12)', // Svetloplava ispuna
        pointRadius: 3, // Tačke
        spanGaps: true, // Poveži liniju preko null vrednosti (ali bez crtanja tačke)
        fill: true, // Popuna
        tension: 0.25, // Smoothing
      },
    ],
  };
  const monthlyOpts = {
    plugins: { legend: { display: true } }, // Prikaži legendu
    scales: {
      y: { beginAtZero: false, suggestedMin: mr.min, suggestedMax: mr.max }, // Skala prema podacima
      x: {}, // Podrazumevana X osa (meseci)
    },
  };

  // ─────────────────────── Chart priprema: YoY potrošnja (procenat) ──────────
  const gLabels = growth.map((d) => d.year); // Godine
  const gPctValues = growth.map(
    (d) => (Number.isFinite(d.yoy_pct) ? d.yoy_pct : null) // Dozvoli null gde nema prethodne godine
  );
  const gr = axisRange(gPctValues.filter(Number.isFinite)); // Range za YoY %
  const growthPctData = {
    labels: gLabels,
    datasets: [
      {
        label: 'Consumption YoY (%)', // Oznaka
        data: gPctValues, // YoY procenti
        borderColor: 'rgb(37, 99, 235)', // Plava
        backgroundColor: 'rgba(37, 99, 235, .12)', // Ispuna
        pointRadius: 3,
        spanGaps: true,
        fill: true,
        tension: 0.25,
      },
    ],
  };
  const pctFmt = (v) =>
    Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—'; // Formatiranje tick-ova u % sa znakom +/-
  const growthPctOpts = {
    plugins: { legend: { display: true } },
    scales: {
      y: {
        beginAtZero: false,
        suggestedMin: gr.min,
        suggestedMax: gr.max,
        ticks: { callback: (v) => pctFmt(v) }, // Ticks u %
      },
      x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
    },
  };

  // ─────────────── Chart priprema: CPI YoY po mesecima (bar chart) ───────────
  const yoyMonthValues = yoyMonthly.map(
    (d) => (Number.isFinite(d.yoy_pct) ? d.yoy_pct : null) // YoY % po mesecima
  );
  const yyr = axisRange(yoyMonthValues.filter(Number.isFinite)); // Range za mesečne YoY %
  const yoyMonthlyData = {
    labels: MONTHS, // Fiksni redosled meseci
    datasets: [
      {
        label: `CPI YoY (%) — ${selYear}`, // Oznaka
        data: yoyMonthValues, // Podaci
        backgroundColor: 'rgba(37, 99, 235, .35)', // Plave kolone (poluprozirno)
        borderColor: 'rgb(37, 99, 235)', // Obrub kolona
        borderWidth: 1.5,
      },
    ],
  };
  const yoyMonthlyOpts = {
    plugins: { legend: { display: true } },
    scales: {
      y: {
        beginAtZero: false,
        suggestedMin: yyr.min,
        suggestedMax: yyr.max,
        ticks: { callback: (v) => pctFmt(v) }, // Ticks u %
        grid: { color: 'rgba(0,0,0,0.06)' }, // Svetla mreža
      },
      x: { grid: { color: 'rgba(0,0,0,0.06)' } },
    },
  };

  // Brza statistika (na osnovu godišnjeg niza)
  const latest = series[series.length - 1]; // Poslednja godina u nizu
  const prev = series[series.length - 2]; // Prethodna godina
  const yoy = latest && prev ? latest.total - prev.total : null; // YoY apsolutna promena
  const yoyPct = latest && prev ? (yoy / prev.total) * 100 : null; // YoY relativna promena (%)

  // ───────────────────────────── Export akcije (CSV) ─────────────────────────
  function exportYearlyCSV() {
    // Izvoz godišnjih total-a u CSV
    const rows = series.map((r) => ({ year: r.year, total_rsd: r.total }));
    const csv = toCSV(rows, [
      { key: 'year', label: 'Year' },
      { key: 'total_rsd', label: 'Total_RSD' },
    ]);
    downloadCSV(`consumption_yearly_last-${last}.csv`, csv); // Preuzmi fajl
  }

  function exportMonthlyCSV() {
    // Izvoz mesečnog CPI za selektovanu godinu
    const rows = mSeries.map((r) => ({
      year: selYear,
      month: r.month,
      month_name: MONTHS[(r.month - 1 + 12) % 12],
      cpi_index_2006_100: r.index ?? '',
    }));
    const csv = toCSV(rows, [
      { key: 'year', label: 'Year' },
      { key: 'month', label: 'Month' },
      { key: 'month_name', label: 'Month_Name' },
      { key: 'cpi_index_2006_100', label: 'CPI_Index_2006_100' },
    ]);
    downloadCSV(`cpi_monthly_${selYear}_all-items.csv`, csv); // Preuzmi fajl
  }
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className='space-y-6'>
      {/* Kontrole: izbor broja godina, izbor CPI godine, export dugmad i “quick stats” */}
      <section className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-end gap-4'>
          {/* Kontrola: koliko poslednjih godina učitavamo */}
          <div>
            <label className='block text-sm font-medium text-slate-700'>
              Last N years
            </label>
            <select
              className='mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              value={last}
              onChange={(e) => setLast(Number(e.target.value))}
            >
              {[3, 5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Kontrola: za koju godinu prikazujemo mesečni CPI i CPI YoY */}
          <div>
            <label className='block text-sm font-medium text-slate-700'>
              CPI year
            </label>
            <select
              className='mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              value={selYear}
              onChange={(e) => setSelYear(e.target.value)}
            >
              {yLabels.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Dugmad za export CSV (godišnji i mesečni) */}
          <div className='ml-auto flex gap-3'>
            <button
              type='button'
              onClick={exportYearlyCSV}
              className='inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              Export Yearly CSV
            </button>
            <button
              type='button'
              onClick={exportMonthlyCSV}
              className='inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              Export Monthly CSV
            </button>
          </div>

          {/* “Quick summary” traka sa najnovijom godinom i YoY statistikama */}
          <div className='w-full text-sm text-slate-600 mt-2'>
            Latest:{' '}
            <span className='font-semibold text-slate-900'>
              {latest?.year ?? '—'}
            </span>{' '}
            • Total:{' '}
            <span className='font-semibold'>
              {latest ? fmtFull.format(latest.total) : '—'} RSD
            </span>{' '}
            • YoY:{' '}
            <span
              className={`font-semibold ${
                yoy >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {yoy != null ? fmtFull.format(yoy) : '—'} RSD
            </span>
            {yoyPct != null && (
              <span className='text-slate-500'> ({yoyPct.toFixed(1)}%)</span>
            )}
          </div>
        </div>
      </section>

      {/* Mreža sa 4 grafikona: godišnji total, mesečni CPI, YoY potrošnje i CPI YoY po mesecima */}
      <div className='grid gap-6 lg:grid-cols-2'>
        {/* Godišnji total potrošnje (linijski grafikon) */}
        <ChartCard
          title={`Yearly totals — last ${last}`}
          type='line'
          data={yearlyData}
          options={yearlyOpts}
        />
        {/* Mesečni CPI za odabranu godinu (linijski grafikon) */}
        <ChartCard
          title={`Monthly CPI — ${selYear} (2006=100)`}
          type='line'
          data={monthlyData}
          options={monthlyOpts}
        />
        {/* YoY % promene potrošnje (linijski grafikon) */}
        <ChartCard
          title={`Consumption YoY change (%) — last ${Math.max(2, last)}`}
          type='line'
          data={growthPctData}
          options={growthPctOpts}
        />
        {/* CPI YoY po mesecima (stubičasti grafikon) */}
        <ChartCard
          title={`CPI YoY by month (%) — ${selYear}`}
          type='bar'
          data={yoyMonthlyData}
          options={yoyMonthlyOpts}
        />
      </div>
    </div>
  );
}
