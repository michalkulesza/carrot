import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

const Support = () => {
  const { t } = useTranslation()
  const email = t('support.email')

  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <div className="flex w-full max-w-[720px] flex-col gap-6">
        <Link
          to="/"
          className="text-sm font-semibold text-[#FF8A3D] hover:underline"
        >
          {t('support.back')}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold text-[#111111]">
            {t('support.title')}
          </h1>
        </div>
        <p className="text-base leading-relaxed text-[#333333]">
          {t('support.intro')}
        </p>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-[#8A8A8A]">
            {t('support.emailLabel')}
          </span>
          <a
            href={`mailto:${email}`}
            className="text-base font-semibold text-[#FF8A3D] hover:underline"
          >
            {email}
          </a>
        </div>
      </div>
    </div>
  )
}

export default Support
