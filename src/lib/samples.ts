import releasePipeline from '../../examples/release-pipeline.yml?raw'
import dangerousPrPreview from '../../examples/dangerous-pr-preview.yml?raw'
import nightlyBot from '../../examples/nightly-bot.yml?raw'

export interface WorkflowSample {
  id: string
  name: string
  tagline: string
  filename: string
  yaml: string
}

export const samples: WorkflowSample[] = [
  {
    id: 'release',
    name: 'Release pipeline',
    tagline: 'Lint, a 6-instance test matrix, and a tag-only publish.',
    filename: 'release-pipeline.yml',
    yaml: releasePipeline,
  },
  {
    id: 'dangerous',
    name: 'Dangerous PR preview',
    tagline: 'pull_request_target plus a fork checkout: the classic CI compromise.',
    filename: 'dangerous-pr-preview.yml',
    yaml: dangerousPrPreview,
  },
  {
    id: 'nightly',
    name: 'Nightly bot',
    tagline: 'workflow_run, a self-hosted runner, and inherited secrets.',
    filename: 'nightly-bot.yml',
    yaml: nightlyBot,
  },
]

export const defaultSample =
  samples.find((sample) => sample.id === 'dangerous') ?? samples[0]!

export function findSample(id: string): WorkflowSample | undefined {
  return samples.find((sample) => sample.id === id)
}
