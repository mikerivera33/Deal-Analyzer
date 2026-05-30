import { FileText, FileSpreadsheet, Download } from 'lucide-react'

interface DownloadLinkProps {
  href: string
  label: string
  sub: string
  icon: React.ReactNode
}

function DownloadLink({ href, label, sub, icon }: DownloadLinkProps) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-border bg-card hover:bg-accent/5 p-3 transition-colors"
      data-testid={`download-${label.toLowerCase().replace(/\s+/g, '-')}`}
      download
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-sm font-medium">{label}</span>
        <Download className="h-3.5 w-3.5 ml-auto opacity-60" />
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </a>
  )
}

export function DownloadsPanel({ jobId }: { jobId: string }) {
  const base = `/api/jobs/${jobId}/download`
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <DownloadLink
        href={`${base}/advisory_pdf`}
        label="Advisory PDF"
        sub="5-page partner memo"
        icon={<FileText className="h-4 w-4" />}
      />
      <DownloadLink
        href={`${base}/underwriting_xlsx`}
        label="Underwriting XLSX"
        sub="Pro-forma · scenarios · risk register"
        icon={<FileSpreadsheet className="h-4 w-4" />}
      />
      <DownloadLink
        href={`${base}/deal_json`}
        label="Deal JSON"
        sub="audit trail"
        icon={<FileText className="h-4 w-4" />}
      />
    </div>
  )
}
