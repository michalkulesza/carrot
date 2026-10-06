interface AuthErrorProps {
  message: string | null
}

const AuthError = ({ message }: AuthErrorProps) => {
  if (!message) return null

  return (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  )
}

export default AuthError
