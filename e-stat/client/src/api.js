const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';
// Baza URL-a za backend API.
// Prvo pokušava da uzme vrednost iz Vite env promenljive VITE_API_BASE,
// a ako nije definisana, koristi lokalni podrazumevani URL.

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}
// setToken: čuva JWT (ili sličan) token u localStorage-u ako je prosleđen,
// ili ga briše ako je falsy (npr. null/undefined/empty).

export function getToken() {
  return localStorage.getItem('token');
}
// getToken: vraća trenutno sačuvani token iz localStorage-a (ili null ako ne postoji).

export async function api(path, options = {}) {
  const token = getToken(); // Učitaj token (ako postoji) za Authorization header
  const headers = {
    'Content-Type': 'application/json', // Podrazumevani Content-Type za telo (JSON)
    ...(token ? { Authorization: `Bearer ${token}` } : {}), // Ako ima token, dodaj Bearer auth header
    ...options.headers, // Dozvoli da pozivalac pregazi/produži headere
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers }); // Pozovi fetch ka API-u (spajamo base + path)

  const ct = res.headers.get('content-type') || ''; // Proveri Content-Type odgovora (može biti null)
  const body = ct.includes('application/json')
    ? await res.json() // Ako je JSON, parsiraj kao JSON
    : await res.text(); // Inače čitaj kao običan tekst (npr. poruka o grešci)

  if (!res.ok)
    // Ako HTTP status nije u opsegu 200-299
    throw new Error(body?.message || res.statusText || 'Request error');
  // Baci Error sa porukom iz tela (ako je JSON sa {message}), ili sa statusText, ili generičkom porukom.

  return body; // Vrati parsirani odgovor pozivaocu
}
