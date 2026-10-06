import { useTranslation } from 'react-i18next'
import useCopyFlash from '../hooks/useCopyFlash'
import BrandMark from './BrandMark'

const DEMO_EMAIL = 'showcase@demo.com'
const DEMO_PASSWORD = 'showcase'

type CredentialKey = 'email' | 'password'

const BAR_WIDTH_CLASS = {
  1: 'w-px',
  2: 'w-0.5',
  3: 'w-0.75',
  4: 'w-1',
} as const

const BARCODE_PATTERN = [1, 1, 4, 1, 2, 1, 3, 2] as const
const BARCODE = [
  ...BARCODE_PATTERN,
  ...BARCODE_PATTERN,
  ...BARCODE_PATTERN,
  ...BARCODE_PATTERN,
  1,
  1,
] as const

const LABEL_CLASS = 'text-micro font-extrabold uppercase tracking-ticket'

type CredentialRowProps = {
  label: string
  value: string
  isFlashed: boolean
  onCopy: () => void
}

const CredentialRow = ({
  label,
  value,
  isFlashed,
  onCopy,
}: CredentialRowProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-end gap-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <span className={`${LABEL_CLASS} text-ink-faint`}>{label}</span>
        <span className="truncate text-lg font-extrabold sm:text-xl">
          {value}
        </span>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`${t('showcase.pass.copy')} ${label}`}
        className={`flex h-8.5 shrink-0 items-center whitespace-nowrap rounded-chip px-3 text-xs-plus font-extrabold transition-all duration-150 ${
          isFlashed
            ? 'bg-success text-white'
            : 'bg-carrot-wash text-carrot-strong hover:bg-carrot-line/60'
        }`}
      >
        <span aria-live="polite">
          {isFlashed ? t('showcase.pass.copied') : t('showcase.pass.copy')}
        </span>
      </button>
    </div>
  )
}

const Barcode = () => (
  <div
    aria-hidden="true"
    className="flex h-8.5 w-25 justify-center gap-px overflow-hidden opacity-85"
  >
    {BARCODE.map((width, index) => (
      <span
        key={index}
        className={`h-full shrink-0 bg-ink ${BAR_WIDTH_CLASS[width]}`}
      />
    ))}
  </div>
)

type StubFieldProps = {
  label: string
  value: string
}

const StubField = ({ label, value }: StubFieldProps) => (
  <div className="flex flex-col gap-0.5">
    <span className={`${LABEL_CLASS} text-carrot-strong`}>{label}</span>
    <span className="text-sm-plus font-extrabold text-carrot-ink">{value}</span>
  </div>
)

/** Tear-off ticket holding the shared demo account credentials. */
const DemoPass = () => {
  const { t } = useTranslation()
  const { flashed, copy } = useCopyFlash<CredentialKey>()

  return (
    <div className="relative flex drop-shadow-pass">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white sm:rounded-r-none">
        <div className="flex items-center gap-2.5 bg-ink px-5 py-3 text-white">
          <BrandMark size="sm" />
          <span className="flex-1 truncate text-xs-plus font-extrabold uppercase tracking-ticket">
            {t('showcase.pass.header')}
          </span>
          <span className="hidden shrink-0 text-2xs font-extrabold uppercase tracking-stamp text-carrot-light sm:inline">
            {t('showcase.pass.admitOne')}
          </span>
        </div>
        <div className="flex flex-col gap-3.5 px-5 pt-4 pb-4.5">
          <CredentialRow
            label={t('showcase.pass.email')}
            value={DEMO_EMAIL}
            isFlashed={flashed === 'email'}
            onCopy={() => copy('email', DEMO_EMAIL)}
          />
          <div className="border-t-2 border-dashed border-line" />
          <CredentialRow
            label={t('showcase.pass.password')}
            value={DEMO_PASSWORD}
            isFlashed={flashed === 'password'}
            onCopy={() => copy('password', DEMO_PASSWORD)}
          />
        </div>
      </div>

      <div className="relative hidden w-33 flex-col items-center justify-between rounded-r-2xl border-l-2 border-dashed border-carrot-line bg-carrot-wash px-3 py-3.5 text-center sm:flex">
        <span className="absolute top-1/2 -left-3.5 -mt-3.5 size-7 rounded-full bg-canvas ring-1 ring-line ring-inset" />
        <StubField
          label={t('showcase.pass.valid')}
          value={t('showcase.pass.anytime')}
        />
        <StubField
          label={t('showcase.pass.resets')}
          value={t('showcase.pass.automatically')}
        />
        <Barcode />
      </div>

      <span className="absolute -top-3 right-30.5 hidden size-6 rounded-full bg-canvas sm:block" />
      <span className="absolute right-30.5 -bottom-3 hidden size-6 rounded-full bg-canvas sm:block" />
    </div>
  )
}

export default DemoPass
