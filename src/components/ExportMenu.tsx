import {
  Braces,
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  FileText,
  ImageDown,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Analysis, Footprint, Workflow } from '../types'
import { copyText } from '../lib/clipboard'
import {
  downloadSvgAsPng,
  downloadText,
  reportFilename,
  toJsonReport,
  toMarkdown,
  toMermaid,
  toSvg,
} from '../lib/export'

interface ExportMenuProps {
  workflow: Workflow
  analysis: Analysis
  footprint: Footprint
  onNotify: (message: string, tone?: 'ok' | 'error') => void
}

interface Item {
  id: string
  label: string
  hint: string
  icon: typeof Copy
  run: () => void | Promise<void>
}

export function ExportMenu({ workflow, analysis, footprint, onNotify }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function notifyError(error: unknown) {
    onNotify(error instanceof Error ? error.message : 'Export failed.', 'error')
  }

  const svg = () => toSvg(workflow, analysis.findings)

  const items: Item[] = [
    {
      id: 'mermaid',
      label: 'Copy Mermaid',
      hint: 'paste into a README',
      icon: Copy,
      run: async () => {
        await copyText(toMermaid(workflow, analysis.findings))
        onNotify('Mermaid diagram copied')
      },
    },
    {
      id: 'markdown',
      label: 'Download Markdown',
      hint: 'review notes for a PR',
      icon: FileText,
      run: () => {
        downloadText(
          reportFilename(workflow, 'md'),
          toMarkdown(workflow, analysis, footprint),
          'text/markdown;charset=utf-8',
        )
        onNotify('Markdown report downloaded')
      },
    },
    {
      id: 'svg',
      label: 'Download SVG',
      hint: 'vector job graph',
      icon: FileCode2,
      run: () => {
        downloadText(
          reportFilename(workflow, 'svg'),
          svg(),
          'image/svg+xml;charset=utf-8',
        )
        onNotify('SVG graph downloaded')
      },
    },
    {
      id: 'png',
      label: 'Download PNG',
      hint: '2× for slides',
      icon: ImageDown,
      run: async () => {
        setBusy('png')
        try {
          await downloadSvgAsPng(reportFilename(workflow, 'png'), svg(), 2)
          onNotify('PNG graph downloaded')
        } finally {
          setBusy(null)
        }
      },
    },
    {
      id: 'json',
      label: 'Download JSON',
      hint: 'jobs and findings',
      icon: Braces,
      run: () => {
        downloadText(
          reportFilename(workflow, 'json'),
          toJsonReport(workflow, analysis, footprint),
          'application/json;charset=utf-8',
        )
        onNotify('JSON report downloaded')
      },
    },
  ]

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-beam/40 bg-beam px-3 py-1.5 text-[11px] font-semibold text-[#04101d] shadow-[0_6px_22px_-10px_rgba(90,169,255,0.9)] transition-colors hover:bg-[#7dbcff]"
      >
        <Download size={12} strokeWidth={2.4} />
        Export
        <ChevronDown
          size={11}
          strokeWidth={2.4}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[232px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b121b] p-1 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]"
        >
          <div className="px-2 pb-1.5 pt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-600">
            Export graph
          </div>
          {items.map((item) => {
            const Icon = item.icon
            const working = busy === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={Boolean(busy)}
                onClick={() => {
                  setOpen(false)
                  Promise.resolve()
                    .then(item.run)
                    .catch(notifyError)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03]">
                  <Icon size={12} className="text-slate-400" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium text-slate-200">
                    {working ? 'Rendering…' : item.label}
                  </span>
                  <span className="block text-[9px] text-slate-600">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
