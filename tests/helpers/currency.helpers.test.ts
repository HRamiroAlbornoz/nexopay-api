import { describe, it, expect } from 'vitest';
import { convertAmount } from '../../src/helpers/currency.helpers';
import { ExchangeRates } from '../../src/types/currency.types';

const mockRates: ExchangeRates = {
  EUR: 1,
  USD: 1.08,
  ARS: 1050,
};

describe('convertAmount', () => {
  it('devuelve el mismo monto cuando from === to (ARS)', () => {
    expect(convertAmount('ARS', 'ARS', 500, mockRates)).toBe(500);
  });

  it('devuelve el mismo monto cuando from === to (USD)', () => {
    expect(convertAmount('USD', 'USD', 100, mockRates)).toBe(100);
  });

  it('devuelve el mismo monto cuando from === to (EUR)', () => {
    expect(convertAmount('EUR', 'EUR', 50, mockRates)).toBe(50);
  });

  it('convierte ARS a USD correctamente', () => {
    const result = convertAmount('ARS', 'USD', 1050, mockRates);
    expect(result).toBeCloseTo(1.08);
  });

  it('convierte USD a ARS correctamente', () => {
    const result = convertAmount('USD', 'ARS', 1.08, mockRates);
    expect(result).toBeCloseTo(1050);
  });

  it('convierte EUR a USD correctamente', () => {
    const result = convertAmount('EUR', 'USD', 1, mockRates);
    expect(result).toBeCloseTo(1.08);
  });

  it('convierte EUR a ARS correctamente', () => {
    const result = convertAmount('EUR', 'ARS', 1, mockRates);
    expect(result).toBeCloseTo(1050);
  });

  it('convierte ARS a EUR correctamente', () => {
    const result = convertAmount('ARS', 'EUR', 1050, mockRates);
    expect(result).toBeCloseTo(1);
  });

  it('retorna 0 cuando el monto es 0', () => {
    expect(convertAmount('ARS', 'USD', 0, mockRates)).toBe(0);
    expect(convertAmount('USD', 'EUR', 0, mockRates)).toBe(0);
  });

  it('la conversión es reversible: A→B→A retorna el monto original', () => {
    const original = 1000;
    const enUSD = convertAmount('ARS', 'USD', original, mockRates);
    const deVuelta = convertAmount('USD', 'ARS', enUSD, mockRates);
    expect(deVuelta).toBeCloseTo(original);
  });

  it('maneja montos grandes sin perder precisión significativa', () => {
    const result = convertAmount('ARS', 'USD', 1_000_000, mockRates);
    expect(result).toBeCloseTo((1_000_000 / 1050) * 1.08);
  });
});
