import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LangProvider } from '@/lib/lang.jsx';
import { SettingsProvider } from '@/lib/settings.jsx';
import AuthGate from '@/components/AuthGate';

const TerminalDetective = lazy(() => import('./pages/TerminalDetective'));

function AppLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#02060e]">
      <div className="w-8 h-8 border-4 border-cyan-200/20 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isLoadingAuth) {
    return <AppLoading />;
  }

  if (!isAuthenticated) {
    return <AuthGate />;
  }

  return <TerminalDetective />;
};


function App() {

  return (
    <LangProvider>
      <SettingsProvider>
        <AuthProvider>
          <Suspense fallback={<AppLoading />}>
            <AuthenticatedApp />
          </Suspense>
        </AuthProvider>
      </SettingsProvider>
    </LangProvider>
  )
}

export default App
