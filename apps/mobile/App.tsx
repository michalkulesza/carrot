import './src/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from './src/i18n'
import { NavigationContainer } from '@react-navigation/native'
import { ApiClientProvider } from '@platekeeper/shared/api/context'
import { AuthProvider } from './src/context/AuthContext'
import { mobileClient } from './src/api/client'
import RootNavigator from './src/navigation'

const queryClient = new QueryClient()

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nextProvider i18n={i18n}>
      <ApiClientProvider client={mobileClient}>
        <AuthProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </ApiClientProvider>
    </I18nextProvider>
  </QueryClientProvider>
)

export default App
