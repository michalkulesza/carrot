interface CountPillProps {
  count: number
}

const CountPill = ({ count }: CountPillProps) =>
  count > 0 ? (
    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-semibold normal-case tracking-normal text-zinc-600 tabular-nums">
      {count}
    </span>
  ) : null

export default CountPill
