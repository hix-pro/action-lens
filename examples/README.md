# Examples

These files are loaded by the in-app sample picker, so they stay honest: change
one here and the demo changes with it.

| File | What it shows |
| --- | --- |
| [`release-pipeline.yml`](release-pipeline.yml) | Lint, a 6-instance test matrix, and a tag-only publish. Permissions are scoped and managed actions are pinned to commit SHAs. |
| [`dangerous-pr-preview.yml`](dangerous-pr-preview.yml) | Deliberately unsafe: `pull_request_target`, `write-all`, a fork checkout, script injection, and a literal token. |
| [`nightly-bot.yml`](nightly-bot.yml) | Privileged `workflow_run`, a self-hosted runner, a remote installer piped into a shell, and `secrets: inherit`. |

The dangerous file is the default demo. Do not deploy it.

## Loading

Drag a file onto the app, or use **Open file** in the source panel. There is no
server-side processing.

Validate a workflow with [actionlint](https://github.com/rhysd/actionlint)
without running it:

```bash
actionlint release-pipeline.yml
```

`dangerous-pr-preview.yml` is syntactically valid; the findings are about
security and configuration, not YAML syntax.
