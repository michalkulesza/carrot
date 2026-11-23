interface InvitationCountBadgeProps {
  count: number
  className?: string
}

const InvitationCountBadge = ({
  count,
  className = '',
}: InvitationCountBadgeProps) => {
  if (count <= 0) return null

  const label = count > 9 ? '9+' : String(count)

  return (
    <span
      aria-hidden="true"
      className={`min-w-4 h-4 px-1 rounded-full bg-danger text-danger-foreground text-[11px] leading-4 font-bold flex items-center justify-center ${className}`}
    >
      {label}
    </span>
  )
}

export default InvitationCountBadge
