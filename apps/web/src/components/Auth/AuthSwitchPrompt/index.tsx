import { Link } from 'react-router-dom'

interface AuthSwitchPromptProps {
  prompt: string
  linkLabel: string
  to: string
}

const AuthSwitchPrompt = ({ prompt, linkLabel, to }: AuthSwitchPromptProps) => (
  <p className="text-center text-sm font-semibold text-ink-muted">
    {prompt}{' '}
    <Link to={to} className="font-extrabold text-carrot-strong">
      {linkLabel}
    </Link>
  </p>
)

export default AuthSwitchPrompt
