import { z } from 'zod';
import { ExchangeRates } from '../types/currency.types';
import { fetchWithTimeout } from '../helpers/http.helpers';

const EXCHANGE_RATES_URL = 'https://open.er-api.com/v6/latest/EUR';
export const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const responseSchema = z.object({
  result: z.literal('success'),
  base_code: z.literal('EUR'),
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
  const response = await fetchWithTimeout(EXCHANGE_RATES_URL, {}, FETCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`ExchangeRate-API respondió con status ${response.status}`);
  }

  const data = responseSchema.parse(await response.json());

  return {
    EUR: 1,
    USD: data.rates.USD,
    ARS: data.rates.ARS,
  };
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
        console.error('ExchangeRate-API: error al actualizar tasas, usando caché anterior:', err);
        return { ...cache.rates };
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
