'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Link, FileText, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ManualInputForm } from './ManualInputForm'
import type { DealInput } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DealUploaderProps {
  onJobCreated: (jobId: string) => void
}

export function DealUploader({ onJobCreated }: DealUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showManual, setShowManual] = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setError(null) }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxSize: 100 * 1024 * 1024,
    multiple: false,
  })

  async function submitFile() {
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      if (file) form.append('file', file)
      if (url) form.append('url', url)
      const res = await fetch('/api/analyze', { method: 'POST', body: form })
      const data = await res.json()
      if (data.jobId) onJobCreated(data.jobId)
      else setError(data.error || 'Analysis failed')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function submitDemo() {
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('demo', '1')
      const res = await fetch('/api/analyze', { method: 'POST', body: form })
      const data = await res.json()
      if (data.jobId) onJobCreated(data.jobId)
      else setError(data.error || 'Demo failed')
    } finally {
      setLoading(false)
    }
  }

  async function submitManual(deal: DealInput) {
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('manual', JSON.stringify(deal))
      const res = await fetch('/api/analyze', { method: 'POST', body: form })
      const data = await res.json()
      if (data.jobId) onJobCreated(data.jobId)
      else setError(data.error || 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !!(file || url)

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'rounded-xl border-2 border-dashed border-border bg-card p-10 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5',
          isDragActive && 'border-primary bg-primary/10'
        )}
        data-testid="dropzone"
      >
        <input {...getInputProps()} data-testid="input-file" />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-foreground font-medium mb-1">
          Drop OM PDF, T-12 spreadsheet, rent roll, or paste a Crexi/LoopNet URL.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Accepted: PDF, XLSX, XLS, CSV. Max 100 MB.
        </p>
        <Button variant="outline" size="sm" type="button" data-testid="button-choose-file">
          Choose file
        </Button>
      </div>

      {/* Selected file */}
      {file && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-selected-file">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{file.name}</span>
          <button onClick={() => setFile(null)} className="ml-auto text-muted-foreground hover:text-destructive">✕</button>
        </div>
      )}

      {/* URL input */}
      <div className="flex items-center gap-2">
        <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          placeholder="https://www.crexi.com/properties/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          data-testid="input-url"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive" data-testid="text-landing-error">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={submitFile}
          disabled={!canSubmit || loading}
          className="flex-1"
          data-testid="button-analyze"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Run Analysis
        </Button>
        <Button variant="outline" onClick={submitDemo} disabled={loading}>
          Try Demo
        </Button>
      </div>

      {/* Manual form toggle */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
        onClick={() => setShowManual((v) => !v)}
      >
        {showManual ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        or enter manually
      </button>

      {showManual && (
        <div className="rounded-xl border border-border bg-card p-5">
          <ManualInputForm onSubmit={submitManual} loading={loading} />
        </div>
      )}
    </div>
  )
}
