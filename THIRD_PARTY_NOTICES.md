# Third-party notices

ActionLens is MIT licensed. It bundles the following third-party software and
assets.

## Runtime libraries

| Package | License | Project |
| --- | --- | --- |
| React, React DOM | MIT | https://react.dev |
| React Flow (`@xyflow/react`) | MIT | https://reactflow.dev |
| Dagre (`@dagrejs/dagre`) | MIT | https://github.com/dagrejs/dagre |
| `yaml` | ISC | https://eemeli.org/yaml/ |
| Lucide (`lucide-react`) | ISC | https://lucide.dev |

## Fonts

| Font | License | Project |
| --- | --- | --- |
| Inter | SIL Open Font License 1.1 | https://rsms.me/inter/ |
| JetBrains Mono | SIL Open Font License 1.1 | https://www.jetbrains.com/lp/mono/ |

The fonts are self-hosted through the `@fontsource-variable` packages. Their
license texts are included in those packages:

- `node_modules/@fontsource-variable/inter/LICENSE`
- `node_modules/@fontsource-variable/jetbrains-mono/LICENSE`

Full license texts are also available at:

- https://openfontlicense.org/open-font-license-official-text/
- https://scripts.sil.org/OFL

## Build tooling

Vite, Tailwind CSS, TypeScript, Vitest, and their dependencies are used under
their respective licenses. They are not part of the runtime bundle except for
the compiled output they produce.
