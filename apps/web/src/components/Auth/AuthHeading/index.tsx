import type { ReactNode } from 'react'

interface AuthHeadingProps {
  title: string
  subtitle: string
  children?: ReactNode
}

const AuthHeading = ({ title, subtitle, children }: AuthHeadingProps) => (
  <div className="flex flex-col gap-1">
    <h1 className="text-[28px] font-extrabold leading-[1.15] text-ink">
      {title}
    </h1>
    <p className="text-[15px] font-semibold leading-[1.45] text-ink-muted">
      {subtitle}
    </p>
    {children}
  </div>
)

export default AuthHeading
