import React, { lazy, Suspense, useRef, useState } from 'react';
import GameLanding from '@/components/game/GameLanding';
import DetectiveRegistration from '@/components/game/DetectiveRegistration';
import { markActivity, startCase } from '@/game/playerProfile';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { buildTeamConfig } from '@/game/teamConfig';

const AgentLobby = lazy(() => import('@/components/game/AgentLobby'));
const InvestigationTerminal = lazy(() => import('@/components/game/InvestigationTerminal'));
const CaseSelect = lazy(() => import('@/components/game/CaseSelect'));
const DetectiveHome = lazy(() => import('@/components/game/DetectiveHome'));

function ScreenFallback() {
  return (
    <div className="td-screen-fallback fixed inset-0 flex items-center justify-center bg-[#02060e] text-cyan-300 font-mono text-xs tracking-[0.25em]">
      <span>◈</span> LOADING DETECTIVE MODULE…
    </div>
  );
}

export default function TerminalDetective() {
  const { profile, mutate, refresh, settle, isReadOnly } = useProfile();
  const [screen, setScreen] = useState('LANDING');
  const [agentStrategy, setAgentStrategy] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [regBusy, setRegBusy] = useState(false);
  const registrationRef = useRef(false);
  const [regError, setRegError] = useState('');
  const [preferredCaseId, setPreferredCaseId] = useState(null);

  const handleStart = async () => {
    const current = profile || await refresh();
    setScreen(current.detective_name ? 'HOME' : 'REGISTRATION');
  };

  const handleRegister = async (identity) => {
    if (registrationRef.current) return;
    registrationRef.current = true;
    setRegBusy(true);
    setRegError('');
    try {
      const result = await mutate(current => ({ profile: { ...current, ...identity } }));
      if (!result?.profile?.detective_name) throw new Error('Identity was not persisted.');
      const verified = await refresh();
      if (verified?.detective_name !== identity.detective_name) {
        throw new Error('Identity did not survive cloud verification.');
      }
      setScreen('HOME');
    } catch (cause) {
      setRegError(cause?.code === 'UNAUTHENTICATED'
        ? '登录状态已失效，请重新登录后再注册。'
        : '身份尚未写入云端，已保留当前输入，请检查网络后重试。');
    } finally {
      registrationRef.current = false;
      setRegBusy(false);
    }
  };

  const handleDeploy = async (strategy) => {
    setAgentStrategy(strategy);
    setScreen('CASE_SELECT');
  };

  const handleTeamSave = async (teamConfig) => {
    return mutate(current => ({
      profile: {
        ...markActivity(current, 'team_saved'),
        saved_team_config: teamConfig,
      },
    }));
  };

  const handleSkillLoadout = async (skillLoadout) => {
    return mutate(current => ({ profile: { ...current, skill_loadout: skillLoadout } }));
  };

  const handleCaseSelect = async (caseData) => {
    const result = await mutate(current => startCase(current, caseData));
    if (result?.error) return result;
    const currentSkills = agentStrategy?.skill_effects || {};
    const extraSkills = result.effects.skill_effects || {};
    const skillEffects = { ...currentSkills };
    Object.entries(extraSkills).forEach(([key, value]) => {
      skillEffects[key] = typeof value === 'number' ? (Number(skillEffects[key]) || 0) + value : value || skillEffects[key];
    });
    setAgentStrategy({
      ...(agentStrategy || {}), skill_effects: skillEffects,
      home_effects: {
        initial_ap_bonus: result.effects.initial_ap_bonus,
        ignore_first_trap: result.effects.ignore_first_trap,
      },
    });
    setSelectedCase(caseData);
    setScreen('GAME');
    return result;
  };

  const handleSettlement = async (summary) => {
    return settle(summary);
  };

  const openLobbyForCase = (caseId = null) => {
    setPreferredCaseId(caseId);
    setScreen('LOBBY');
  };

  const openCasesWithSavedTeam = async (caseId = null) => {
    const saved = profile?.saved_team_config;
    if (!saved) {
      openLobbyForCase(caseId);
      return;
    }
    setAgentStrategy(buildTeamConfig(saved, saved.primary_agent_index, profile?.skill_loadout));
    setPreferredCaseId(caseId);
    setScreen('CASE_SELECT');
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
        error={regError}
      />
    );
  } else if (screen === 'HOME') {
    content = (
      <DetectiveHome
        onEnterLobby={openLobbyForCase}
        onOpenCases={openCasesWithSavedTeam}
        onRegister={() => setScreen('REGISTRATION')}
      />
    );
  } else if (screen === 'LOBBY') {
    content = <AgentLobby profile={profile} readOnly={isReadOnly} onDeploy={handleDeploy} onBack={() => setScreen('HOME')} onTeamSave={handleTeamSave} onSkillLoadout={handleSkillLoadout} />;
  } else if (screen === 'CASE_SELECT') {
    content = <CaseSelect profile={profile} onSelect={handleCaseSelect} onBack={() => setScreen('LOBBY')} preferredCaseId={preferredCaseId} />;
  } else {
    content = (
      <InvestigationTerminal
        agentStrategy={agentStrategy}
        selectedCase={selectedCase}
        onSettlement={handleSettlement}
        onGameEnd={() => setScreen('HOME')}
        onBackToLobby={() => setScreen('LOBBY')}
      />
    );
  }

  return (
    <Suspense fallback={<ScreenFallback />}>
      <div key={screen} className="td-screen-stage">{content}</div>
    </Suspense>
  );
}
