import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActionSheetIOS, Alert, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import ActionMenuSheet from '../components/dialogs/ActionMenuSheet'
import PromptSheet from '../components/dialogs/PromptSheet'
import type {
  ActionMenuOption,
  ActionMenuOptions,
  PromptFn,
  PromptOptions,
  ShowActionMenuFn,
} from '../components/dialogs/types'

interface DialogContextValue {
  prompt: PromptFn
  showActionMenu: ShowActionMenuFn
}

const DialogContext = createContext<DialogContextValue | null>(null)

const useDialogContext = () => {
  const context = useContext(DialogContext)
  if (!context) throw new Error('DialogProvider is missing')

  return context
}

export const usePrompt = () => useDialogContext().prompt
export const useActionMenu = () => useDialogContext().showActionMenu

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const [promptRequest, setPromptRequest] = useState<PromptOptions | null>(null)
  const [menuRequest, setMenuRequest] = useState<ActionMenuOptions | null>(null)
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null)
  const promptOpenRef = useRef(false)
  const menuOpenRef = useRef(false)

  const promptIOS = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        const buttons = [
          { text: t('common.cancel'), style: 'cancel' as const, onPress: () => resolve(null) },
          {
            text: options.confirmLabel ?? t('common.ok'),
            style: options.destructive ? ('destructive' as const) : ('default' as const),
            onPress: (text?: string) => resolve(text ?? ''),
          },
        ]

        Alert.prompt(
          options.title,
          options.message,
          buttons,
          'plain-text',
          options.defaultValue ?? '',
          options.keyboardType,
        )
      }),
    [t],
  )

  const prompt = useCallback<PromptFn>(
    async (options) => {
      if (promptOpenRef.current) return null
      promptOpenRef.current = true

      if (Platform.OS === 'ios') {
        try {
          return await promptIOS(options)
        } finally {
          promptOpenRef.current = false
        }
      }

      return new Promise<string | null>((resolve) => {
        promptResolverRef.current = resolve
        setPromptRequest(options)
      })
    },
    [promptIOS],
  )

  const handlePromptSettled = useCallback((value: string | null) => {
    const resolve = promptResolverRef.current
    promptResolverRef.current = null
    promptOpenRef.current = false
    setPromptRequest(null)
    resolve?.(value)
  }, [])

  const showActionMenuIOS = useCallback(
    ({ title, message, options }: ActionMenuOptions) => {
      const labels = [...options.map((option) => option.label), t('common.cancel')]
      const destructiveButtonIndex = options.flatMap((option, index) => (option.destructive ? [index] : []))

      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: labels,
          cancelButtonIndex: options.length,
          destructiveButtonIndex: destructiveButtonIndex.length > 0 ? destructiveButtonIndex : undefined,
        },
        (index) => {
          if (index < options.length) options[index].onPress()
        },
      )
    },
    [t],
  )

  const showActionMenu = useCallback<ShowActionMenuFn>(
    (options) => {
      if (Platform.OS === 'ios') {
        showActionMenuIOS(options)
        return
      }
      if (menuOpenRef.current) return
      menuOpenRef.current = true
      setMenuRequest(options)
    },
    [showActionMenuIOS],
  )

  const handleMenuSettled = useCallback((selected: ActionMenuOption | null) => {
    menuOpenRef.current = false
    setMenuRequest(null)
    selected?.onPress()
  }, [])

  const value = useMemo(() => ({ prompt, showActionMenu }), [prompt, showActionMenu])

  return (
    <DialogContext.Provider value={value}>
      {children}
      {promptRequest ? <PromptSheet request={promptRequest} onSettled={handlePromptSettled} /> : null}
      {menuRequest ? <ActionMenuSheet request={menuRequest} onSettled={handleMenuSettled} /> : null}
    </DialogContext.Provider>
  )
}
