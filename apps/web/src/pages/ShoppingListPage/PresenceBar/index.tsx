import type { PresenceUser } from '@carrot/shared/types'

interface PresenceBarProps {
  users: PresenceUser[]
  currentUserId?: string
}

const PresenceBar = ({ users, currentUserId }: PresenceBarProps) => {
  const otherUsers = users.filter((user) => user.user_id !== currentUserId)

  if (otherUsers.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 px-4 md:px-6 py-2 border-b border-zinc-100">
      {otherUsers.map((user) => (
        <div
          key={user.user_id}
          title={user.nickname}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
          style={{ backgroundColor: user.color }}
        >
          {user.nickname.charAt(0).toUpperCase()}
        </div>
      ))}
    </div>
  )
}

export default PresenceBar
