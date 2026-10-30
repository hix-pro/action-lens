# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-10-30

### Added
- Load workflows from public GitHub repositories. Enter `owner/repo`, a repository URL, `owner/repo#123`, or a pull request URL in the new GitHub dialog; workflows are listed from `.github/workflows`.
- Pull request review: modified and renamed workflow files open in Compare with the merge base as "before" and the PR head as "after". Using the merge base keeps unrelated commits added to the base branch after the PR was opened out of the comparison.
- Workflows added by a pull request open at the head revision. Deleted workflows are listed and marked but cannot be opened.
- Repository and pull request lookups run directly in the browser against the public GitHub API. No token is requested or stored, and workflow contents are fetched only for the file you choose.
- Clear errors for missing repositories, missing workflow directories, network failures, and the unauthenticated GitHub API limit, including the reset time when GitHub provides one.

### Changed
- The Compare dialog can be opened with a before and after revision loaded from GitHub. The revision labels follow **Swap sides** and **Use current as before/after**.
- The source panel has separate **Open file** and **GitHub** actions, with **Compare** and **Reset sample** on their own row.

### Fixed
- A step that keeps its name but changes `uses`, such as an action version bump, is now paired as one changed step instead of appearing as a step added and another removed.

## [0.2.0] - 2026-10-29

### Added
- Compare mode: paste a previous and a proposed workflow to see jobs added, removed, or changed, along with workflow-level triggers, permissions, concurrency, and environment changes. The comparison reuses the same parser and 16-rule engine as the main view.
- Field-level job and step deltas for runners, `needs`, timeout, permissions, matrix dimensions, `env`, `with`, and `continue-on-error`.
- Findings introduced, resolved, and re-graded between revisions, so a warning that becomes critical is called out.
- `run:` bodies are compared as changed but never displayed, and secret-looking environment or `with` values are redacted in the diff.

## [0.1.1] - 2026-10-28

### Added
- Initial public release.

### Fixed
- Finding details no longer quote the contents of unnamed `run:` steps. The first line of a step's script used to serve as its label and could end up in exported Markdown and JSON reports; unnamed steps are now labelled `Step N`, so `run:` bodies never leave the app in a report, as the README already promised.
- Include-only matrix strategies (`matrix:` with only an `include:` block) now count one job instance per non-empty include entry instead of 0, matching GitHub's documented expansion. The same applies whenever no base combination remains to merge into, for example after `exclude:` removes every combination or when a dimension is empty.
- Invalid `exclude:` entries without key/value pairs (scalars or `{}`) are now ignored, as GitHub does. They previously matched every combination and collapsed the matrix count to 0.
- A dimension with no values now yields an empty expansion (0 jobs) even when another dimension alone exceeds the materialization limit, so `null` stays reserved for genuinely over-limit matrices instead of being reported as dynamic.
- Duplicate `needs:` entries no longer produce duplicate graph edges, repeated Mermaid arrows, or colliding React keys.
- Mermaid labels escape `<` and `>`, so job names like `Build <main>` render as text instead of being swallowed as HTML.
- Markdown reports escape job ids in the findings scope, so a job id containing a backtick, pipe, or newline can no longer break code spans or tables.
