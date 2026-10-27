import { LockKeyhole } from 'lucide-react'

function Mark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="6" cy="10" r="3" fill="#06090e" />
      <circle cx="14.5" cy="4.5" r="2.1" fill="#06090e" />
      <circle cx="14.5" cy="15.5" r="2.1" fill="#06090e" />
      <path d="M9 10h2.2M8 8.5l4.2-3M8 11.5l4.2 3" stroke="#06090e" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function GitHubMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function Header() {
  return (
    <header className="relative z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#06090e]/90 px-4 backdrop-blur-xl xl:px-5">
      <a href="./" className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-beam shadow-[0_0_26px_-5px_rgba(90,169,255,0.75)]">
          <Mark />
        </span>
        <span className="text-[15px] font-bold tracking-[-0.02em] text-slate-50">
          ActionLens
        </span>
      </a>

      <span className="hidden h-4 w-px bg-white/10 sm:block" />
      <span className="hidden text-[11px] text-slate-500 sm:block">
        GitHub Actions, explained.
      </span>

      <span className="ml-1 hidden items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 font-mono text-[9px] text-slate-500 lg:inline-flex">
        v0.1
      </span>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-beam/20 bg-beam/[0.06] px-2.5 py-1 text-[10px] font-medium text-beam-soft/90 md:inline-flex">
          <LockKeyhole size={10} strokeWidth={2} />
          Local-first · no upload
        </span>
        <a
          href="https://github.com/hix-pro/action-lens"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10.5px] font-medium text-slate-400 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-slate-100"
        >
          <GitHubMark />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </div>
    </header>
  )
}
