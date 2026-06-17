export const SUPPORTED_CURRENCIES = ['ARS', 'USD', 'EUR'] as const;

// Tolerancia para comparar montos NUMERIC(18,6) ya convertidos a float8 en JS —
// evita falsos negativos por arrastre de coma flotante en cálculos de dinero.
export const FLOAT_EPSILON = 1e-6;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export type ExchangeRates = Record<CurrencyCode, number>;
