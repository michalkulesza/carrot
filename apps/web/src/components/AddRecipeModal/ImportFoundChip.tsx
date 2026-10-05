interface ImportFoundChipProps {
  found: boolean
  label: string
  missingLabel: string
}

const ImportFoundChip = ({
  found,
  label,
  missingLabel,
}: ImportFoundChipProps) => (
  <span
    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-extrabold transition-all duration-200 ${
      found ? 'bg-[#E5F4EA] text-[#2F7A4A]' : 'bg-[#F4F3F7] text-[#8C8A99]'
    }`}
  >
    {found ? '✓' : '·'} {found ? label : missingLabel}
  </span>
)

export default ImportFoundChip
