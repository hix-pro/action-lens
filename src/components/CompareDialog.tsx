import {
  ArrowLeftRight,
  Check,
  CircleAlert,
  FileUp,
  GitCompareArrows,
  Info,
  LockKeyhole,
  ShieldAlert,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { analyzeWorkflow } from '../lib/analyze'
import { diffLabel, diffWorkflow, type FieldChange } from '../lib/diff'
import { parseWorkflow } from '../lib/parse-workflow'
import type { Analysis, Finding, ParseResult, Severity } from '../types'

const MAX_FILE_BYTES = 1_000_000

export interface CompareRevision {
  source: string
  filename: string
  label?: string
}

interface CompareDialogProps {
  source: string
  filename: string
  onClose: () => void
  initialBefore?: CompareRevision
  initialAfter?: CompareRevision
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'border-crit/25 bg-crit/[0.08] text-crit',
  warning: 'border-warn/25 bg-warn/[0.08] text-warn',
  info: 'border-info/25 bg-info/[0.08] text-info',
}

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-crit',
  warning: 'text-warn',
  info: 'text-info',
}

const SEVERITY_ICON: Record<Severity, typeof ShieldAlert> = {
  critical: ShieldAlert,
  warning: TriangleAlert,
  info: Info,
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-[18px] font-semibold leading-none ${
          tone ?? (value > 0 ? 'text-slate-100' : 'text-slate-500')
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function FindingRow({ finding, resolved = false }: { finding: Finding; resolved?: boolean }) {
  const Icon = SEVERITY_ICON[finding.severity]
  return (
    <li
      className={`rounded-lg border px-2.5 py-2 ${
        resolved
          ? 'border-white/[0.06] bg-white/[0.015]'
          : 'border-white/[0.07] bg-white/[0.02]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] ${
            SEVERITY_STYLE[finding.severity]
          }`}
        >
          <Icon size={8} strokeWidth={2.4} />
          {finding.severity}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[11px] font-medium ${
            resolved ? 'text-slate-500' : 'text-slate-200'
          }`}
        >
          {finding.title}
        </span>
        {finding.job && (
          <span className="shrink-0 font-mono text-[9px] text-slate-600">{finding.job}</span>
        )}
      </div>
      {!resolved && (
        <p className="mt-1 text-[9.5px] leading-relaxed text-slate-500">{finding.detail}</p>
      )}
    </li>
  )
}

function FieldRow({ change }: { change: FieldChange }) {
  const before = change.before === '—' ? null : change.before
  const after = change.after === '—' ? null : change.after
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-3">
      <span className="min-w-0 break-words font-mono text-[9.5px] text-slate-500">
        {change.field}
      </span>
      <span className="min-w-0 break-words font-mono text-[10px] leading-relaxed">
        {before === null ? (
          <span className="text-slate-700">—</span>
        ) : (
          <span className="text-slate-500">{before}</span>
        )}
        <span className="mx-1.5 text-slate-700">→</span>
        {after === null ? (
          <span className="text-slate-700">—</span>
        ) : (
          <span className="text-slate-200">{after}</span>
        )}
      </span>
    </div>
  )
}

function Editor({
  title,
  hint,
  source,
  filename,
  parse,
  onSource,
  onFilename,
  fileInput,
}: {
  title: string
  hint: string
  source: string
  filename: string
  parse: ParseResult
  onSource: (value: string) => void
  onFilename: (value: string) => void
  fileInput: RefObject<HTMLInputElement | null>
}) {
  const [fileError, setFileError] = useState<string | null>(null)

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is larger than 1 MB.')
      event.target.value = ''
      return
    }
    void file
      .text()
      .then((text) => {
        setFileError(null)
        onSource(text)
        onFilename(file.name)
      })
      .catch(() => setFileError('Could not read that file.'))
    event.target.value = ''
  }

  return (
    <section className="min-w-0 rounded-xl border border-white/[0.07] bg-ink-900/60">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-[9px] text-slate-600">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[9.5px] font-medium text-slate-400 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        >
          <FileUp size={10} strokeWidth={2} />
          Open
        </button>
      </div>
      <div className="p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <input
            value={filename}
            onChange={(event) => onFilename(event.target.value)}
            aria-label={`${title} filename`}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[9.5px] text-slate-500 outline-none transition-colors hover:border-white/[0.08] focus:border-acid/30 focus:text-slate-300"
          />
        </div>
        <textarea
          aria-label={`${title} workflow YAML`}
          value={source}
          onChange={(event) => onSource(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className="code-editor h-[170px] w-full resize-y rounded-lg border border-white/[0.08] bg-[#070b11] p-2.5 font-mono text-[10.5px] leading-[1.65] text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-acid/40 focus:ring-1 focus:ring-acid/15"
          placeholder="name: CI&#10;on: [push]&#10;jobs:&#10;  test:&#10;    runs-on: ubuntu-latest"
        />
        {parse.error ? (
          <div
            role="alert"
            className="mt-2 flex items-start gap-1.5 rounded-lg border border-crit/25 bg-crit/[0.07] px-2.5 py-2 text-[9.5px] leading-relaxed text-crit/90"
          >
            <CircleAlert size={10} className="mt-0.5 shrink-0" strokeWidth={2.2} />
            <span className="min-w-0">{parse.error}</span>
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-1 text-[9px] text-slate-600">
            <Check size={9} className="text-acid/70" strokeWidth={2.5} />
            {parse.workflow?.jobs.length ?? 0} jobs
          </p>
        )}
        {fileError && (
          <p role="alert" className="mt-1.5 text-[9.5px] text-crit/90">
            {fileError}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".yml,.yaml,.txt,text/yaml,application/yaml"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </section>
  )
}

export function CompareDialog({
  source,
  filename,
  onClose,
  initialBefore,
  initialAfter,
}: CompareDialogProps) {
  const [beforeSource, setBeforeSource] = useState(initialBefore?.source ?? source)
  const [afterSource, setAfterSource] = useState(initialAfter?.source ?? source)
  const [beforeName, setBeforeName] = useState(initialBefore?.filename ?? filename)
  const [afterName, setAfterName] = useState(initialAfter?.filename ?? filename)
  const [beforeHint, setBeforeHint] = useState(initialBefore?.label ?? 'Previous revision')
  const [afterHint, setAfterHint] = useState(initialAfter?.label ?? 'Proposed revision')
  const dialogRef = useRef<HTMLDivElement>(null)
  const beforeFile = useRef<HTMLInputElement>(null)
  const afterFile = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const before = useMemo(() => parseWorkflow(beforeSource, beforeName), [beforeSource, beforeName])
  const after = useMemo(() => parseWorkflow(afterSource, afterName), [afterSource, afterName])
  const beforeAnalysis = useMemo<Analysis | null>(
    () => (before.workflow ? analyzeWorkflow(before.workflow) : null),
    [before.workflow],
  )
  const afterAnalysis = useMemo<Analysis | null>(
    () => (after.workflow ? analyzeWorkflow(after.workflow) : null),
    [after.workflow],
  )
  const diff = useMemo(() => {
    if (!before.workflow || !after.workflow || !beforeAnalysis || !afterAnalysis) return null
    return diffWorkflow(before.workflow, after.workflow, beforeAnalysis, afterAnalysis)
  }, [before.workflow, after.workflow, beforeAnalysis, afterAnalysis])

  function swap() {
    setBeforeSource(afterSource)
    setAfterSource(beforeSource)
    setBeforeName(afterName)
    setAfterName(beforeName)
    setBeforeHint(afterHint)
    setAfterHint(beforeHint)
  }

  function useCurrent(side: 'before' | 'after') {
    if (side === 'before') {
      setBeforeSource(source)
      setBeforeName(filename)
      setBeforeHint('Current editor')
    } else {
      setAfterSource(source)
      setAfterName(filename)
      setAfterHint('Current editor')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-ink-950/85 p-2 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-panel shadow-[0_30px_120px_-30px_rgba(0,0,0,0.95)] outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-acid/20 bg-acid/[0.07] text-acid">
                <GitCompareArrows size={14} strokeWidth={2} />
              </span>
              <h2 id="compare-title" className="text-[15px] font-semibold text-slate-100">
                Compare workflow revisions
              </h2>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
              Paste the old workflow on the left and the new one on the right. See job, trigger,
              permission, and step changes alongside the findings each revision produces.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compare dialog"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] p-1.5 text-slate-500 transition-colors hover:border-white/20 hover:text-white"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[9.5px] text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1">
              <LockKeyhole size={9} strokeWidth={2} />
              Parsed in this tab
            </span>
            <span>
              Script bodies are compared as “changed” but never shown in the diff.
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Editor
              title="Before"
              hint={beforeHint}
              source={beforeSource}
              filename={beforeName}
              parse={before}
              onSource={setBeforeSource}
              onFilename={setBeforeName}
              fileInput={beforeFile}
            />
            <Editor
              title="After"
              hint={afterHint}
              source={afterSource}
              filename={afterName}
              parse={after}
              onSource={setAfterSource}
              onFilename={setAfterName}
              fileInput={afterFile}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={swap}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeftRight size={11} strokeWidth={2} />
              Swap sides
            </button>
            <button
              type="button"
              onClick={() => useCurrent('before')}
              className="rounded-md border border-transparent px-2 py-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-200"
            >
              Use current as before
            </button>
            <button
              type="button"
              onClick={() => useCurrent('after')}
              className="rounded-md border border-transparent px-2 py-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-200"
            >
              Use current as after
            </button>
          </div>

          <div className="mt-5 border-t border-white/[0.07] pt-4">
            {!diff ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center">
                <p className="text-[12px] font-medium text-slate-400">
                  Fix both YAML files to compare them.
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  The comparison uses the same parser and risk rules as the main view.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Result
                  </h3>
                  <span
                    className={`font-mono text-[10px] ${
                      diff.hasChanges ? 'text-acid/80' : 'text-slate-500'
                    }`}
                  >
                    {diffLabel(diff)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <Metric label="Jobs added" value={diff.counts.jobsAdded} />
                  <Metric label="Jobs removed" value={diff.counts.jobsRemoved} />
                  <Metric label="Jobs changed" value={diff.counts.jobsChanged} />
                  <Metric
                    label="New findings"
                    value={diff.counts.findingsIntroduced}
                    tone={diff.counts.findingsIntroduced > 0 ? 'text-crit' : undefined}
                  />
                  <Metric
                    label="Resolved"
                    value={diff.counts.findingsResolved}
                    tone={diff.counts.findingsResolved > 0 ? 'text-acid' : undefined}
                  />
                </div>

                {!diff.hasChanges && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-acid/20 bg-acid/[0.05] px-3 py-2 text-[10.5px] text-acid/90">
                    <Check size={12} strokeWidth={2.4} />
                    No structural or risk differences between these revisions.
                  </div>
                )}

                {diff.findings.introduced.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-crit/90">
                      <ShieldAlert size={10} strokeWidth={2.2} />
                      New findings
                    </h4>
                    <ul className="space-y-1.5">
                      {diff.findings.introduced.map((item) => (
                        <FindingRow key={item.id} finding={item} />
                      ))}
                    </ul>
                  </div>
                )}

                {diff.findings.resolved.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-acid/80">
                      <Check size={10} strokeWidth={2.6} />
                      Resolved findings
                    </h4>
                    <ul className="space-y-1.5">
                      {diff.findings.resolved.map((item) => (
                        <FindingRow key={item.id} finding={item} resolved />
                      ))}
                    </ul>
                  </div>
                )}

                {diff.findings.changed.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warn/90">
                      <TriangleAlert size={10} strokeWidth={2.2} />
                      Severity changed
                    </h4>
                    <ul className="space-y-1.5">
                      {diff.findings.changed.map((item) => (
                        <li
                          key={item.key}
                          className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[10.5px]"
                        >
                          <span className="min-w-0 flex-1 truncate text-slate-300">
                            {item.after.title}
                          </span>
                          <span className={`shrink-0 uppercase ${SEVERITY_TEXT[item.before.severity]}`}>
                            {item.before.severity}
                          </span>
                          <span className="shrink-0 text-slate-600">→</span>
                          <span className={`shrink-0 uppercase ${SEVERITY_TEXT[item.after.severity]}`}>
                            {item.after.severity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {diff.workflow.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Workflow changes
                    </h4>
                    <div className="space-y-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                      {diff.workflow.map((change, index) => (
                        <FieldRow key={`${change.field}-${index}`} change={change} />
                      ))}
                    </div>
                  </div>
                )}

                {(diff.jobs.added.length > 0 ||
                  diff.jobs.removed.length > 0 ||
                  diff.jobs.changed.length > 0) && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Job changes
                    </h4>
                    <ul className="space-y-2">
                      {diff.jobs.added.map((id) => (
                        <li
                          key={`added-${id}`}
                          className="flex items-center gap-2 rounded-lg border border-acid/15 bg-acid/[0.04] px-3 py-2"
                        >
                          <span className="rounded bg-acid/15 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-acid">
                            added
                          </span>
                          <span className="font-mono text-[11px] text-slate-200">{id}</span>
                        </li>
                      ))}
                      {diff.jobs.removed.map((id) => (
                        <li
                          key={`removed-${id}`}
                          className="flex items-center gap-2 rounded-lg border border-crit/15 bg-crit/[0.04] px-3 py-2"
                        >
                          <span className="rounded bg-crit/15 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-crit">
                            removed
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">{id}</span>
                        </li>
                      ))}
                      {diff.jobs.changed.map((job) => (
                        <li
                          key={`changed-${job.id}`}
                          className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-slate-100">{job.id}</span>
                            <span className="text-[9px] uppercase tracking-[0.1em] text-slate-600">
                              {job.changes.length} change
                              {job.changes.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {job.changes.map((change, index) => (
                              <FieldRow
                                key={`${change.field}-${change.before}-${index}`}
                                change={change}
                              />
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(diff.steps.added.length > 0 || diff.steps.removed.length > 0) && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Step additions and removals
                    </h4>
                    <ul className="space-y-1.5">
                      {diff.steps.added.map((step, index) => (
                        <li
                          key={`step-added-${step.job}-${step.label}-${index}`}
                          className="flex items-center gap-2 rounded-lg border border-acid/15 bg-acid/[0.04] px-3 py-2 text-[10.5px]"
                        >
                          <span className="rounded bg-acid/15 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-acid">
                            added
                          </span>
                          <span className="font-mono text-slate-400">{step.job}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-200">{step.label}</span>
                        </li>
                      ))}
                      {diff.steps.removed.map((step, index) => (
                        <li
                          key={`step-removed-${step.job}-${step.label}-${index}`}
                          className="flex items-center gap-2 rounded-lg border border-crit/15 bg-crit/[0.04] px-3 py-2 text-[10.5px]"
                        >
                          <span className="rounded bg-crit/15 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-crit">
                            removed
                          </span>
                          <span className="font-mono text-slate-500">{step.job}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-400">{step.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
