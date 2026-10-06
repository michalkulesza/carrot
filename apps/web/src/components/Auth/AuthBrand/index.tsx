interface AuthBrandProps {
  className?: string
}

const AuthBrand = ({ className = '' }: AuthBrandProps) => (
  <div className={`items-center gap-2.5 ${className}`}>
    <img
      src="/favicon.svg"
      alt=""
      className="size-10 rounded-[11px] lg:size-9.5"
    />
    <span className="text-[22px] font-extrabold">Carrot</span>
  </div>
)

export default AuthBrand
