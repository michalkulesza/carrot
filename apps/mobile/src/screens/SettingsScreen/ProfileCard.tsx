import { useCallback } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useRecipeStats } from '@carrot/shared/hooks/useRecipes'
import Avatar from '../../components/Avatar'
import { AppText, Button, StatTile } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useTapGuard } from '../../hooks/useTapGuard'
import { palette } from '../../theme'
import { styles } from './styles'

const AVATAR_SIZE = 48
const EMPTY_VALUE = '—'

const ProfileCard = () => {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { data: stats } = useRecipeStats()
  const acceptTap = useTapGuard()

  const email = user?.email ?? ''
  const displayName = user?.nickname || email.split('@')[0]
  const formatNumber = (value: number | null | undefined) =>
    value == null ? EMPTY_VALUE : Math.round(value).toLocaleString(i18n.language)

  const handleOpenMyRecipes = useCallback(() => {
    if (!acceptTap()) return

    router.push('/(tabs)/settings/my-recipes')
  }, [acceptTap, router])

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <Avatar name={displayName} color={palette.action} size={AVATAR_SIZE} />
        <View style={styles.profileText}>
          <AppText variant="cardTitle" numberOfLines={1}>
            {displayName}
          </AppText>
          <AppText variant="meta" tone="textSecondary" numberOfLines={1}>
            {email}
          </AppText>
        </View>
      </View>
      <View style={styles.statRow}>
        <StatTile value={formatNumber(stats?.total_recipes)} label={t('settings.recipesLabel')} />
        <StatTile value={formatNumber(stats?.total_ingredients)} label={t('settings.ingredientsLabel')} />
        <StatTile value={formatNumber(stats?.avg_kcal)} label={t('settings.avgKcal')} />
      </View>
      <Button label={t('settings.myRecipes')} icon="book" size="lg" fullWidth onPress={handleOpenMyRecipes} />
    </View>
  )
}

export default ProfileCard
