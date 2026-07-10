import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'

interface AccountSectionProps {
  loggingOut: boolean
  onLogoutClick: () => void
}

const AccountSection = ({ loggingOut, onLogoutClick }: AccountSectionProps) => {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.account')}
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <Button
          size="sm"
          variant="danger-soft"
          onPress={onLogoutClick}
          isDisabled={loggingOut}
        >
          {loggingOut ? t('settings.loggingOut') : t('settings.logOut')}
        </Button>
      </div>
    </section>
  )
}

export default AccountSection
