import { Gauge, Info, Play } from 'lucide-react'
import type { Footprint } from '../types'

interface FootprintCardProps {
  footprint: Footprint
  onMinutesChange: (value: number) => void
  onPriceChange: (value: number) => void
}

export function FootprintCard({
  footprint,
  onMinutesChange,
  onPriceChange,
}: FootprintCardProps) {
  return (
    <div className="mx-4 mt-4 rounded-xl border border-beam/15 bg-beam/[0.035] xl:mx-5">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-beam-soft/80">
          <Gauge size={11} strokeWidth={2} />
          Run footprint
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-slate-600">
          planning estimate
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 pb-2 pt-2">
        <div>
          <div className="font-mono text-[16px] font-semibold leading-none text-slate-100">
            {footprint.instances}
            {footprint.dynamic ? '+' : ''}
          </div>
          <div className="mt-1 text-[9px] text-slate-500">job instances</div>
        </div>
        <div>
          <div className="font-mono text-[16px] font-semibold leading-none text-slate-100">
            ~{Math.round(footprint.minutes)}
          </div>
          <div className="mt-1 text-[9px] text-slate-500">runner minutes</div>
        </div>
        <div>
          <div className="font-mono text-[16px] font-semibold leading-none text-beam-soft">
            ${footprint.costUsd.toFixed(2)}
          </div>
          <div className="mt-1 text-[9px] text-slate-500">private-repo cost</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-beam/10 px-3 py-2">
        <label className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
          <Play size={9} strokeWidth={2} className="text-slate-600" />
          <input
            type="number"
            min={1}
            max={600}
            step={1}
            value={footprint.minutesPerJob}
            onChange={(event) => onMinutesChange(Number(event.target.value))}
            aria-label="Assumed minutes per job"
            className="w-12 rounded border border-white/[0.08] bg-black/25 px-1 py-0.5 text-right font-mono text-[9.5px] text-slate-300 outline-none focus:border-beam/40"
          />
          min/job
        </label>
        <label className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
          <span className="text-slate-600">$</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.001}
            value={footprint.pricePerMinute}
            onChange={(event) => onPriceChange(Number(event.target.value))}
            aria-label="Assumed price per runner minute"
            className="w-14 rounded border border-white/[0.08] bg-black/25 px-1 py-0.5 text-right font-mono text-[9.5px] text-slate-300 outline-none focus:border-beam/40"
          />
          /min
        </label>
      </div>

      <div className="flex items-start gap-1.5 border-t border-beam/10 px-3 py-2">
        <Info size={10} className="mt-0.5 shrink-0 text-slate-600" />
        <p className="text-[9px] leading-relaxed text-slate-600">
          Not a bill. Step duration, queue time and matrix expressions decide the real
          numbers, and public repositories are free. Adjust the assumptions above.
        </p>
      </div>
    </div>
  )
}
