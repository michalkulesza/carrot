import './src/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from './src/i18n'
import { NavigationContainer } from '@react-navigation/native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ApiClientProvider } from '@platekeeper/shared/api/context'
import { AuthProvider } from './src/context/AuthContext'
import { NotificationHistoryProvider } from './src/context/NotificationHistoryContext'
import { TimerProvider } from './src/context/TimerContext'
import { HouseholdProvider } from './src/context/HouseholdContext'
import { mobileClient } from './src/api/client'
import RootNavigator from './src/navigation'

const queryClient = new QueryClient()

const App = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ApiClientProvider client={mobileClient}>
          <AuthProvider>
            <NotificationHistoryProvider>
              <TimerProvider>
                <HouseholdProvider>
                  <NavigationContainer>
                    <RootNavigator />
                  </NavigationContainer>
                </HouseholdProvider>
              </TimerProvider>
            </NotificationHistoryProvider>
          </AuthProvider>
        </ApiClientProvider>
      </I18nextProvider>
    </QueryClientProvider>
  </GestureHandlerRootView>
)

export default App
