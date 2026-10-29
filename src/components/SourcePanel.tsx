import {
  Check,
  FileCode2,
  FileUp,
  GitCompareArrows,
  Layers3,
  ListChecks,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import type { Analysis } from '../types'
import { samples, type WorkflowSample } from '../lib/samples'

interface SourcePanelProps {
  source: string
  filename: string
  activeSampleId: string | null
  error: string | null
  analysis: Analysis | null
  onChange: (value: string) => void
  onLoadSample: (sample: WorkflowSample) => void
  onLoadFile: (file: File) => void
  onReset: () => void
  onCompare: () => void
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Layers3
  label: string
  value: string
  tone?: 'default' | 'critical'
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
        <Icon size={11} strokeWidth={1.9} />
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-[17px] font-semibold leading-none ${
          tone === 'critical' ? 'text-crit' : 'text-slate-200'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

export function SourcePanel({
  source,
  filename,
  activeSampleId,
  error,
  analysis,
  onChange,
  onLoadSample,
  onLoadFile,
  onReset,
  onCompare,
}: SourcePanelProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const lines = source ? source.split('\n').length : 0

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onLoadFile(file)
    event.target.value = ''
  }

  return (
    <aside className="flex min-h-0 flex-col border-b border-white/[0.06] bg-panel/60 lg:border-b-0 lg:border-r">
      <div className="panel-scroll flex-1 overflow-y-auto p-4 xl:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Workflow source
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-beam/20 bg-beam/[0.06] px-2 py-0.5 text-[9.5px] font-medium text-beam-soft/90">
            <LockKeyhole size={9} strokeWidth={2} />
            local only
          </span>
        </div>

        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-ink-900/70 px-2.5 py-2">
          <FileCode2 size={13} className="shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">
            {filename || '.github/workflows/ci.yml'}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-slate-600">
            {lines} lines
          </span>
        </div>

        <div className="relative">
          <textarea
            aria-label="GitHub Actions workflow YAML"
            value={source}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            placeholder="name: CI&#10;on: [push, pull_request]&#10;jobs:&#10;  test:&#10;    runs-on: ubuntu-latest"
            className="code-editor h-[250px] w-full resize-y rounded-lg border border-white/[0.08] bg-[#070b11] p-3 font-mono text-[11px] leading-[1.65] text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-beam/40 focus:ring-1 focus:ring-beam/15"
          />
          {error && (
            <div
              role="alert"
              className="mt-2 rounded-lg border border-crit/25 bg-crit/[0.07] px-3 py-2 text-[10.5px] leading-relaxed text-crit/90"
            >
              <span className="mb-0.5 block font-semibold">Could not read this file</span>
              {error}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10.5px] font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <FileUp size={12} strokeWidth={1.9} />
            Open file
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-[10.5px] font-medium text-slate-500 transition-colors hover:text-slate-200"
          >
            <RotateCcw size={11} strokeWidth={1.9} />
            Reset sample
          </button>
          <button
            type="button"
            onClick={onCompare}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-beam/25 bg-beam/[0.06] px-2.5 py-1.5 text-[10.5px] font-medium text-beam-soft transition-colors hover:border-beam/45 hover:bg-beam/[0.1] hover:text-white"
          >
            <GitCompareArrows size={12} strokeWidth={2} />
            Compare
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".yml,.yaml,.txt,text/yaml,application/yaml"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {analysis ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat icon={Layers3} label="Jobs" value={String(analysis.stats.jobs)} />
            <Stat
              icon={Play}
              label="Instances"
              value={`${analysis.stats.instances}${analysis.stats.dynamicMatrices > 0 ? '+' : ''}`}
            />
            <Stat icon={ListChecks} label="Steps" value={String(analysis.stats.steps)} />
            <Stat
              icon={ShieldAlert}
              label="Critical"
              value={String(analysis.counts.critical)}
              tone={analysis.counts.critical > 0 ? 'critical' : 'default'}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-[10.5px] leading-relaxed text-slate-600">
            Graph and review appear as soon as the YAML is valid.
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Try a sample
            </h3>
            <span className="text-[9.5px] text-slate-600">3 workflows</span>
          </div>
          <div className="space-y-1.5">
            {samples.map((sample) => {
              const active = sample.id === activeSampleId
              return (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => onLoadSample(sample)}
                  className={[
                    'group flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    active
                      ? 'border-beam/35 bg-beam/[0.07]'
                      : 'border-white/[0.05] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.04]',
                  ].join(' ')}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      active
                        ? 'border-beam/50 bg-beam/15 text-beam'
                        : 'border-white/10 text-transparent'
                    }`}
                  >
                    <Check size={9} strokeWidth={3} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium text-slate-200">
                      {sample.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                      {sample.tagline}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="hidden shrink-0 items-start gap-2 border-t border-white/[0.06] px-4 py-3 xl:flex">
        <LockKeyhole size={11} className="mt-0.5 shrink-0 text-slate-600" />
        <p className="text-[9.5px] leading-relaxed text-slate-600">
          Parsing, graphing, analysis and exports run entirely in this tab. Nothing is
          uploaded or collected.
        </p>
      </div>
    </aside>
  )
}
