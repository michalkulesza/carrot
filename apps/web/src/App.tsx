import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

const queryClient = new QueryClient()

const PublicRecipeRoute = () => {
  const { user, loading } = useAuth()
  if (loading) return <PublicRecipePage />
  return user ? <AppShell /> : <PublicRecipePage />
}

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
              <Route path="/marketing" element={<PublicRecipePage />} />
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
