export async function apiGet(path) {
  // Asinhrona GET pomoćna funkcija za pozive ka backend API-ju
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';
  // Baza URL-a: pokušava iz Vite env promenljive VITE_API_BASE, u suprotnom koristi lokalni podrazumevani

  const token = localStorage.getItem('token'); // Učitaj JWT (ili sličan) token iz localStorage-a, ako postoji

  const res = await fetch(`${base}${path}`, {
    // Pošalji HTTP GET ka (base + path)
    headers: {
      'Content-Type': 'application/json', // Očekujemo JSON odgovor (iako GET nema telo)
      ...(token ? { Authorization: `Bearer ${token}` } : {}), // Ako postoji token, dodaj Authorization: Bearer <token>
    },
  });

  if (!res.ok) throw new Error(await res.text()); // Ako status nije 2xx, pročitaj tekst i baci grešku

  const ct = res.headers.get('content-type') || ''; // Uhvati Content-Type zaglavlje (može biti null)
  return ct.includes('application/json') ? res.json() : res.text(); // Ako je JSON, parsiraj; inače vrati plain text
}

export const fmt = new Intl.NumberFormat('en-US'); // Formatter za brojeve (npr. 1234567 -> 1,234,567)
