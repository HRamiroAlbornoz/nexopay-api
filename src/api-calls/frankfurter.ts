import { z } from 'zod';
import { ExchangeRates } from '../types/currency.types';

const FRANKFURTER_URL = 'https://api.frankfurter.app';
export const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const responseSchema = z.object({
  base: z.literal('EUR'),
  date: z.string(),
  rates: z.object({
    USD: z.number().positive(),
    ARS: z.number().positive(),
  }),
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
    const response = await fetch(`${FRANKFURTER_URL}/latest?from=EUR&to=USD,ARS`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Frankfurter respondió con status ${response.status}`);
    }

    const data = responseSchema.parse(await response.json());

    return {
      EUR: 1,
      USD: data.rates.USD,
      ARS: data.rates.ARS,
    };
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
      if (cache) {
        console.error('Frankfurter: error al actualizar tasas, usando caché anterior:', err);
        return { ...cache.rates };
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
