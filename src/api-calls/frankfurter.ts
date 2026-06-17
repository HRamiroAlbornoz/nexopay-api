import { z } from 'zod';
import { ExchangeRates } from '../types/currency.types';

const FRANKFURTER_URL = 'https://api.frankfurter.app';
export const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

// Validación flexible: solo exige que 'rates' sea un objeto con pares clave-valor numéricos.
const responseSchema = z.object({
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

interface RatesCache {
  rates: ExchangeRates;
  lastFetched: Date;
}

let cache: RatesCache | null = null;
let inflight: Promise<ExchangeRates> | null = null;

async function fetchFromAPI(): Promise<ExchangeRates> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${FRANKFURTER_URL}/latest?from=EUR`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Frankfurter respondió con status ${response.status}`);
    }

    const data = responseSchema.parse(await response.json());

    // Extraer solo las monedas que nos interesan (si no vienen, usar 1 como fallback)
    const rates: ExchangeRates = {
      EUR: 1,
      USD: data.rates.USD ?? 1,
      ARS: data.rates.ARS ?? 1,
      // Si necesitas otras monedas, puedes agregarlas aquí de forma similar
    };

    return rates;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getRates(): Promise<ExchangeRates> {
  const now = new Date();

  if (cache && now.getTime() - cache.lastFetched.getTime() < CACHE_TTL_MS) {
    return { ...cache.rates };
  }

  if (inflight) {
    return inflight;
  }

  inflight = fetchFromAPI()
    .then((rates) => {
      cache = { rates, lastFetched: new Date() };
      return { ...rates };
    })
    .catch((err) => {
      console.error('Frankfurter: error al obtener tasas:', err);
      if (cache) {
        console.warn('Usando caché anterior para tasas de cambio');
        return { ...cache.rates };
      }
      // Si no hay caché, lanzamos un error controlado (el chatbot lo capturará y seguirá sin tasas)
      throw new Error('No se pudieron obtener tasas de cambio');
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}