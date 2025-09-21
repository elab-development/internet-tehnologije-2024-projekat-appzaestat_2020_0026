import { useEffect, useState } from 'react'; // React hooks za stanje i efekte
import { useNavigate, useOutletContext } from 'react-router-dom'; // Navigacija i čitanje konteksta iz layout-a
import ChartCard from '../components/ChartCard'; // Reusable kartica koja prikazuje Chart.js grafikon
import { apiGet } from '../lib'; // Helper za GET pozive ka našem backend API-ju

// Formatiranje za prikaz pune vrednosti (npr. 123,456)
const fmtFull = new Intl.NumberFormat('en-US');
// Kompaktno formatiranje (npr. 123k, 3.4M) za ose grafika
const fmtCompact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

// Pomoćna funkcija koja predlaže min/max ose uz mali padding
function axisRange(values, pad = 0.08) {
  const v = values.filter(Number.isFinite); // Zadrži samo numeričke vrednosti
  if (!v.length) return { min: 0, max: 1 }; // Fallback kada nema podataka
  const min = Math.min(...v); // Minimum iz serije
  const max = Math.max(...v); // Maksimum iz serije
  if (min === max) return { min: min * 0.9, max: max * 1.1 || 1 }; // Ako je sve isto, malo raširi skalu
  const span = max - min; // Raspon vrednosti
  return { min: min - span * pad, max: max + span * pad }; // Dodaj padding gore/dole
}

export default function Analytics() {
  // Glavna komponenta "Analytics" stranice
  const { isAuthed } = useOutletContext(); // Da li je korisnik ulogovan (dolazi iz App layout-a)
  const nav = useNavigate(); // Programska navigacija (za redirect)

  const [last, setLast] = useState(10); // Koliko poslednjih godina učitavamo (3/5/10/15/20)
  const [selected, setSelected] = useState(''); // Istaknuta (highlight) godina u bar chart-u

  const [series, setSeries] = useState([]); // Godišnji total potrošnje: [{ year, total }]
  const [years, setYears] = useState([]); // Samo niz godina (za dropdown): [2025, 2024, …]

  // Stanja za nove izveštaje
  const [idxBase, setIdxBase] = useState(''); // Baza za indeks (godina = 100)
  const [indexSeries, setIndexSeries] = useState([]); // Serija indeksa: [{ year, index }]
  const [realBase, setRealBase] = useState(''); // Bazna CPI godina za deflacionisanu potrošnju
  const [realMethod, setRealMethod] = useState('avg'); // Način računanja godišnjeg CPI: 'avg' | 'december'
  const [realSeries, setRealSeries] = useState([]); // Serija realne potrošnje: [{year, real, nominal, cpi_index}]
  const [cpiAvg, setCpiAvg] = useState([]); // Godišnji CPI (prosek meseci)
  const [cpiDec, setCpiDec] = useState([]); // Godišnji CPI (decembar)

  const [loading, setLoading] = useState(true); // UI: indikator učitavanja
  const [err, setErr] = useState(''); // UI: poruka o grešci

  // Ako korisnik nije ulogovan → preusmeri na /login
  useEffect(() => {
    if (!isAuthed) nav('/login');
  }, [isAuthed, nav]);

  // Učitaj osnovne podatke: lista godina + godišnji total potrošnje
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); // Uključi loader
        setErr(''); // Očisti grešku

        // Paralelno: uzmi poslednjih N godina i njihove totale
        const [y, s] = await Promise.all([
          apiGet(`/stats/consumption/years?last=${last}`), // Backend: niz godina
          apiGet(`/stats/consumption/yearly?last=${last}`), // Backend: [{year, total}]
        ]);

        const ys = y.years || []; // Bezbedno čitanje polja
        const ser = s.series || [];
        setYears(ys); // Sačuvaj godine
        setSeries(ser); // Sačuvaj seriju
        setSelected(String(ys[0] ?? '')); // Podrazumevano istakni najnoviju godinu (prva u listi)

        // Podrazumevane baze: najstarija godina u prozoru (ser[0])
        const oldest = ser.length ? ser[0].year : '';
        setIdxBase((prev) => prev || String(oldest || '')); // Ako nema baze već, postavi je
        setRealBase((prev) => prev || String(oldest || ''));
      } catch (e) {
        setErr(String(e)); // Prikaži grešku
      } finally {
        setLoading(false); // Isključi loader
      }
    })();
  }, [last]); // Re-run kada se promeni "last"

  // Učitaj Consumption Index (base=idxBase → 100)
  useEffect(() => {
    if (!idxBase) return; // Ne pokušavaj dok baza nije postavljena
    (async () => {
      try {
        const data = await apiGet(
          `/stats/consumption/index?base=${idxBase}&last=${last}` // Backend vraća [{year, index}]
        );
        setIndexSeries(data.series || []); // Sačuvaj indeks seriju
      } catch (e) {
        console.error(e);
        setIndexSeries([]); // U slučaju greške resetuj
      }
    })();
  }, [idxBase, last]); // Re-run na promenu baze ili prozora godina

  // Učitaj Real consumption (deflacionisano CPI-jem: baza i metod)
  useEffect(() => {
    if (!realBase) return; // Ne radi dok nema bazne godine
    (async () => {
      try {
        const data = await apiGet(
          `/stats/consumption/real?base=${realBase}&method=${realMethod}&last=${last}`
        );
        setRealSeries(data.series || []); // Sačuvaj real seriju
      } catch (e) {
        console.error(e);
        setRealSeries([]); // Reset u slučaju greške
      }
    })();
  }, [realBase, realMethod, last]); // Re-run na promenu baze/metoda/prozora

  // Učitaj godišnji CPI (dva metoda: avg i december) — koristi se za uporedni grafikon
  useEffect(() => {
    (async () => {
      try {
        const [avg, dec] = await Promise.all([
          apiGet(`/stats/prices/cpi/annual?method=avg&last=${last}`), // Prosek mesečnih indeksa
          apiGet(`/stats/prices/cpi/annual?method=december&last=${last}`), // Sam decembar
        ]);
        setCpiAvg(avg.series || []); // Sačuvaj avg seriju
        setCpiDec(dec.series || []); // Sačuvaj dec seriju
      } catch (e) {
        console.error(e);
        setCpiAvg([]); // Resetuj u slučaju greške
        setCpiDec([]);
      }
    })();
  }, [last]); // Re-run kad se promeni "last"

  // UI: Loading / Error ekrani
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

  // ==================== Chart 1: Horizontal bar — Yearly total (RSD) ====================
  const values = series.map((d) => d.total); // Vrednosti za X osu (horizontalni bar)
  const { min, max } = axisRange(values); // Predlog skale X-ose
  const chartData = {
    labels: series.map((d) => d.year), // Godine na Y-osi (pošto je horizontalni)
    datasets: [
      {
        label: 'Yearly total (RSD)', // Oznaka seta
        data: values, // Vrednosti
        backgroundColor: series.map(
          (
            d // Oboj izabranu godinu tamnije
          ) =>
            String(d.year) === selected
              ? 'rgba(37, 99, 235, .9)'
              : 'rgba(37, 99, 235, .35)'
        ),
        borderColor: 'rgb(37, 99, 235)', // Boja ivice
        borderWidth: 1.5,
      },
    ],
  };
  const options = {
    indexAxis: 'y', // Horizontalni bar (Y je kategorija)
    plugins: {
      legend: { display: false }, // Sakrij legendu (nije ključna ovde)
      tooltip: {
        callbacks: { label: (ctx) => `${fmtFull.format(ctx.parsed.x)} RSD` }, // Formatiraj tooltip
      },
    },
    scales: {
      x: {
        beginAtZero: false, // Ne forsiraj nulu
        suggestedMin: min, // Predlog min
        suggestedMax: max, // Predlog max
        ticks: { callback: (v) => fmtCompact.format(v) }, // Kompaktni tick-ovi
        grid: { color: 'rgba(0,0,0,0.06)' }, // Svetla mreža
      },
      y: { grid: { color: 'rgba(0,0,0,0.06)' } }, // Svetla mreža i na Y
    },
  };

  // Izračunaj YoY (apsolutni i %), za istaknutu godinu
  const sel = series.find((s) => String(s.year) === selected); // Aktivna (izabrana) godina
  const prev = series.find((s) => s.year === Number(selected) - 1); // Prethodna godina
  const yoy = sel && prev ? sel.total - prev.total : null; // Apsolutna promena
  const yoyPct = sel && prev ? (yoy / prev.total) * 100 : null; // Relativna promena (%)

  // ==================== Chart 2: Consumption Index (base year = 100) ====================
  const idxVals = indexSeries.map(
    (d) => (Number.isFinite(d.index) ? d.index : null) // Dozvoli rupe ako nema vrednosti
  );
  const idxR = axisRange(idxVals.filter(Number.isFinite)); // Range za indeks
  const indexData = {
    labels: indexSeries.map((d) => d.year), // Godine na X
    datasets: [
      {
        label: `Consumption Index (base ${idxBase}=100)`, // Oznaka sa baznom godinom
        data: idxVals, // Indeksne vrednosti
        borderColor: 'rgb(37, 99, 235)', // Plava linija
        backgroundColor: 'rgba(37, 99, 235, .12)', // Svetloplava ispuna
        pointRadius: 3,
        fill: true,
        tension: 0.25,
        spanGaps: true, // Poveži segmente čak i ako ima null
      },
    ],
  };
  const indexOpts = {
    plugins: { legend: { display: true } }, // Prikaži legendu
    scales: {
      y: { beginAtZero: false, suggestedMin: idxR.min, suggestedMax: idxR.max }, // Skala prema podacima
      x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, // Ograniči broj tick-ova
    },
  };

  // ==================== Chart 3: Real (CPI-deflated) consumption ====================
  const realVals = realSeries.map(
    (d) => (Number.isFinite(d.real) ? d.real : null) // Realne vrednosti (deflacionisane)
  );
  const realR = axisRange(realVals.filter(Number.isFinite)); // Range za real seriju
  const realData = {
    labels: realSeries.map((d) => d.year), // Godine
    datasets: [
      {
        label: `Real consumption (base CPI ${realBase}, ${realMethod})`, // Oznaka sa bazom i metodom
        data: realVals, // Realne vrednosti
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, .12)',
        pointRadius: 3,
        fill: true,
        tension: 0.25,
        spanGaps: true,
      },
    ],
  };
  const realOpts = {
    plugins: { legend: { display: true } },
    scales: {
      y: {
        beginAtZero: false,
        suggestedMin: realR.min,
        suggestedMax: realR.max,
        ticks: { callback: (v) => fmtCompact.format(v) }, // Kompaktni tick-ovi (RSD)
      },
      x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
    },
  };

  // ==================== Chart 4: Annual CPI (avg vs December) ====================
  const cpiYears = (cpiAvg.length ? cpiAvg : cpiDec).map((d) => d.year); // Koristi onu seriju koja postoji za labele
  const cpiAvgVals = cpiAvg.map((d) =>
    Number.isFinite(d.index) ? d.index : null
  );
  const cpiDecVals = cpiDec.map((d) =>
    Number.isFinite(d.index) ? d.index : null
  );
  const cpiAll = [...cpiAvgVals, ...cpiDecVals].filter(Number.isFinite); // Svi brojevi radi range-a
  const cpiR = axisRange(cpiAll); // Izračunaj range
  const cpiData = {
    labels: cpiYears, // Godine na X
    datasets: [
      {
        label: 'CPI (avg of months)', // Prosek meseci
        data: cpiAvgVals,
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, .10)',
        pointRadius: 3,
        fill: false,
        tension: 0.25,
        spanGaps: true,
      },
      {
        label: 'CPI (December)', // Samo decembar
        data: cpiDecVals,
        borderColor: 'rgb(59, 130, 246)', // Slična plava
        backgroundColor: 'rgba(59, 130, 246, .10)',
        pointRadius: 3,
        fill: false,
        tension: 0.25,
        spanGaps: true,
      },
    ],
  };
  const cpiOpts = {
    plugins: { legend: { display: true } },
    scales: {
      y: { beginAtZero: false, suggestedMin: cpiR.min, suggestedMax: cpiR.max }, // Skala prema podacima
      x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
    },
  };

  return (
    <div className='space-y-6'>
      {/* Kontrole (filteri) na vrhu stranice */}
      <section className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-end gap-4'>
          {/* Izbor koliko poslednjih godina prikazujemo */}
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

          {/* Izbor istaknute godine (za bar chart) */}
          <div>
            <label className='block text-sm font-medium text-slate-700'>
              Highlight year
            </label>
            <select
              className='mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Kontrola baze za indeks (godina = 100) */}
          <div>
            <label className='block text-sm font-medium text-slate-700'>
              Index base (year=100)
            </label>
            <select
              className='mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              value={idxBase}
              onChange={(e) => setIdxBase(e.target.value)}
            >
              {series.map((s) => (
                <option key={s.year} value={s.year}>
                  {s.year}
                </option>
              ))}
            </select>
          </div>

          {/* Kontrole za realnu potrošnju (CPI baza i metod) */}
          <div>
            <label className='block text-sm font-medium text-slate-700'>
              Real base (CPI year)
            </label>
            <select
              className='mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              value={realBase}
              onChange={(e) => setRealBase(e.target.value)}
            >
              {series.map((s) => (
                <option key={s.year} value={s.year}>
                  {s.year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700'>
              CPI method
            </label>
            <select
              className='mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              value={realMethod}
              onChange={(e) => setRealMethod(e.target.value)}
            >
              <option value='avg'>Average of months</option>
              <option value='december'>December</option>
            </select>
          </div>

          {/* Brza statistika za izabranu godinu (YoY) */}
          <div className='text-sm text-slate-600 ml-auto'>
            {selected && (
              <>
                <span className='mr-2'>
                  Selected:{' '}
                  <span className='font-semibold text-slate-900'>
                    {selected}
                  </span>
                </span>
                {yoy != null && (
                  <span>
                    YoY:{' '}
                    <span
                      className={`font-semibold ${
                        yoy >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {fmtFull.format(yoy)} RSD
                    </span>{' '}
                    {yoyPct != null && (
                      <span className='text-slate-500'>
                        ({yoyPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Mreža sa 4 grafikona: bar, indeks, realna potrošnja, CPI (avg vs dec) */}
      <div className='grid gap-6 lg:grid-cols-2'>
        {/* 1) Bar chart: uporedni prikaz godišnjih total-a */}
        <ChartCard
          title={`Household consumption — last ${last} years`}
          type='bar'
          data={chartData}
          options={options}
        />

        {/* 2) Linijski grafikon: consumption index (base=100) */}
        <ChartCard
          title={`Consumption Index (base ${idxBase}=100) — last ${last}`}
          type='line'
          data={indexData}
          options={indexOpts}
        />

        {/* 3) Linijski grafikon: real (CPI-deflated) consumption */}
        <ChartCard
          title={`Real consumption — base ${realBase} (${realMethod})`}
          type='line'
          data={realData}
          options={realOpts}
        />

        {/* 4) Linijski grafikon: godišnji CPI (prosek meseci vs decembar) */}
        <ChartCard
          title={`Annual CPI (2006=100) — avg vs December — last ${last}`}
          type='line'
          data={cpiData}
          options={cpiOpts}
        />
      </div>
    </div>
  );
}
