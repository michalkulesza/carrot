import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'react-feather'

interface AddItemRowProps {
  onAdd: (text: string) => void
}

const AddItemRow = ({ onAdd }: AddItemRowProps) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText) return

    onAdd(trimmedText)
    setText('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-4 md:px-6 py-3 bg-zinc-50 border-b border-zinc-100"
    >
      <Plus size={18} className="text-primary shrink-0" />
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('shoppingList.addItemPlaceholder')}
        className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-zinc-400"
      />
    </form>
  )
}

export default AddItemRow
