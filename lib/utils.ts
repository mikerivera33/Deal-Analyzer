import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n == null || isNaN(n)) return '—'
  return `${(n * 100).toFixed(decimals)}%`
}

export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(decimals)
}

/** Standard mortgage payment (PMT equivalent) */
export function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper
  return (pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1)
}

/** Remaining loan balance after k payments */
export function loanBalance(rate: number, nper: number, pv: number, k: number): number {
  if (rate === 0) return pv - (pv / nper) * k
  const payment = pmt(rate, nper, pv)
  return pv * Math.pow(1 + rate, k) - payment * ((Math.pow(1 + rate, k) - 1) / rate)
}
