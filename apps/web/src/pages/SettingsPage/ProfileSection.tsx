interface ProfileSectionProps {
  displayName: string
  nickname?: string | null
  email?: string | null
}

const ProfileSection = ({
  displayName,
  nickname,
  email,
}: ProfileSectionProps) => {
  return (
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center text-lg font-bold uppercase shrink-0">
        {displayName[0] ?? '?'}
      </div>
      <div className="min-w-0">
        {nickname && (
          <p className="font-semibold text-base truncate">{nickname}</p>
        )}
        <p className="text-sm text-zinc-400 truncate">{email}</p>
      </div>
    </div>
  )
}

export default ProfileSection
