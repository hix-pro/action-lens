import { LockKeyhole } from 'lucide-react'
import { GitHubMark } from './GitHubMark'

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
        v0.3
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
