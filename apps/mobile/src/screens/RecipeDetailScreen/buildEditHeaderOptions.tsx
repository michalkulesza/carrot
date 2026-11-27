import type { TFunction } from 'i18next'
import type { NativeStackHeaderItemButton } from '@react-navigation/native-stack'
import { Platform } from 'react-native'
import { palette } from '../../theme'
import { EditHeaderTitle } from './EditHeader'
import HeaderTextButton from './HeaderTextButton'

export const buildEditHeaderOptions = ({
  t,
  dirty,
  saveDisabled,
  onCancel,
  onSave,
}: {
  t: TFunction
  dirty: boolean
  saveDisabled: boolean
  onCancel: () => void
  onSave: () => void
}) => {
  const cancelItem: NativeStackHeaderItemButton = {
    type: 'button',
    label: t('common.cancel'),
    accessibilityLabel: t('common.cancel'),
    onPress: onCancel,
  }
  const saveItem: NativeStackHeaderItemButton = {
    type: 'button',
    label: t('common.save'),
    variant: 'prominent',
    tintColor: palette.action,
    disabled: saveDisabled,
    accessibilityLabel: t('common.save'),
    onPress: onSave,
  }

  const isIos = Platform.OS === 'ios'
  const renderCancel = () => <HeaderTextButton label={t('common.cancel')} onPress={onCancel} />
  const renderSave = () => <HeaderTextButton label={t('common.save')} onPress={onSave} disabled={saveDisabled} accent />

  return {
    gestureEnabled: false,
    headerTransparent: true,
    headerShadowVisible: false,
    headerLeft: isIos ? undefined : renderCancel,
    headerRight: isIos ? undefined : renderSave,
    headerTitle: () => <EditHeaderTitle dirty={dirty} />,
    unstable_headerLeftItems: () => [cancelItem],
    unstable_headerRightItems: () => [saveItem],
  }
}
