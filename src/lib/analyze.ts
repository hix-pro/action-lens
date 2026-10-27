import type { Analysis, Finding, Job, Severity, Step, Workflow } from '../types'

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const SECRET_KEY = /(secret|token|passw|api[_-]?key|private[_-]?key|credential|auth)/i
const PLACEHOLDER =
  /^(changeme|change-me|example|placeholder|password|secret|xxx+|your[-_].*|dev|test|dummy|sample)$/i
const TOKEN_PATTERN =
  /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_live_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16})/
const UNTRUSTED_CONTEXT =
  /(github\.event\.|github\.head_ref|github\.ref_name|inputs\.)/
const EXPRESSION = /\$\{\{\s*([^}]+?)\s*\}\}/g
const REMOTE_SCRIPT =
  /\b(?:curl|wget)\b[^\n|;]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\b(?:ba|z|da|k)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b|\b(?:ba|z|da|k)?sh\s+<\(\s*(?:curl|wget)\b/i
const SHA_PIN = /@[0-9a-f]{40}(?:\s|$)/i

function addFinding(
  findings: Finding[],
  severity: Severity,
  rule: string,
  title: string,
  detail: string,
  fix: string,
  job?: string,
  step?: number,
): void {
  const id = [rule, job ?? 'workflow', step ?? '', title, detail].join(':')
  if (findings.some((finding) => finding.id === id)) return
  findings.push({ id, rule, severity, job, step, title, detail, fix })
}

function stepLabel(step: Step): string {
  if (step.name) return step.name
  if (step.uses) return step.uses.split('@')[0] ?? step.uses
  if (step.run) return step.run.trim().split('\n')[0]?.slice(0, 60) ?? 'run step'
  return `Step ${step.index + 1}`
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.includes('${{')) return true
  if (/^<.+>$/.test(trimmed)) return true
  return PLACEHOLDER.test(trimmed)
}

function hasLiteralSecret(key: string, value: string): boolean {
  if (isPlaceholder(value)) return false
  return SECRET_KEY.test(key) || TOKEN_PATTERN.test(value)
}

function isPinnedAction(uses: string): boolean {
  if (uses.startsWith('./') || uses.startsWith('docker://')) return true
  return SHA_PIN.test(uses)
}

function isSelfHosted(runsOn: string[]): boolean {
  return runsOn.some((runner) => runner.toLowerCase().includes('self-hosted'))
}

function scanRunForSecrets(
  findings: Finding[],
  job: Job,
  step: Step,
  source: string,
): void {
  if (TOKEN_PATTERN.test(source)) {
    addFinding(
      findings,
      'critical',
      'hardcoded-secret',
      'Token looks committed in a run step',
      `${job.id} / step ${step.index + 1} contains a value shaped like a live credential. Workflow files are stored and often shared.`,
      'Revoke the token, move it to repository secrets, and reference it with ${{ secrets.NAME }}.',
      job.id,
      step.index,
    )
  }
}

function scanEnvForSecrets(
  findings: Finding[],
  env: Record<string, string | null>,
  scope: string,
  job?: Job,
  step?: Step,
): void {
  for (const [key, raw] of Object.entries(env)) {
    if (raw === null || !hasLiteralSecret(key, raw)) continue
    addFinding(
      findings,
      'critical',
      'hardcoded-secret',
      'Secret is hard-coded',
      `${scope} stores ${key} as a literal value. The value is redacted here but is present in the workflow file.`,
      'Move the value to repository or environment secrets and reference it with ${{ secrets.NAME }}.',
      job?.id,
      step?.index,
    )
    if (TOKEN_PATTERN.test(raw)) {
      addFinding(
        findings,
        'critical',
        'hardcoded-secret',
        'Live token pattern in workflow',
        `${scope} contains a value shaped like a live credential.`,
        'Revoke the token and replace it with a secret reference.',
        job?.id,
        step?.index,
      )
    }
  }
}

export function analyzeWorkflow(workflow: Workflow): Analysis {
  const findings: Finding[] = []
  const events = workflow.triggers.events
  const prTarget = events.includes('pull_request_target')

  if (events.length === 0) {
    addFinding(
      findings,
      'warning',
      'missing-trigger',
      'Workflow has no trigger',
      'GitHub only runs workflows that declare an on: trigger.',
      'Add the events that should start this workflow, for example push and pull_request.',
    )
  }

  if (prTarget) {
    addFinding(
      findings,
      'warning',
      'pull-request-target',
      'pull_request_target runs with a privileged token',
      'This trigger runs in the base repository context with secrets and a write-capable token, even for pull requests from forks.',
      'Prefer pull_request for untrusted code. If pull_request_target is required, never execute code from the pull request.',
    )
  }

  if (events.includes('workflow_run')) {
    addFinding(
      findings,
      'warning',
      'workflow-run-trigger',
      'workflow_run is a privileged trigger',
      'workflow_run runs with secrets and a write token after another workflow completes. Treat artifacts and commit data from the upstream run as untrusted.',
      'Validate artifacts and avoid executing checked-out code from forks in a workflow_run job.',
    )
  }

  if (!workflow.permissions) {
    const inheritedJobs = workflow.jobs.filter((job) => !job.permissions)
    if (inheritedJobs.length > 0) {
      addFinding(
        findings,
        'warning',
        'missing-permissions',
        'No explicit token permissions',
        `The workflow does not set permissions:, so ${inheritedJobs.map((job) => job.id).join(', ')} inherit the repository default token permissions.`,
        'Add a read-only permissions block at the top level and grant write scopes only to the jobs that need them.',
      )
    }
  }

  if (workflow.permissions?.all === 'write-all') {
    addFinding(
      findings,
      'critical',
      'write-all',
      'Token has write access to everything',
      'permissions: write-all gives every job a token that can write to contents, packages, issues, and more.',
      'Start from permissions: { contents: read } and grant individual write scopes only where required.',
    )
  }

  scanEnvForSecrets(findings, workflow.env, 'The workflow env block')
  const jobIds = new Set(workflow.jobs.map((job) => job.id))

  for (const job of workflow.jobs) {
    for (const dependency of job.needs) {
      if (jobIds.has(dependency)) continue
      addFinding(
        findings,
        'critical',
        'missing-needs',
        'needs points at a missing job',
        `${job.id} needs "${dependency}", but no job with that id exists. The workflow will not run.`,
        'Add the missing job or remove it from needs.',
        job.id,
      )
    }

    if (job.permissions?.all === 'write-all') {
      addFinding(
        findings,
        'critical',
        'write-all',
        'Job token has write access to everything',
        `${job.id} sets permissions: write-all, so a compromised step can write to every scope.`,
        'Replace write-all with the smallest set of scopes this job needs.',
        job.id,
      )
    }

    if (job.uses) {
      if (
        job.uses.includes('@') &&
        !isPinnedAction(job.uses) &&
        /^[^./]/.test(job.uses)
      ) {
        addFinding(
          findings,
          'warning',
          'unpinned-reusable-workflow',
          'Reusable workflow is not pinned',
          `${job.id} calls ${job.uses} by a moving ref. A changed tag or branch changes what runs with this job's token.`,
          'Pin the reusable workflow to a full 40-character commit SHA.',
          job.id,
        )
      }
      if (job.secretsInherit) {
        addFinding(
          findings,
          'warning',
          'secrets-inherit',
          'All secrets are passed to a reusable workflow',
          `${job.id} uses secrets: inherit, so the called workflow receives every secret available to this repository.`,
          'Pass only the named secrets the reusable workflow needs.',
          job.id,
        )
      }
    }

    if (isSelfHosted(job.runsOn)) {
      addFinding(
        findings,
        'warning',
        'self-hosted-runner',
        'Job runs on a self-hosted runner',
        `${job.id} runs on ${job.runsOn.join(', ')}. Self-hosted runners are risky for public repositories because untrusted jobs can persist on the host.`,
        'Use GitHub-hosted runners for public repositories, or isolate ephemeral self-hosted runners with no long-lived credentials.',
        job.id,
      )
    }

    if (job.timeoutMinutes === undefined && !job.uses) {
      addFinding(
        findings,
        'info',
        'missing-timeout',
        'No job timeout',
        `${job.id} has no timeout-minutes, so a hung process can consume runner minutes until the platform limit.`,
        'Add a timeout-minutes value that is generous but bounded.',
        job.id,
      )
    }

    scanEnvForSecrets(findings, job.env, `Job ${job.id}`, job)

    for (const step of job.steps) {
      if (step.uses) {
        if (!isPinnedAction(step.uses)) {
          addFinding(
            findings,
            'warning',
            'unpinned-action',
            'Action is not pinned to a commit',
            `${job.id} / ${stepLabel(step)} uses ${step.uses}. Tags and branches can be moved, so the code that runs can change without a workflow diff.`,
            'Pin third-party actions to a full 40-character commit SHA and keep the version in a comment.',
            job.id,
            step.index,
          )
        }

        if (
          prTarget &&
          /(^|[/@])actions\/checkout(@|$)/i.test(step.uses)
        ) {
          const ref = step.with.ref ?? ''
          const repository = step.with.repository ?? ''
          const untrustedRef =
            /pull_request\.head|github\.head_ref|refs\/pull\//i.test(ref)
          const untrustedRepository =
            /pull_request\.head\.repo|github\.event\.pull_request\.head\.repo/i.test(
              repository,
            )
          if (untrustedRef || untrustedRepository) {
            addFinding(
              findings,
              'critical',
              'pr-target-untrusted-checkout',
              'Privileged trigger checks out untrusted code',
              `${job.id} checks out pull request code under pull_request_target. The checkout can contain a malicious build script that runs with secrets and a write token.`,
              'Do not check out or execute fork code in pull_request_target. Use pull_request, or split the privileged work into a workflow that only consumes validated artifacts.',
              job.id,
              step.index,
            )
          }
        }
      }

      if (step.run) {
        let match: RegExpExecArray | null
        EXPRESSION.lastIndex = 0
        while ((match = EXPRESSION.exec(step.run)) !== null) {
          const expression = match[1]?.trim() ?? ''
          if (UNTRUSTED_CONTEXT.test(expression)) {
            addFinding(
              findings,
              'critical',
              'script-injection',
              'Untrusted value is interpolated into a shell',
              `${job.id} / ${stepLabel(step)} inserts \${{ ${expression} }} directly into run:. A pull request author can inject shell syntax through this value.`,
              'Pass the expression through an env: variable and reference it as "$VAR" in the script, so the shell treats it as data.',
              job.id,
              step.index,
            )
            break
          }
        }

        if (REMOTE_SCRIPT.test(step.run)) {
          addFinding(
            findings,
            'warning',
            'remote-script',
            'Downloads and executes a remote script',
            `${job.id} / ${stepLabel(step)} pipes a network download directly into a shell. The remote server controls what runs on the runner.`,
            'Download the installer, verify a published checksum or signature, then execute the verified file.',
            job.id,
            step.index,
          )
        }

        if (/\$\{\{\s*secrets\./i.test(step.run)) {
          addFinding(
            findings,
            'info',
            'secret-in-run',
            'Secret is referenced directly in run',
            `${job.id} / ${stepLabel(step)} interpolates a secret into a shell command. Special characters and accidental output make this harder to audit.`,
            'Map the secret to an env: variable and quote the variable in the script.',
            job.id,
            step.index,
          )
        }

        scanRunForSecrets(findings, job, step, step.run)
      }

      scanEnvForSecrets(findings, step.env, `${job.id} / ${stepLabel(step)}`, job, step)

      for (const [key, value] of Object.entries(step.with)) {
        if (!hasLiteralSecret(key, value)) continue
        addFinding(
          findings,
          'critical',
          'hardcoded-secret',
          'Secret is hard-coded in an action input',
          `${job.id} / ${stepLabel(step)} passes ${key} as a literal value in with:.`,
          'Read the value from ${{ secrets.NAME }} instead of embedding it in the workflow.',
          job.id,
          step.index,
        )
      }
    }
  }

  findings.sort((a, b) => {
    return (
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.job ?? '').localeCompare(b.job ?? '') ||
      (a.step ?? -1) - (b.step ?? -1) ||
      a.title.localeCompare(b.title)
    )
  })

  const counts: Record<Severity, number> = {
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    warning: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  }

  return {
    findings,
    counts,
    stats: {
      jobs: workflow.jobs.length,
      steps: workflow.jobs.reduce((total, job) => total + job.steps.length, 0),
      actions: workflow.jobs.reduce(
        (total, job) =>
          total + job.steps.filter((step) => Boolean(step.uses)).length,
        0,
      ),
      instances: workflow.jobs.reduce(
        (total, job) => total + (job.matrix?.count ?? 1),
        0,
      ),
      dynamicMatrices: workflow.jobs.filter((job) => job.matrix?.dynamic).length,
      triggers: events.length,
    },
  }
}
