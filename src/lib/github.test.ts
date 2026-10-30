import { describe, expect, it, vi } from 'vitest'
import {
  fetchWorkflowText,
  getPullRequest,
  GitHubError,
  githubErrorMessage,
  isWorkflowPath,
  listPullWorkflowFiles,
  listWorkflows,
  parseGitHubTarget,
  toWorkflowDocument,
  workflowRawUrl,
  type FetchLike,
  type RepoRef,
} from './github'

const REPO: RepoRef = { owner: 'hix-pro', repo: 'action-lens' }

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } })
}

function fetcher(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init),
  )
}

function asFetch(mock: ReturnType<typeof fetcher>): FetchLike {
  return mock as unknown as FetchLike
}

describe('parseGitHubTarget', () => {
  it('accepts owner/repo and repository URLs', () => {
    expect(parseGitHubTarget('hix-pro/action-lens')).toEqual({
      repo: REPO,
      pullNumber: null,
    })
    expect(parseGitHubTarget('https://github.com/hix-pro/action-lens')).toEqual({
      repo: REPO,
      pullNumber: null,
    })
    expect(parseGitHubTarget('https://github.com/hix-pro/action-lens.git/')).toEqual({
      repo: REPO,
      pullNumber: null,
    })
  })

  it('accepts pull request URLs, fragments, and bare numbers with a default repo', () => {
    expect(parseGitHubTarget('https://github.com/hix-pro/action-lens/pull/41')).toEqual({
      repo: REPO,
      pullNumber: 41,
    })
    expect(
      parseGitHubTarget('https://github.com/hix-pro/action-lens/pull/41/files'),
    ).toEqual({ repo: REPO, pullNumber: 41 })
    expect(parseGitHubTarget('hix-pro/action-lens#7')).toEqual({
      repo: REPO,
      pullNumber: 7,
    })
    expect(parseGitHubTarget('#12', REPO)).toEqual({ repo: REPO, pullNumber: 12 })
    expect(parseGitHubTarget('12', REPO)).toEqual({ repo: REPO, pullNumber: 12 })
  })

  it('rejects other hosts, branch URLs, and malformed input', () => {
    expect(() => parseGitHubTarget('https://gitlab.com/hix-pro/action-lens')).toThrow(
      /Only github.com/,
    )
    expect(() =>
      parseGitHubTarget('https://github.com/hix-pro/action-lens/tree/main'),
    ).toThrow(/repository root or a pull request/)
    expect(() => parseGitHubTarget('https://github.com/hix-pro')).toThrow(
      /does not point at a repository/,
    )
    expect(() => parseGitHubTarget('hix-pro/..')).toThrow(/GitHub owner/)
    expect(() => parseGitHubTarget('not a repo')).toThrow(/Use owner\/repo/)
    expect(() => parseGitHubTarget('')).toThrow(/Enter a repository/)
  })
})

describe('workflow paths', () => {
  it('accepts only direct workflow YAML files', () => {
    expect(isWorkflowPath('.github/workflows/ci.yml')).toBe(true)
    expect(isWorkflowPath('.github/workflows/release.YAML')).toBe(true)
    expect(isWorkflowPath('.github/workflows/nested/ci.yml')).toBe(false)
    expect(isWorkflowPath('.github/actions/ci.yml')).toBe(false)
    expect(isWorkflowPath('.github/workflows/readme.md')).toBe(false)
  })

  it('builds an encoded raw URL and refuses non-workflow paths', () => {
    expect(
      workflowRawUrl({ owner: 'hix pro', repo: 'action lens' }, 'feature/a b', '.github/workflows/ci main.yml'),
    ).toBe(
      'https://raw.githubusercontent.com/hix%20pro/action%20lens/feature/a%20b/.github/workflows/ci%20main.yml',
    )
    expect(() => workflowRawUrl(REPO, 'HEAD', 'README.md')).toThrow(/not a workflow/)
  })
})

describe('listWorkflows', () => {
  it('lists direct workflow files and ignores directories and other files', async () => {
    const mock = fetcher(() =>
      jsonResponse([
        { type: 'file', name: 'ci.yml', path: '.github/workflows/ci.yml', sha: 'a1' },
        { type: 'file', name: 'release.yaml', path: '.github/workflows/release.yaml', sha: 'b2' },
        { type: 'file', name: 'notes.md', path: '.github/workflows/notes.md', sha: 'c3' },
        { type: 'dir', name: 'nested', path: '.github/workflows/nested', sha: 'd4' },
        { type: 'file', name: 'ci.yml', path: '.github/workflows/nested/ci.yml', sha: 'e5' },
      ]),
    )

    const files = await listWorkflows(REPO, null, asFetch(mock))

    expect(files).toEqual([
      { name: 'ci.yml', path: '.github/workflows/ci.yml', sha: 'a1' },
      { name: 'release.yaml', path: '.github/workflows/release.yaml', sha: 'b2' },
    ])
    expect(mock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/hix-pro/action-lens/contents/.github/workflows',
    )
    expect(mock.mock.calls[0][1]).toMatchObject({
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    })
  })

  it('passes a ref when one is supplied', async () => {
    const mock = fetcher(() =>
      jsonResponse([
        { type: 'file', name: 'ci.yml', path: '.github/workflows/ci.yml', sha: 'a1' },
      ]),
    )
    await listWorkflows(REPO, 'abc123', asFetch(mock))
    expect(mock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/hix-pro/action-lens/contents/.github/workflows?ref=abc123',
    )
  })

  it('explains a missing workflows directory', async () => {
    const mock = fetcher(() => jsonResponse({ message: 'Not Found' }, 404))
    await expect(listWorkflows(REPO, null, asFetch(mock))).rejects.toThrow(
      'No .github/workflows directory in hix-pro/action-lens.',
    )
  })

  it('reports the unauthenticated rate limit with a reset time', async () => {
    const mock = fetcher(() =>
      jsonResponse(
        { message: 'API rate limit exceeded' },
        403,
        {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1793354400',
        },
      ),
    )

    await expect(listWorkflows(REPO, null, asFetch(mock))).rejects.toThrow(
      "GitHub's unauthenticated API limit is used up. Try again after 10:00 UTC.",
    )
  })

  it('wraps network failures in a friendly error', async () => {
    const mock = fetcher(() => {
      throw new TypeError('Failed to fetch')
    })
    await expect(listWorkflows(REPO, null, asFetch(mock))).rejects.toMatchObject({
      kind: 'network',
      message: 'Could not reach GitHub. Check your connection and try again.',
    })
  })
})

describe('getPullRequest', () => {
  it('maps the base, merge base, and head revisions', async () => {
    const mock = fetcher((url) =>
      url.includes('/pulls/41')
        ? jsonResponse({
            number: 41,
            title: 'Harden the release workflow',
            html_url: 'https://github.com/hix-pro/action-lens/pull/41',
            changed_files: 2,
            base: { ref: 'main', sha: 'base-sha' },
            head: { ref: 'harden-release', sha: 'head-sha' },
          })
        : jsonResponse({ merge_base_commit: { sha: 'merge-base-sha' } }),
    )

    await expect(getPullRequest(REPO, 41, asFetch(mock))).resolves.toEqual({
      number: 41,
      title: 'Harden the release workflow',
      url: 'https://github.com/hix-pro/action-lens/pull/41',
      baseRef: 'main',
      baseSha: 'base-sha',
      mergeBaseSha: 'merge-base-sha',
      headRef: 'harden-release',
      headSha: 'head-sha',
      changedFiles: 2,
    })
    expect(mock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/hix-pro/action-lens/pulls/41',
    )
    expect(mock.mock.calls[1][0]).toBe(
      'https://api.github.com/repos/hix-pro/action-lens/compare/base-sha...head-sha',
    )
  })

  it('rejects incomplete payloads', async () => {
    const mock = fetcher(() => jsonResponse({ number: 41, title: 'Missing refs' }))
    await expect(getPullRequest(REPO, 41, asFetch(mock))).rejects.toThrow(
      /incomplete pull request/,
    )
  })
})

describe('listPullWorkflowFiles', () => {
  it('keeps workflow changes, tracks rename bases, and marks removed files', async () => {
    const mock = fetcher(() =>
      jsonResponse([
        {
          filename: '.github/workflows/ci.yml',
          status: 'modified',
          previous_filename: '.github/workflows/ci.yml',
        },
        { filename: '.github/workflows/new.yml', status: 'added' },
        {
          filename: '.github/workflows/release.yml',
          status: 'renamed',
          previous_filename: '.github/workflows/publish.yml',
        },
        { filename: '.github/workflows/old.yml', status: 'removed' },
        { filename: 'src/app.ts', status: 'modified' },
        { filename: '.github/workflows/ci.yml', status: 'modified' },
      ]),
    )

    const files = await listPullWorkflowFiles(REPO, 41, asFetch(mock))

    expect(files).toEqual([
      {
        name: 'ci.yml',
        path: '.github/workflows/ci.yml',
        status: 'modified',
        basePath: '.github/workflows/ci.yml',
      },
      { name: 'new.yml', path: '.github/workflows/new.yml', status: 'added', basePath: null },
      {
        name: 'release.yml',
        path: '.github/workflows/release.yml',
        status: 'renamed',
        basePath: '.github/workflows/publish.yml',
      },
      {
        name: 'old.yml',
        path: '.github/workflows/old.yml',
        status: 'removed',
        basePath: '.github/workflows/old.yml',
      },
    ])
    expect(mock.mock.calls[0][0]).toContain('per_page=100')
    expect(mock.mock.calls[0][0]).toContain('page=1')
  })

  it('walks up to three pages of pull request files', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      status: 'modified',
    }))
    const second = [
      { filename: '.github/workflows/ci.yml', status: 'modified' },
    ]
    const mock = fetcher((url) =>
      url.endsWith('&page=1') ? jsonResponse(first) : jsonResponse(second),
    )

    const files = await listPullWorkflowFiles(REPO, 7, asFetch(mock))
    expect(files).toHaveLength(1)
    expect(mock).toHaveBeenCalledTimes(2)
  })
})

describe('fetchWorkflowText', () => {
  it('loads a raw workflow at an explicit revision', async () => {
    const mock = fetcher(() => textResponse('name: CI\non: push\n'))
    await expect(
      fetchWorkflowText(REPO, 'head-sha', '.github/workflows/ci.yml', asFetch(mock)),
    ).resolves.toBe('name: CI\non: push\n')
    expect(mock.mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/hix-pro/action-lens/head-sha/.github/workflows/ci.yml',
    )
  })

  it('returns null for a workflow that does not exist in a revision', async () => {
    const mock = fetcher(() => textResponse('Not Found', 404))
    const error = await fetchWorkflowText(
      REPO,
      'base-sha',
      '.github/workflows/new.yml',
      asFetch(mock),
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GitHubError)
    expect((error as GitHubError).status).toBe(404)
  })

  it('rejects files over 1 MB', async () => {
    const mock = fetcher(() => textResponse('x'.repeat(1_000_001)))
    await expect(
      fetchWorkflowText(REPO, 'HEAD', '.github/workflows/ci.yml', asFetch(mock)),
    ).rejects.toThrow(/larger than 1 MB/)
  })
})

describe('documents and errors', () => {
  it('turns a fetched path into an editor document', () => {
    expect(
      toWorkflowDocument(REPO, 'feature', '.github/workflows/ci.yml', 'name: CI'),
    ).toEqual({
      source: 'name: CI',
      filename: 'ci.yml',
      path: '.github/workflows/ci.yml',
      repository: 'hix-pro/action-lens',
      revision: 'feature',
    })
  })

  it('uses a fallback message for unexpected errors', () => {
    expect(githubErrorMessage(new GitHubError('Known'))).toBe('Known')
    expect(githubErrorMessage(new Error('unknown'))).toBe(
      'GitHub could not load that workflow. Try again.',
    )
  })
})
