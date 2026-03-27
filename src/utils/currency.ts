import { formatNumber } from './formatNumber';
import { eventBus } from '@/core/EventBus';

/** Available currency symbols */
export const CURRENCY_SYMBOLS = ['$', '€', '£', '¥', '₩', '₹', '₽', 'CHF'] as const;
export type CurrencySymbol = (typeof CURRENCY_SYMBOLS)[number];

let currentSymbol: CurrencySymbol = '$';

export function getCurrencySymbol(): CurrencySymbol {
  return currentSymbol;
}

export function setCurrencySymbol(symbol: CurrencySymbol): void {
  if (symbol === currentSymbol) return;
  currentSymbol = symbol;
  eventBus.emit('CurrencyChanged', { symbol });
}

/** Format a number as money with currency symbol appended (e.g. "150$") */
export function formatMoney(n: number): string {
  return `${formatNumber(n)}${currentSymbol}`;
}
