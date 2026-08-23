import React, { lazy, Suspense, useState } from 'react';
import GameLanding from '@/components/game/GameLanding';
import { loadProfile, saveProfile } from '@/game/playerProfile';

const AgentLobby = lazy(() => import('@/components/game/AgentLobby'));
const InvestigationTerminal = lazy(() => import('@/components/game/InvestigationTerminal'));
const CaseSelect = lazy(() => import('@/components/game/CaseSelect'));
const DetectiveHome = lazy(() => import('@/components/game/DetectiveHome'));
const DetectiveRegistration = lazy(() => import('@/components/game/DetectiveRegistration'));

function ScreenFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#02060e] text-cyan-300 font-mono text-xs tracking-[0.25em]">
      ◈ LOADING DETECTIVE MODULE…
    </div>
  );
}

export default function TerminalDetective() {
  const [screen, setScreen] = useState('LANDING');
  const [agentStrategy, setAgentStrategy] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [regBusy, setRegBusy] = useState(false);

  const handleStart = async () => {
    const profile = await loadProfile();
    setScreen(profile.detective_name ? 'HOME' : 'REGISTRATION');
  };

  const handleRegister = async (identity) => {
    setRegBusy(true);
    const profile = await loadProfile();
    await saveProfile({ ...profile, ...identity });
    setRegBusy(false);
    setScreen('HOME');
  };

  const handleDeploy = (strategy) => {
    setAgentStrategy(strategy);
    setScreen('CASE_SELECT');
  };

  const handleCaseSelect = (caseData) => {
    setSelectedCase(caseData);
    setScreen('GAME');
  };

  let content;
  if (screen === 'LANDING') {
    content = <GameLanding onStart={handleStart} />;
  } else if (screen === 'REGISTRATION') {
    content = (
      <DetectiveRegistration
        onConfirm={handleRegister}
        onBack={() => setScreen('LANDING')}
        busy={regBusy}
      />
    );
  } else if (screen === 'HOME') {
    content = (
      <DetectiveHome
        onEnterLobby={() => setScreen('LOBBY')}
        onOpenCases={() => setScreen('LOBBY')}
        onRegister={() => setScreen('REGISTRATION')}
      />
    );
  } else if (screen === 'LOBBY') {
    content = <AgentLobby onDeploy={handleDeploy} onBack={() => setScreen('HOME')} />;
  } else if (screen === 'CASE_SELECT') {
    content = <CaseSelect onSelect={handleCaseSelect} onBack={() => setScreen('LOBBY')} />;
  } else {
    content = (
      <InvestigationTerminal
        agentStrategy={agentStrategy}
        selectedCase={selectedCase}
        onGameEnd={() => setScreen('HOME')}
        onBackToLobby={() => setScreen('LOBBY')}
      />
    );
  }

  return <Suspense fallback={<ScreenFallback />}>{content}</Suspense>;
}
