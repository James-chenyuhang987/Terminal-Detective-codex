import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { LangProvider } from '@/lib/lang.jsx';
import { SettingsProvider } from '@/lib/settings.jsx';
import GameLanding from '@/components/game/GameLanding.jsx';
import DetectiveHome from '@/components/game/DetectiveHome.jsx';

function Landing() {
  return <GameLanding onStart={() => {}} />;
}

function Home() {
  return <DetectiveHome onEnterLobby={() => {}} onOpenCases={() => {}} onRegister={() => {}} />;
}

function App() {
  const page = new URLSearchParams(window.location.search).get('page') || 'landing';
  const content = page === 'home' ? <Home /> : <Landing />;
  return (
    <SettingsProvider>
      <LangProvider>{content}</LangProvider>
    </SettingsProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
