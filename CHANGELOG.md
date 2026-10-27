# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
