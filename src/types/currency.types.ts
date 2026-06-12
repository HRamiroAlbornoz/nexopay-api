export const SUPPORTED_CURRENCIES = ['ARS', 'USD', 'EUR'] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export type ExchangeRates = Record<CurrencyCode, number>;
