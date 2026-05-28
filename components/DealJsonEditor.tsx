'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/dialog'
import { Button } from './ui/button'
import type { DealInput } from '@/lib/types'

interface DealJsonEditorProps {
  deal: DealInput
  jobId: string
  open: boolean
  onClose: () => void
  onNewJob: (newJobId: string) => void
}

export function DealJsonEditor({ deal, jobId, open, onClose, onNewJob }: DealJsonEditorProps) {
  const [value, setValue] = useState(() => JSON.stringify(deal, null, 2))
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRerun() {
    setParseError(null)
    let parsed: DealInput
    try {
      parsed = JSON.parse(value)
    } catch (e: unknown) {
      setParseError((e as Error).message)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal: parsed }),
      })
      const data = await res.json()
      if (data.jobId) {
        onNewJob(data.jobId)
        onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Inputs (Deal JSON)</DialogTitle>
          <DialogClose data-testid="button-close-modal" />
        </DialogHeader>
        <p className="px-5 py-3 text-xs text-muted-foreground">
          Override any field. Editable structure mirrors the canonical Deal JSON schema. Click
          &ldquo;Re-run&rdquo; to push changes through the engine and regenerate all deliverables.
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 font-mono text-xs border-0 bg-background p-4 outline-none resize-none min-h-[300px]"
          spellCheck={false}
          data-testid="textarea-deal-json"
        />
        {parseError && (
          <div className="px-5 pt-2 text-xs text-destructive">JSON parse error: {parseError}</div>
        )}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button onClick={handleRerun} disabled={loading} data-testid="button-rerun">
            {loading ? 'Running…' : 'Re-run'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
