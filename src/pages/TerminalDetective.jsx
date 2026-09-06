import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import GameLanding from '@/components/game/GameLanding';
import DetectiveRegistration from '@/components/game/DetectiveRegistration';
import { markActivity, startCase } from '@/game/playerProfile';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { buildTeamConfig } from '@/game/teamConfig';
import { getActiveSupportAgentId, getSelectedCoreAgentIds, purchaseAgent } from '@/game/agentMarket';
import { useLang } from '@/lib/lang.jsx';
import { publicErrorMessage } from '@/lib/publicError.js';
import { ALL_CASES } from '@/game/caseData';
import { useSettings } from '@/lib/settings.jsx';
import { normalizeStoryMode } from '@/game/storyMode';
import StoryModeChooser from '@/components/game/theater/StoryModeChooser';
import NarrativeOverlay from '@/components/game/theater/NarrativeOverlay';
import { caseBriefingNarrative, worldNarrative } from '@/game/theaterNarrative';

const loadAgentLobby = () => import('@/components/game/AgentLobby');
const loadInvestigationTerminal = () => import('@/components/game/InvestigationTerminal');
const loadCaseSelect = () => import('@/components/game/CaseSelect');
const loadDetectiveHome = () => import('@/components/game/DetectiveHome');
const AgentLobby = lazy(loadAgentLobby);
const InvestigationTerminal = lazy(loadInvestigationTerminal);
const CaseSelect = lazy(loadCaseSelect);
const DetectiveHome = lazy(loadDetectiveHome);

function ScreenFallback() {
  const { lang } = useLang();
  return (
    <div className="td-screen-fallback fixed inset-0 flex items-center justify-center bg-[#02060e] text-cyan-300 font-mono text-xs tracking-[0.25em]">
      <span>◈</span> {lang === 'en' ? 'LOADING DETECTIVE MODULE…' : '正在加载侦探模块…'}
    </div>
  );
}

export default function TerminalDetective() {
  const { lang } = useLang();
  const { profile, mutate, refresh, loadProfile, settle, isReadOnly } = useProfile();
  const { settings, updateSetting } = useSettings();
  const [screen, setScreen] = useState('LANDING');
  const [showModeChooser, setShowModeChooser] = useState(false);
  const entryRequestRef = useRef(0);
  const caseStartRef = useRef(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const startRef = useRef(false);
  const [agentStrategy, setAgentStrategy] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [regBusy, setRegBusy] = useState(false);
  const registrationRef = useRef(false);
  const [regError, setRegError] = useState('');
  const [preferredCaseId, setPreferredCaseId] = useState(null);
  const [lobbyReturnScreen, setLobbyReturnScreen] = useState('HOME');
  const [entryNarrative, setEntryNarrative] = useState(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeError, setNarrativeError] = useState('');
  const briefingRequestRef = useRef(null);
  const briefedRunRef = useRef(false);

  useEffect(() => () => {
    briefingRequestRef.current?.resolve({ error: 'cancelled' });
    briefingRequestRef.current = null;
  }, []);

  useEffect(() => {
    const preload = () => {
      if (screen === 'LANDING' || screen === 'REGISTRATION') void loadDetectiveHome();
      if (screen === 'HOME') {
        void loadAgentLobby();
        void loadCaseSelect();
      }
      if (screen === 'LOBBY') {
        void loadCaseSelect();
        if (preferredCaseId) void loadInvestigationTerminal();
      }
      if (screen === 'CASE_SELECT') void loadInvestigationTerminal();
    };
    if (typeof window === 'undefined') return undefined;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 900 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 120);
    return () => clearTimeout(id);
  }, [preferredCaseId, screen]);

  const handleStart = () => {
    setStartError('');
    setShowModeChooser(true);
  };

  const handleCancelMode = () => {
    entryRequestRef.current += 1;
    startRef.current = false;
    setStartBusy(false);
    setStartError('');
    setShowModeChooser(false);
  };

  const handleConfirmMode = async (mode) => {
    if (startRef.current) return;
    startRef.current = true;
    const requestId = ++entryRequestRef.current;
    updateSetting('storyMode', normalizeStoryMode(mode));
    setStartBusy(true);
    setStartError('');
    try {
      const current = profile || await loadProfile();
      if (requestId !== entryRequestRef.current) return;
      if (!current || typeof current !== 'object') {
        const unavailable = /** @type {Error & { code?: string }} */ (
          new Error('Cloud profile did not return a usable profile.')
        );
        unavailable.code = 'PROFILE_UNAVAILABLE';
        throw unavailable;
      }
      if (current.detective_name) {
        void loadDetectiveHome();
        void loadAgentLobby();
        void loadCaseSelect();
      }
      setShowModeChooser(false);
      setScreen(current.detective_name ? 'HOME' : 'REGISTRATION');
    } catch (cause) {
      if (requestId !== entryRequestRef.current) return;
      setStartError(publicErrorMessage(cause, lang));
    } finally {
      if (requestId === entryRequestRef.current) {
        startRef.current = false;
        setStartBusy(false);
      }
    }
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
        ? (lang === 'en' ? 'Your session has expired. Sign in again before registering.' : '登录状态已失效，请重新登录后再注册。')
        : (lang === 'en' ? 'Your identity was not saved to the cloud. Your input is preserved; check the network and retry.' : '身份尚未写入云端，已保留当前输入，请检查网络后重试。'));
    } finally {
      registrationRef.current = false;
      setRegBusy(false);
    }
  };

  const handleDeploy = async (strategy) => {
    if (selectedCase) {
      setScreen('GAME');
      return { error: null };
    }
    setAgentStrategy(strategy);
    if (preferredCaseId) {
      const targetCase = ALL_CASES.find(item => item.case_id === preferredCaseId);
      if (targetCase) return requestCaseSelect(targetCase, strategy);
    }
    void loadCaseSelect();
    setScreen('CASE_SELECT');
    return { error: null };
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

  const handleAgentPurchase = async (agentId) => mutate(current => purchaseAgent(current, agentId));

  const handleCaseSelect = async (caseData, strategyOverride = null) => {
    if (selectedCase) {
      setScreen('GAME');
      return { error: null };
    }
    if (caseStartRef.current) return { error: 'busy' };
    caseStartRef.current = true;
    try {
      await loadInvestigationTerminal();
      const currentStrategy = strategyOverride || agentStrategy;
      const result = await mutate(current => startCase(current, caseData));
      if (result?.error) return result;
      const currentSkills = currentStrategy?.skill_effects || {};
      const extraSkills = result.effects.skill_effects || {};
      const skillEffects = { ...currentSkills };
      Object.entries(extraSkills).forEach(([key, value]) => {
        skillEffects[key] = typeof value === 'number' ? (Number(skillEffects[key]) || 0) + value : value || skillEffects[key];
      });
      setAgentStrategy({
        ...(currentStrategy || {}), skill_effects: skillEffects,
        home_effects: {
          initial_ap_bonus: result.effects.initial_ap_bonus + Math.max(0, Number(currentStrategy?.support_effects?.initial_ap_bonus) || 0),
          ignore_first_trap: result.effects.ignore_first_trap,
        },
      });
      setSelectedCase(caseData);
      setScreen('GAME');
      return result;
    } finally {
      caseStartRef.current = false;
    }
  };

  const requestCaseSelect = (caseData, strategyOverride = null) => {
    if (selectedCase) { setScreen('GAME'); return Promise.resolve({ error: null }); }
    if (briefingRequestRef.current || caseStartRef.current) return Promise.resolve({ error: 'busy' });
    briefedRunRef.current = false;
    if (settings.storyMode !== 'theater') return handleCaseSelect(caseData, strategyOverride);
    setNarrativeError('');
    setEntryNarrative({ kind: 'briefing', caseData });
    return new Promise(resolve => {
      briefingRequestRef.current = { caseData, strategyOverride, resolve, confirming: false };
    });
  };

  const cancelEntryNarrative = () => {
    const request = briefingRequestRef.current;
    if (request?.confirming) return;
    briefingRequestRef.current = null;
    request?.resolve({ error: 'cancelled' });
    setEntryNarrative(null);
    setNarrativeError('');
    setPreferredCaseId(null);
    setScreen('HOME');
  };

  const completeEntryNarrative = async () => {
    if (entryNarrative?.kind === 'prologue') {
      setEntryNarrative(null);
      await openCasesWithSavedTeam();
      return;
    }
    const request = briefingRequestRef.current;
    if (!request || request.confirming) return;
    request.confirming = true;
    setNarrativeBusy(true);
    setNarrativeError('');
    try {
      // Set before selecting the run: its stable owner consumes this only at initialization.
      briefedRunRef.current = true;
      const result = await handleCaseSelect(request.caseData, request.strategyOverride);
      if (result?.error) {
        briefedRunRef.current = false;
        setNarrativeError(lang === 'en' ? 'Unable to enter. Check your energy and profile sync, then retry or return home.' : '暂时无法进入，请检查体力与档案同步后重试，或返回主页。');
        return;
      }
      briefingRequestRef.current = null;
      setEntryNarrative(null);
      request.resolve(result);
    } catch (cause) {
      briefedRunRef.current = false;
      setNarrativeError(publicErrorMessage(cause, lang));
    } finally {
      request.confirming = false;
      setNarrativeBusy(false);
    }
  };

  const handleHomeStartInvestigation = () => {
    if (selectedCase) { setScreen('GAME'); return; }
    setNarrativeError('');
    setEntryNarrative({ kind: 'prologue' });
  };

  const handleSettlement = async (summary) => {
    return settle(summary);
  };

  const handleOpenHome = () => setScreen('HOME');
  const handleResume = () => { if (selectedCase) setScreen('GAME'); };
  const leaveRun = (nextScreen) => {
    setSelectedCase(null);
    setPreferredCaseId(null);
    setScreen(nextScreen);
  };

  const openLobbyForCase = (caseId = null, returnScreen = 'HOME') => {
    if (selectedCase) {
      setScreen('GAME');
      return;
    }
    void loadAgentLobby();
    setPreferredCaseId(caseId);
    setLobbyReturnScreen(returnScreen);
    setScreen('LOBBY');
  };

  const openCasesWithSavedTeam = async (caseId = null) => {
    if (selectedCase) {
      setScreen('GAME');
      return;
    }
    void loadCaseSelect();
    const saved = profile?.saved_team_config;
    if (!saved) {
      openLobbyForCase(caseId);
      return;
    }
    setAgentStrategy(buildTeamConfig(
      { ...saved, core_agent_ids: getSelectedCoreAgentIds(profile) },
      saved.primary_agent_index,
      profile?.skill_loadout,
      getActiveSupportAgentId(profile),
    ));
    setPreferredCaseId(caseId);
    setScreen('CASE_SELECT');
  };

  let content;
  if (screen === 'LANDING') {
    content = <GameLanding busy={startBusy} error={startError} onStart={handleStart} />;
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
        onStartInvestigation={settings.storyMode === 'theater' ? handleHomeStartInvestigation : null}
        onRegister={() => setScreen('REGISTRATION')}
        suspendedCase={selectedCase}
        onResume={handleResume}
      />
    );
  } else if (screen === 'LOBBY') {
    content = (
      <AgentLobby
        profile={profile}
        readOnly={isReadOnly}
        targetCase={ALL_CASES.find(item => item.case_id === preferredCaseId) || null}
        onDeploy={handleDeploy}
        onBack={() => setScreen(lobbyReturnScreen)}
        onTeamSave={handleTeamSave}
        onSkillLoadout={handleSkillLoadout}
        onAgentPurchase={handleAgentPurchase}
      />
    );
  } else if (screen === 'CASE_SELECT') {
    content = (
      <CaseSelect
        profile={profile}
        readOnly={isReadOnly}
        onSelect={requestCaseSelect}
        onPlan={caseId => openLobbyForCase(caseId, 'CASE_SELECT')}
        onBack={() => {
          setPreferredCaseId(null);
          setScreen('LOBBY');
        }}
        preferredCaseId={preferredCaseId}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<ScreenFallback />}>
        <div key={screen} hidden={screen === 'GAME'} className="td-screen-stage">{content}</div>
      </Suspense>
      {/* This stable sibling preserves the run while HOME or presentation settings change. */}
      <div {...(screen !== 'GAME' ? { inert: '' } : {})} hidden={screen !== 'GAME'} aria-hidden={screen !== 'GAME'} className="td-active-run">
        <Suspense fallback={<ScreenFallback />}>
          {selectedCase && (
            <InvestigationTerminal
              agentStrategy={agentStrategy}
              selectedCase={selectedCase}
              onSettlement={handleSettlement}
              presentationActive={screen === 'GAME'}
              narrativeBriefed={briefedRunRef.current}
              onOpenHome={handleOpenHome}
              onGameEnd={() => leaveRun('HOME')}
              onBackToLobby={() => leaveRun('LOBBY')}
            />
          )}
        </Suspense>
      </div>
      {entryNarrative && <NarrativeOverlay
        key={entryNarrative.kind === 'briefing' ? entryNarrative.caseData.case_id : 'prologue'}
        {...(entryNarrative.kind === 'briefing' ? caseBriefingNarrative(entryNarrative.caseData, lang) : worldNarrative(lang))}
        lang={lang} busy={narrativeBusy} error={narrativeError}
        onComplete={completeEntryNarrative} onCancel={cancelEntryNarrative}
      />}
      {showModeChooser && (
        <StoryModeChooser initialMode={settings.storyMode} onConfirm={handleConfirmMode}
          onCancel={handleCancelMode} busy={startBusy} error={startError} />
      )}
    </>
  );
}
