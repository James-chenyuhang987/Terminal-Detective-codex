import { lazy, Suspense } from 'react';

import { ProfileProvider, SessionReadOnlyBanner } from '@/lib/ProfileContext.jsx';

const TerminalDetective = lazy(() => import('@/pages/TerminalDetective.jsx'));

function GameLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#02060e]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-200/20 border-t-cyan-400" />
    </div>
  );
}

export default function ProfileAppShell() {
  return (
    <ProfileProvider>
      <SessionReadOnlyBanner />
      <Suspense fallback={<GameLoading />}>
        <TerminalDetective />
      </Suspense>
    </ProfileProvider>
  );
}
