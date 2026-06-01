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

/** Coerce any value to a finite number; strips currency symbols/commas. Returns fallback for null/NaN/Infinity. */
export function safeNum(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback
  if (typeof v === 'number') return isFinite(v) ? v : fallback
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '')
    const n = parseFloat(cleaned)
    return isFinite(n) ? n : fallback
  }
  return fallback
}

/** Validate that a string is a well-formed UUID v4 */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/**
 * Validate that a URL is safe to fetch (SSRF protection).
 * Blocks private IP ranges, loopback, metadata endpoints, and non-http(s) schemes.
 */
export function isSafeUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase()

  // Block metadata endpoint (cloud provider IMDS)
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return false

  // Block loopback and unspecified addresses (0.0.0.0/:: route to loopback on Linux)
  if (host === 'localhost' || host === '::1' || host === '::' || host === '0.0.0.0') return false
  if (/^127\./.test(host)) return false

  // Block private IPv4 ranges
  if (/^10\./.test(host)) return false
  if (/^192\.168\./.test(host)) return false
  // 172.16.0.0/12 → 172.16.x.x – 172.31.x.x
  const m = host.match(/^172\.(\d+)\./)
  if (m) {
    const second = parseInt(m[1], 10)
    if (second >= 16 && second <= 31) return false
  }

  // Block link-local
  if (/^169\.254\./.test(host)) return false

  return true
}

/** Strip characters that could cause issues in PDF text / HTML output */
export function sanitizeString(s: string | undefined): string {
  if (!s) return ''
  // Remove control characters and null bytes; trim whitespace
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, 1000)
}
