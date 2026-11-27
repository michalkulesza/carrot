import { useCallback, useRef, useState } from 'react'
import { lightHaptic, rigidHaptic } from '../../components/ui/haptics'

interface UseItemEditingParams {
  commitEdit: (variables: { id: string; text: string }) => void
  setEditing: (itemId: string | null) => void
}

export const useItemEditing = ({ commitEdit, setEditing }: UseItemEditingParams) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingIdRef = useRef<string | null>(null)

  const handleEditStart = useCallback((id: string) => {
    editingIdRef.current = id
    setEditingId(id)
    setEditing(id)
    rigidHaptic()
  }, [setEditing])

  const handleEditEnd = useCallback((id: string, initialText: string, nextText: string) => {
    const text = nextText.trim()
    if (text && text !== initialText) {
      commitEdit({ id, text })
      lightHaptic()
    }
    if (editingIdRef.current !== id) return

    editingIdRef.current = null
    setEditingId(null)
    setEditing(null)
  }, [commitEdit, setEditing])

  return { editingId, editingIdRef, handleEditStart, handleEditEnd }
}
