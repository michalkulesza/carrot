interface StatCardProps {
  value: string | number | null
  label: string
}

const StatCard = ({ value, label }: StatCardProps) => {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 rounded-xl bg-zinc-50 py-4 px-2">
      <span className="text-2xl font-bold text-zinc-800">{value ?? '—'}</span>
      <span className="text-xs text-zinc-400 text-center">{label}</span>
    </div>
  )
}

export default StatCard
