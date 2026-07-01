import { useAuth } from '../context/AuthContext'

/**
 * Coordinates a screen's own data-loading state with auth bootstrap so the
 * screen never shows a spinner at the same time as the root `loadingOverlay`
 * in `app/_layout.tsx`.
 *
 * While auth is still resolving, that root overlay is the single source of
 * truth — so `showSpinner` stays false to avoid a duplicate loader. Once auth
 * is ready, the screen owns its loading spinner while data is fetched.
 *
 * `busy` stays true through the whole "not ready for content" window (auth
 * bootstrap + data load) so callers can keep rendering their loading branch
 * without flashing empty/placeholder content in between.
 */
export const useScreenLoading = (dataLoading: boolean) => {
  const { loading: authLoading } = useAuth()
  return {
    busy: authLoading || dataLoading,
    showSpinner: !authLoading && dataLoading,
  }
}
