import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CACHE_TTL_MS } from '../../src/api-calls/exchange-rates';

const mockApiResponse = {
  result: 'success',
  base_code: 'EUR',
  rates: { USD: 1.08, ARS: 1050 },
};

function stubFetchSuccess() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    })
  );
}

describe('getRates', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('llama a la API y retorna las tasas correctas en el primer llamado', async () => {
    stubFetchSuccess();
    const { getRates } = await import('../../src/api-calls/exchange-rates');

    const rates = await getRates();

    expect(rates.EUR).toBe(1);
    expect(rates.USD).toBe(1.08);
    expect(rates.ARS).toBe(1050);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
  });

  it('usa el caché en el segundo llamado sin volver a fetchear', async () => {
    stubFetchSuccess();
    const { getRates } = await import('../../src/api-calls/exchange-rates');

    await getRates();
    await getRates();

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
  });

  it('retorna las tasas del caché anterior cuando la API falla (stale fallback)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        })
        .mockRejectedValueOnce(new Error('Network error'))
    );

    const { getRates } = await import('../../src/api-calls/exchange-rates');

    await getRates();

    vi.advanceTimersByTime(CACHE_TTL_MS + 1000);

    const rates = await getRates();

    expect(rates.USD).toBe(1.08);
    expect(rates.ARS).toBe(1050);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('lanza error cuando la API falla y no hay caché previo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { getRates } = await import('../../src/api-calls/exchange-rates');

    await expect(getRates()).rejects.toThrow('Network error');
  });

  it('lanza error cuando la API responde con status de error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })
    );
    const { getRates } = await import('../../src/api-calls/exchange-rates');

    await expect(getRates()).rejects.toThrow('503');
  });

  it('lanza error cuando la respuesta no incluye ARS o USD (ej: result distinto de success)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'error', 'error-type': 'invalid-key' }),
      })
    );
    const { getRates } = await import('../../src/api-calls/exchange-rates');

    await expect(getRates()).rejects.toThrow();
  });

  it('retorna una copia del caché (no la referencia directa)', async () => {
    stubFetchSuccess();
    const { getRates } = await import('../../src/api-calls/exchange-rates');

    const rates1 = await getRates();
    rates1.USD = 999;

    const rates2 = await getRates();

    expect(rates2.USD).toBe(1.08);
  });
});
