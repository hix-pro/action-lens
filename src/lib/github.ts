const API_ROOT = 'https://api.github.com'
const RAW_ROOT = 'https://raw.githubusercontent.com'
const WORKFLOW_PREFIX = '.github/workflows/'
const MAX_WORKFLOW_BYTES = 1_000_000
const MAX_PULL_FILE_PAGES = 3

export type GitHubErrorKind =
  | 'invalid'
  | 'not-found'
  | 'rate-limit'
  | 'network'
  | 'api'

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind
  readonly status?: number

  constructor(message: string, kind: GitHubErrorKind = 'api', status?: number) {
    super(message)
    this.name = 'GitHubError'
    this.kind = kind
    this.status = status
  }
}

export type FetchLike = typeof fetch

export interface RepoRef {
  owner: string
  repo: string
}

export interface GitHubTarget {
  repo: RepoRef
  pullNumber: number | null
}

export interface WorkflowFile {
  name: string
  path: string
  sha: string
}

export type PullFileStatus = 'added' | 'modified' | 'renamed' | 'removed'

export interface PullWorkflowFile {
  name: string
  path: string
  status: PullFileStatus
  basePath: string | null
}

export interface PullRequestSummary {
  number: number
  title: string
  url: string
  baseRef: string
  baseSha: string
  mergeBaseSha: string
  headRef: string
  headSha: string
  changedFiles: number
}

export interface WorkflowDocument {
  source: string
  filename: string
  path: string
  repository: string
  revision: string
}

export interface WorkflowComparison {
  before: WorkflowDocument
  after: WorkflowDocument
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function validRepoPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && value !== '.' && value !== '..'
}

function repositoryName(repo: RepoRef): string {
  return `${repo.owner}/${repo.repo}`
}

export function isWorkflowPath(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)
}

function workflowName(path: string): string {
  return path.slice(WORKFLOW_PREFIX.length)
}

function parseRepo(owner: string, repo: string): RepoRef {
  const repoSegment = repo.replace(/\.git$/i, '')
  if (!validRepoPart(owner) || !validRepoPart(repoSegment)) {
    throw new GitHubError(
      'Use a GitHub owner and repository name, for example hix-pro/action-lens.',
      'invalid',
    )
  }
  return { owner, repo: repoSegment }
}

/**
 * Accepts `owner/repo`, a repository URL, `owner/repo#123`, or a pull request URL.
 * A bare `#123` or `123` reuses `defaultRepo` when one is already loaded.
 */
export function parseGitHubTarget(input: string, defaultRepo?: RepoRef): GitHubTarget {
  const text = input.trim()
  if (!text) {
    throw new GitHubError('Enter a repository or pull request URL.', 'invalid')
  }

  if (defaultRepo) {
    const pull = text.match(/^#?(\d+)$/)
    if (pull) {
      return { repo: defaultRepo, pullNumber: Number(pull[1]) }
    }
  }

  if (/^https?:\/\//i.test(text)) {
    let url: URL
    try {
      url = new URL(text)
    } catch {
      throw new GitHubError('That URL is not valid.', 'invalid')
    }
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      throw new GitHubError('Only github.com repository and pull request URLs are supported.', 'invalid')
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) {
      throw new GitHubError('That URL does not point at a repository.', 'invalid')
    }
    const targetRepo = parseRepo(parts[0], parts[1])
    const rest = parts.slice(2)
    if (rest.length === 0) return { repo: targetRepo, pullNumber: null }
    if (
      rest.length >= 2 &&
      (rest[0] === 'pull' || rest[0] === 'pulls') &&
      /^\d+$/.test(rest[1])
    ) {
      return { repo: targetRepo, pullNumber: Number(rest[1]) }
    }
    throw new GitHubError(
      'Open the repository root or a pull request URL. Branch and file URLs are not supported.',
      'invalid',
    )
  }

  const hash = text.match(/^([^#\s]+)#(\d+)$/)
  if (hash) {
    const slash = hash[1].lastIndexOf('/')
    if (slash <= 0) {
      throw new GitHubError('Use owner/repo#123 to select a pull request.', 'invalid')
    }
    return {
      repo: parseRepo(hash[1].slice(0, slash), hash[1].slice(slash + 1)),
      pullNumber: Number(hash[2]),
    }
  }

  const plain = text.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (plain) return { repo: parseRepo(plain[1], plain[2]), pullNumber: null }

  throw new GitHubError(
    'Use owner/repo, owner/repo#123, or a github.com pull request URL.',
    'invalid',
  )
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function encodeRef(ref: string): string {
  return ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function workflowRawUrl(repo: RepoRef, ref: string, path: string): string {
  if (!isWorkflowPath(path)) {
    throw new GitHubError('That path is not a workflow in .github/workflows.', 'invalid')
  }
  return `${RAW_ROOT}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
    repo.repo,
  )}/${encodeRef(ref)}/${encodePath(path)}`
}

function apiHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    throw new GitHubError('GitHub returned a response ActionLens could not read.', 'api')
  }
}

function rateLimitMessage(response: Response): string {
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) {
    const time = new Date(reset * 1000).toISOString().slice(11, 16)
    return `GitHub's unauthenticated API limit is used up. Try again after ${time} UTC.`
  }
  return "GitHub's unauthenticated API limit is used up. Wait a few minutes and try again."
}

async function apiGet(path: string, fetchImpl: FetchLike): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(`${API_ROOT}${path}`, {
      headers: apiHeaders(),
      cache: 'no-store',
    })
  } catch {
    throw new GitHubError(
      'Could not reach GitHub. Check your connection and try again.',
      'network',
    )
  }

  if (response.ok) return readJson(response)

  if (response.status === 404) {
    throw new GitHubError('GitHub could not find that repository or pull request.', 'not-found', 404)
  }

  const remaining = response.headers.get('x-ratelimit-remaining')
  if (
    (response.status === 403 || response.status === 429) &&
    (remaining === '0' || response.headers.has('retry-after'))
  ) {
    throw new GitHubError(rateLimitMessage(response), 'rate-limit', response.status)
  }

  if (response.status === 403 || response.status === 429) {
    throw new GitHubError(rateLimitMessage(response), 'rate-limit', response.status)
  }

  throw new GitHubError(`GitHub returned HTTP ${response.status}.`, 'api', response.status)
}

function contentsQuery(ref: string | null): string {
  return ref ? `?${new URLSearchParams({ ref }).toString()}` : ''
}

export async function listWorkflows(
  repo: RepoRef,
  ref: string | null = null,
  fetchImpl: FetchLike = fetch,
): Promise<WorkflowFile[]> {
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
    repo.repo,
  )}/contents/${WORKFLOW_PREFIX.slice(0, -1)}${contentsQuery(ref)}`

  let data: unknown
  try {
    data = await apiGet(path, fetchImpl)
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      throw new GitHubError(
        `No .github/workflows directory in ${repositoryName(repo)}.`,
        'not-found',
        404,
      )
    }
    throw error
  }

  if (!Array.isArray(data)) {
    throw new GitHubError(
      `GitHub did not return a workflow directory for ${repositoryName(repo)}.`,
      'api',
    )
  }

  const files: WorkflowFile[] = []
  for (const item of data) {
    const record = asRecord(item)
    if (!record || record.type !== 'file') continue
    const itemPath = asString(record.path)
    const sha = asString(record.sha)
    if (!itemPath || !sha || !isWorkflowPath(itemPath)) continue
    files.push({ name: workflowName(itemPath), path: itemPath, sha })
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export async function getPullRequest(
  repo: RepoRef,
  number: number,
  fetchImpl: FetchLike = fetch,
): Promise<PullRequestSummary> {
  if (!Number.isInteger(number) || number < 1) {
    throw new GitHubError('Pull request numbers are positive integers.', 'invalid')
  }

  let data: unknown
  try {
    data = await apiGet(
      `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/pulls/${number}`,
      fetchImpl,
    )
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      throw new GitHubError(
        `Pull request #${number} was not found in ${repositoryName(repo)}.`,
        'not-found',
        404,
      )
    }
    throw error
  }

  const record = asRecord(data)
  const base = asRecord(record?.base)
  const head = asRecord(record?.head)
  const baseSha = asString(base?.sha)
  const headSha = asString(head?.sha)
  const baseRef = asString(base?.ref)
  const headRef = asString(head?.ref)
  const title = asString(record?.title)
  const url = asString(record?.html_url)
  if (!record || !baseSha || !headSha || !baseRef || !headRef || !title || !url) {
    throw new GitHubError('GitHub returned an incomplete pull request.', 'api')
  }

  let compare: unknown
  try {
    compare = await apiGet(
      `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
        repo.repo,
      )}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}`,
      fetchImpl,
    )
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      throw new GitHubError(
        'GitHub could not find a common base for this pull request.',
        'not-found',
        404,
      )
    }
    throw error
  }

  const mergeBaseSha = asString(asRecord(asRecord(compare)?.merge_base_commit)?.sha)
  if (!mergeBaseSha) {
    throw new GitHubError('GitHub did not return a merge base for this pull request.', 'api')
  }

  return {
    number: asNumber(record.number) ?? number,
    title,
    url,
    baseRef,
    baseSha,
    mergeBaseSha,
    headRef,
    headSha,
    changedFiles: asNumber(record.changed_files) ?? 0,
  }
}

function pullStatus(value: unknown): PullFileStatus | null {
  return value === 'added' || value === 'modified' || value === 'renamed' || value === 'removed'
    ? value
    : value === 'changed'
      ? 'modified'
      : null
}

export async function listPullWorkflowFiles(
  repo: RepoRef,
  number: number,
  fetchImpl: FetchLike = fetch,
): Promise<PullWorkflowFile[]> {
  const files: PullWorkflowFile[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= MAX_PULL_FILE_PAGES; page += 1) {
    const query = new URLSearchParams({ per_page: '100', page: String(page) })
    let data: unknown
    try {
      data = await apiGet(
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
          repo.repo,
        )}/pulls/${number}/files?${query.toString()}`,
        fetchImpl,
      )
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        throw new GitHubError(
          `Pull request #${number} was not found in ${repositoryName(repo)}.`,
          'not-found',
          404,
        )
      }
      throw error
    }

    if (!Array.isArray(data)) {
      throw new GitHubError('GitHub returned an unreadable pull request file list.', 'api')
    }

    for (const item of data) {
      const record = asRecord(item)
      if (!record) continue
      const path = asString(record.filename)
      const status = pullStatus(record.status)
      if (!path || !status || !isWorkflowPath(path) || seen.has(path)) continue
      const previous = asString(record.previous_filename)
      seen.add(path)
      files.push({
        name: workflowName(path),
        path,
        status,
        basePath:
          status === 'renamed' && previous && isWorkflowPath(previous)
            ? previous
            : status === 'modified' || status === 'removed'
              ? path
              : null,
      })
    }

    if (data.length < 100) break
  }

  const order: Record<PullFileStatus, number> = {
    modified: 0,
    added: 1,
    renamed: 2,
    removed: 3,
  }
  return files.sort(
    (a, b) => order[a.status] - order[b.status] || a.path.localeCompare(b.path),
  )
}

export async function fetchWorkflowText(
  repo: RepoRef,
  ref: string,
  path: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  let response: Response
  try {
    response = await fetchImpl(workflowRawUrl(repo, ref, path), { cache: 'no-store' })
  } catch {
    throw new GitHubError(
      'Could not reach raw.githubusercontent.com. Check your connection and try again.',
      'network',
    )
  }

  if (response.status === 404) {
    throw new GitHubError('That workflow does not exist at this revision.', 'not-found', 404)
  }
  if (!response.ok) {
    throw new GitHubError(`GitHub returned HTTP ${response.status} for that workflow.`, 'api', response.status)
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    throw new GitHubError('Could not read that workflow file.', 'api')
  }

  if (text.length > MAX_WORKFLOW_BYTES) {
    throw new GitHubError('That workflow is larger than 1 MB. Workflow files should be tiny.', 'api')
  }
  if (!text.trim()) {
    throw new GitHubError('That workflow file is empty.', 'api')
  }
  return text
}

export function toWorkflowDocument(
  repo: RepoRef,
  revision: string,
  path: string,
  source: string,
): WorkflowDocument {
  return {
    source,
    filename: workflowName(path),
    path,
    repository: repositoryName(repo),
    revision,
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof GitHubError) return error.message
  return 'GitHub could not load that workflow. Try again.'
}

export { errorMessage as githubErrorMessage, repositoryName }
