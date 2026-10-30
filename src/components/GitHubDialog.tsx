import {
  ArrowRight,
  CircleAlert,
  ExternalLink,
  FileCode2,
  GitCompareArrows,
  GitPullRequest,
  LoaderCircle,
  LockKeyhole,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  fetchWorkflowText,
  getPullRequest,
  GitHubError,
  githubErrorMessage,
  listPullWorkflowFiles,
  listWorkflows,
  parseGitHubTarget,
  repositoryName,
  toWorkflowDocument,
  type PullRequestSummary,
  type PullWorkflowFile,
  type RepoRef,
  type WorkflowComparison,
  type WorkflowDocument,
  type WorkflowFile,
} from '../lib/github'
import { GitHubMark } from './GitHubMark'

interface GitHubDialogProps {
  onClose: () => void
  onOpen: (document: WorkflowDocument) => void
  onCompare: (comparison: WorkflowComparison) => void
  onNotify: (message: string, tone?: 'ok' | 'error') => void
}

type Lookup =
  | { kind: 'repo'; repo: RepoRef; files: WorkflowFile[] }
  | { kind: 'pr'; repo: RepoRef; pull: PullRequestSummary; files: PullWorkflowFile[] }

function useDialogFocus(ref: RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    ref.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [ref])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

function Spinner() {
  return <LoaderCircle size={11} className="animate-spin" strokeWidth={2.2} />
}

function StatusBadge({ status }: { status: PullWorkflowFile['status'] }) {
  const style =
    status === 'added'
      ? 'border-mint/25 bg-mint/[0.08] text-mint'
      : status === 'renamed'
        ? 'border-warn/25 bg-warn/[0.08] text-warn'
        : status === 'removed'
          ? 'border-crit/25 bg-crit/[0.08] text-crit'
          : 'border-beam/25 bg-beam/[0.08] text-beam-soft'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] ${style}`}
    >
      {status}
    </span>
  )
}

function FileRow({
  name,
  path,
  badge,
  action,
  disabled = false,
  busy = false,
  onAction,
}: {
  name: string
  path: string
  badge?: PullWorkflowFile['status']
  action: string
  disabled?: boolean
  busy?: boolean
  onAction?: () => void
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-ink-900 text-slate-500">
        <FileCode2 size={13} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-[11px] font-medium text-slate-200">{name}</span>
          {badge && <StatusBadge status={badge} />}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[9px] text-slate-600">{path}</span>
      </span>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onAction}
        className={[
          'inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed border-white/[0.05] text-slate-700'
            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white',
        ].join(' ')}
      >
        {busy ? <Spinner /> : action === 'Compare' ? <GitCompareArrows size={10} strokeWidth={2} /> : null}
        {disabled ? 'Deleted' : action}
      </button>
    </li>
  )
}

export function GitHubDialog({ onClose, onOpen, onCompare, onNotify }: GitHubDialogProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [headFiles, setHeadFiles] = useState<WorkflowFile[] | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const sequence = useRef(0)
  useDialogFocus(dialogRef, onClose)

  async function inspect(event?: FormEvent) {
    event?.preventDefault()
    const id = ++sequence.current
    setLoading(true)
    setError(null)
    setLookup(null)
    setHeadFiles(null)
    try {
      const target = parseGitHubTarget(input)
      if (target.pullNumber !== null) {
        const [pull, files] = await Promise.all([
          getPullRequest(target.repo, target.pullNumber),
          listPullWorkflowFiles(target.repo, target.pullNumber),
        ])
        if (id !== sequence.current) return
        setLookup({ kind: 'pr', repo: target.repo, pull, files })
      } else {
        const files = await listWorkflows(target.repo)
        if (id !== sequence.current) return
        setLookup({ kind: 'repo', repo: target.repo, files })
      }
    } catch (caught) {
      if (id === sequence.current) setError(githubErrorMessage(caught))
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }

  async function openFile(repo: RepoRef, ref: string, revision: string, path: string) {
    const key = `open:${path}`
    setBusy(key)
    setError(null)
    try {
      const source = await fetchWorkflowText(repo, ref, path)
      onOpen(toWorkflowDocument(repo, revision, path, source))
    } catch (caught) {
      setError(githubErrorMessage(caught))
      setBusy(null)
    }
  }

  async function loadPullFile(file: PullWorkflowFile, compare: boolean) {
    if (lookup?.kind !== 'pr' || file.status === 'removed') return
    const { repo, pull } = lookup
    const key = `${compare ? 'compare' : 'open'}:${file.path}`
    setBusy(key)
    setError(null)
    try {
      const headSource = await fetchWorkflowText(repo, pull.headSha, file.path)
      if (compare && file.basePath) {
        let baseSource: string | null = null
        try {
          baseSource = await fetchWorkflowText(repo, pull.mergeBaseSha, file.basePath)
        } catch (caught) {
          if (!(caught instanceof GitHubError && caught.status === 404)) throw caught
        }
        if (baseSource) {
          onCompare({
            before: toWorkflowDocument(repo, pull.baseRef, file.basePath, baseSource),
            after: toWorkflowDocument(repo, pull.headRef, file.path, headSource),
          })
          return
        }
      }
      onOpen(toWorkflowDocument(repo, pull.headRef, file.path, headSource))
      if (compare) {
        onNotify(`${file.name} is new in this pull request; opened the head revision.`)
      }
    } catch (caught) {
      setError(githubErrorMessage(caught))
      setBusy(null)
    }
  }

  async function browseHead() {
    if (lookup?.kind !== 'pr') return
    setBusy('head-files')
    setError(null)
    try {
      const files = await listWorkflows(lookup.repo, lookup.pull.headSha)
      setHeadFiles(files)
    } catch (caught) {
      setError(githubErrorMessage(caught))
    } finally {
      setBusy(null)
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
        aria-labelledby="github-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-panel shadow-[0_30px_120px_-30px_rgba(0,0,0,0.95)] outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-beam/20 bg-beam/[0.07] text-beam">
                <GitHubMark size={14} />
              </span>
              <h2 id="github-title" className="text-[15px] font-semibold text-slate-100">
                Load from GitHub
              </h2>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
              Open a workflow from a public repository, or compare the workflow changes in a
              pull request.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close GitHub dialog"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] p-1.5 text-slate-500 transition-colors hover:border-white/20 hover:text-white"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <form onSubmit={inspect} className="flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Repository or pull request</span>
              <span className="flex items-center gap-2 rounded-lg border border-white/[0.09] bg-[#070b11] px-3 py-2 transition-colors focus-within:border-beam/40">
                <Search size={13} className="shrink-0 text-slate-600" />
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="hix-pro/action-lens or a pull request URL"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
                />
              </span>
            </label>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-beam/30 bg-beam/[0.1] px-3.5 py-2 text-[10.5px] font-semibold text-beam-soft transition-colors hover:border-beam/50 hover:bg-beam/[0.15] hover:text-white disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.02] disabled:text-slate-600"
            >
              {loading ? <Spinner /> : <Search size={11} strokeWidth={2.2} />}
              {loading ? 'Looking up' : 'Load'}
            </button>
          </form>

          <p className="mt-2 text-[9px] leading-relaxed text-slate-600">
            owner/repo, owner/repo#123, or a github.com pull request URL. Public repositories
            only.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-lg border border-crit/25 bg-crit/[0.07] px-3 py-2 text-[10.5px] leading-relaxed text-crit/90"
            >
              <CircleAlert size={11} className="mt-0.5 shrink-0" strokeWidth={2.2} />
              <span className="min-w-0">{error}</span>
            </div>
          )}

          {lookup?.kind === 'repo' && (
            <section className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Repository
                  </p>
                  <h3 className="mt-0.5 truncate font-mono text-[13px] font-semibold text-slate-100">
                    {repositoryName(lookup.repo)}
                  </h3>
                </div>
                <span className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[9px] text-slate-500">
                  {lookup.files.length} workflow{lookup.files.length === 1 ? '' : 's'} on the
                  default branch
                </span>
              </div>

              {lookup.files.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center text-[10.5px] leading-relaxed text-slate-600">
                  This repository has no workflow files in{' '}
                  <span className="font-mono">.github/workflows</span>.
                </div>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {lookup.files.map((file) => (
                    <FileRow
                      key={file.path}
                      name={file.name}
                      path={file.path}
                      action="Open"
                      busy={busy === `open:${file.path}`}
                      onAction={() => void openFile(lookup.repo, 'HEAD', 'default branch', file.path)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {lookup?.kind === 'pr' && (
            <section className="mt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    <GitPullRequest size={9} strokeWidth={2.2} />
                    Pull request #{lookup.pull.number}
                  </p>
                  <h3 className="mt-0.5 text-[13px] font-semibold leading-snug text-slate-100">
                    {lookup.pull.title}
                  </h3>
                  <p className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[9px] text-slate-500">
                    <span className="rounded bg-white/[0.04] px-1.5 py-0.5">
                      {lookup.pull.baseRef}
                    </span>
                    <ArrowRight size={9} className="text-slate-700" />
                    <span className="rounded bg-white/[0.04] px-1.5 py-0.5">
                      {lookup.pull.headRef}
                    </span>
                    <span className="whitespace-nowrap text-slate-500">
                      <span className="text-slate-700">· </span>
                      {lookup.pull.changedFiles} file
                      {lookup.pull.changedFiles === 1 ? '' : 's'} changed
                    </span>
                  </p>
                </div>
                <a
                  href={lookup.pull.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1.5 text-[9.5px] font-medium text-slate-400 transition-colors hover:border-white/[0.16] hover:text-white"
                >
                  Open on GitHub
                  <ExternalLink size={9} strokeWidth={2} />
                </a>
              </div>

              {lookup.files.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-white/[0.08] px-4 py-5 text-center">
                  <p className="text-[11px] font-medium text-slate-400">
                    This pull request does not change any workflow files.
                  </p>
                  {headFiles === null ? (
                    <button
                      type="button"
                      onClick={() => void browseHead()}
                      disabled={busy === 'head-files'}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white disabled:text-slate-600"
                    >
                      {busy === 'head-files' ? <Spinner /> : null}
                      Browse workflows on the head revision
                    </button>
                  ) : headFiles.length === 0 ? (
                    <p className="mt-1 text-[10px] text-slate-600">
                      The head revision has no workflow files.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1.5 text-left">
                      {headFiles.map((file) => (
                        <FileRow
                          key={file.path}
                          name={file.name}
                          path={file.path}
                          action="Open"
                          busy={busy === `open:${file.path}`}
                          onAction={() =>
                            void openFile(
                              lookup.repo,
                              lookup.pull.headSha,
                              lookup.pull.headRef,
                              file.path,
                            )
                          }
                        />
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-3 text-[9.5px] leading-relaxed text-slate-600">
                    Modified and renamed workflows open as a base-to-head comparison. Added
                    workflows open at the head revision.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {lookup.files.map((file) => {
                      const compare = file.status !== 'added' && file.status !== 'removed'
                      return (
                        <FileRow
                          key={file.path}
                          name={file.name}
                          path={file.path}
                          badge={file.status}
                          action={compare ? 'Compare' : 'Open'}
                          disabled={file.status === 'removed'}
                          busy={busy === `${compare ? 'compare' : 'open'}:${file.path}`}
                          onAction={() => void loadPullFile(file, compare)}
                        />
                      )
                    })}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-2 border-t border-white/[0.07] px-4 py-3 text-[9px] leading-relaxed text-slate-600 sm:px-5">
          <LockKeyhole size={10} className="mt-0.5 shrink-0" />
          <p>
            Requests go directly from this tab to GitHub. No token is stored. GitHub limits
            anonymous API clients to 60 requests per hour.
          </p>
        </div>
      </div>
    </div>
  )
}
