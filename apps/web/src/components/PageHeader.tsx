import { useCallback, useState } from 'react'
import { ChevronDown } from 'react-feather'
import { useTranslation } from 'react-i18next'
import BellPopover from './BellPopover'
import HouseholdSwitcher from './HouseholdSwitcher'
import { useHousehold } from '../context/HouseholdContext'

interface PageHeaderProps {
  title: string
  action?: React.ReactNode
  searchSlot?: React.ReactNode
}

const PageHeader = ({ title, action, searchSlot }: PageHeaderProps) => {
  const { t } = useTranslation()
  const { activeHousehold } = useHousehold()
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const bandColor = activeHousehold?.color ?? null
  const householdName = activeHousehold
    ? activeHousehold.name
    : t('nav.personalLibrary')

  const headerClassName = `sticky top-0 z-30 backdrop-blur-md border-b md:rounded-t-xl ${
    bandColor ? 'border-zinc-200' : 'bg-background/80 border-zinc-200'
  }`
  const headerStyle = bandColor
    ? {
        paddingTop: 'env(safe-area-inset-top)',
        backgroundColor: `${bandColor}18`,
        borderBottomColor: `${bandColor}40`,
      }
    : { paddingTop: 'env(safe-area-inset-top)' }

  const handleOpenSwitcher = useCallback(() => setSwitcherOpen(true), [])
  const handleCloseSwitcher = useCallback(() => setSwitcherOpen(false), [])

  return (
    <header className={headerClassName} style={headerStyle}>
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto md:max-w-none md:mx-0">
        <button
          type="button"
          className="flex-1 min-w-0 text-left md:hidden"
          onClick={handleOpenSwitcher}
        >
          <h1 className="text-xl font-bold leading-tight truncate">{title}</h1>
          <p
            className="text-[11px] font-semibold uppercase tracking-wide leading-tight flex items-center gap-0.5"
            style={{ color: bandColor ?? undefined }}
          >
            <span className="truncate">{householdName}</span>
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              className="shrink-0 opacity-60"
            />
          </p>
        </button>
        <h1 className="hidden md:block text-xl font-bold leading-tight truncate shrink-0">
          {title}
        </h1>
        {searchSlot && (
          <div className="hidden md:flex flex-1 mx-4 max-w-sm">
            {searchSlot}
          </div>
        )}
        <div
          className={`flex items-center gap-1 shrink-0 ${searchSlot ? '' : 'md:ml-auto'} ml-2`}
        >
          {action}
          <BellPopover />
        </div>
      </div>
      {/* HouseholdSwitcher lives in the Sidebar on desktop; kept here for mobile's tap-to-switch header */}
      <HouseholdSwitcher isOpen={switcherOpen} onClose={handleCloseSwitcher} />
    </header>
  )
}

export default PageHeader
