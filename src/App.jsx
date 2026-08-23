import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LangProvider } from '@/lib/lang.jsx';
import { SettingsProvider } from '@/lib/settings.jsx';
// Add page imports here
import TerminalDetective from './pages/TerminalDetective';

const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const UserNotRegisteredError = lazy(() => import('@/components/UserNotRegisteredError'));

function AppLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#02060e]">
      <div className="w-8 h-8 border-4 border-cyan-200/20 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoading />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<TerminalDetective />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <LangProvider>
      <SettingsProvider>
        <AuthProvider>
          <Router>
            <Suspense fallback={<AppLoading />}>
              <AuthenticatedApp />
            </Suspense>
          </Router>
        </AuthProvider>
      </SettingsProvider>
    </LangProvider>
  )
}

export default App
