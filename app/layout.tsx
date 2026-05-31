import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'LJM Deal Analyzer',
  description: 'Underwrite any multifamily deal in 60 seconds. LJM Homes LLC.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Geist+Mono:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-sm">
            <div className="mx-auto max-w-screen-xl flex items-center gap-6 px-6 h-12">
              <Link href="/" className="flex items-center gap-2 font-bold text-[var(--primary)] text-sm tracking-tight">
                LJM Deal Analyzer
              </Link>
              <div className="flex items-center gap-4 ml-auto">
                <Link
                  href="/"
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  New Analysis
                </Link>
                <Link
                  href="/deals"
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Deal History
                </Link>
              </div>
            </div>
          </nav>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
