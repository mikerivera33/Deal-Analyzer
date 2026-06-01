'use client'
import { useRouter } from 'next/navigation'
import { DealUploader } from '@/components/DealUploader'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function HomePage() {
  const router = useRouter()

  function handleJobCreated(jobId: string) {
    router.push(`/analyze/${jobId}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">LJM Deal Analyzer</h1>
            <p className="text-xs text-muted-foreground">Michael Rivera / LJM Homes LLC</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            Underwrite any multifamily deal in 60 seconds.
          </h2>
          <p className="text-muted-foreground">
            Output: 3 downloadable files in under 90 seconds.
          </p>
        </div>
        <DealUploader onJobCreated={handleJobCreated} />
      </main>
    </div>
  )
}
