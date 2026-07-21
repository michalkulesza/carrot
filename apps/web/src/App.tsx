import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { ToastProvider } from '@heroui/react'
import { ApiClientProvider } from '@carrot/shared/api/context'
import { AuthProvider } from './context/AuthContext'
import { CookingModeProvider } from './context/CookingModeContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyPage from './pages/VerifyPage'
import CompleteProfilePage from './pages/CompleteProfilePage'
import { webClient } from './api/client'
import { useAuth } from './context/AuthContext'
import PublicRecipePage from './pages/PublicRecipePage'
import PublicSidebar from './components/PublicSidebar'
import { TimerProvider } from './context/TimerContext'
import { NotificationHistoryProvider } from './context/NotificationHistoryContext'

const queryClient = new QueryClient()

const PublicRecipeRoute = () => {
  const { user, loading } = useAuth()
  useEffect(() => {
    console.log('[PublicShare] route auth state', { loading, authenticated: Boolean(user) })
  }, [loading, user])
  if (loading) return <PublicRecipeLayout />
  return user ? <AppShell /> : <PublicRecipeLayout />
}

const PublicRecipeLayout = () => (
  <NotificationHistoryProvider>
    <TimerProvider>
      <div className="min-h-screen bg-background md:bg-zinc-100">
        <div className="md:mx-auto md:flex md:min-h-screen md:max-w-7xl">
          <PublicSidebar />
          <div className="min-w-0 flex-1 pb-[env(safe-area-inset-bottom)] md:my-2 md:mr-2 md:rounded-xl md:bg-background md:shadow-sm">
            <PublicRecipePage />
          </div>
        </div>
      </div>
    </TimerProvider>
  </NotificationHistoryProvider>
)

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ApiClientProvider client={webClient}>
      <BrowserRouter>
        <ToastProvider placement="bottom" />
        <CookingModeProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route
                path="/complete-profile"
                element={<CompleteProfilePage />}
              />
              <Route path="/r/:token" element={<PublicRecipeRoute />} />
              <Route path="/marketing" element={<PublicRecipeLayout />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </CookingModeProvider>
      </BrowserRouter>
    </ApiClientProvider>
  </QueryClientProvider>
)

export default App
