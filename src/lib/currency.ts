/** Currencies offered as one-tap choices. Any ISO 4217 code still works if typed. */
export const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD'] as const;

const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', AE: 'AED',
  JP: 'JPY', CH: 'CHF', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR',
  BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
};

/** Locale used to format each currency, so INR gets Indian grouping (₹1,80,000.00). */
const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN', GBP: 'en-GB', EUR: 'en-IE', AUD: 'en-AU', CAD: 'en-CA', SGD: 'en-SG', AED: 'en-AE', NZD: 'en-NZ',
};

export function localeForCurrency(currency: string): string {
  return CURRENCY_LOCALE[currency] ?? 'en-US';
}

/** Best guess at the user's currency from the device locale (e.g. "en-IN" → INR). */
export function deviceCurrency(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
    return (region && REGION_CURRENCY[region]) || 'USD';
  } catch {
    return 'USD';
  }
}
