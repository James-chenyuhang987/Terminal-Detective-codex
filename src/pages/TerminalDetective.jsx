import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import GameLanding from '@/components/game/GameLanding';
import DetectiveRegistration from '@/components/game/DetectiveRegistration';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { buildTeamConfig } from '@/game/teamConfig';
import { getActiveSupportAgentId, getSelectedCoreAgentIds } from '@/game/agentMarket';
import { useLang } from '@/lib/lang.jsx';
import { publicErrorMessage } from '@/lib/publicError.js';
import { createPlayerRunClient, runRecoveryMessage } from '@/game/playerRun';
import { cloudflareApi } from '@/api/cloudflareClient';
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
const SaveLibrary = lazy(() => import('@/components/game/SaveLibrary'));

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
  const { profile, activeRun, savedRuns = [], saveLibraryVersion = 0, saveLibraryLimit = 20, supportedInvestigationVersions = [1], command, refresh, loadProfile, settle, isReadOnly, account, sessionId } = useProfile();
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
  const [authoritativeRun, setAuthoritativeRun] = useState(null);
  const teamIntentRef = useRef(null);
  const [regBusy, setRegBusy] = useState(false);
  const registrationRef = useRef(false);
  const [regError, setRegError] = useState('');
  const [preferredCaseId, setPreferredCaseId] = useState(null);
  const [lobbyReturnScreen, setLobbyReturnScreen] = useState('HOME');
  const [lobbyPreviewRun, setLobbyPreviewRun] = useState(false);
  const [caseSelectReturnScreen, setCaseSelectReturnScreen] = useState('LOBBY');
  const [abandonRunBusy, setAbandonRunBusy] = useState(false);
  const abandonRunRef = useRef(false);
  const [abandonRunError, setAbandonRunError] = useState('');
  const [entryNarrative, setEntryNarrative] = useState(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeError, setNarrativeError] = useState('');
  const briefingRequestRef = useRef(null);
  const briefedRunRef = useRef(false);
  const entryReturnScreenRef = useRef('HOME');
  const multiSaveEnabled = saveLibraryVersion >= 1;
  const newSaveIntentRef = useRef(false);
  const [newSaveMode, setNewSaveMode] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [runOwner, setRunOwner] = useState(null);
  const [restoreEpoch, setRestoreEpoch] = useState(0);
  const ownerKey = account?.id || '';
  const navigationRef = useRef({ owner: ownerKey });
  // Replace the token during render, so late promises are invalid before effects run.
  if (navigationRef.current.owner !== ownerKey) navigationRef.current = { owner: ownerKey };
  const previousOwnerRef = useRef(ownerKey);

  useEffect(() => {
    if (previousOwnerRef.current === ownerKey) return;
    previousOwnerRef.current = ownerKey;
    entryRequestRef.current += 1;
    briefingRequestRef.current?.resolve({ error: 'cancelled' });
    briefingRequestRef.current = null;
    caseStartRef.current = false;
    startRef.current = false;
    registrationRef.current = false;
    abandonRunRef.current = false;
    newSaveIntentRef.current = false;
    teamIntentRef.current = null;
    briefedRunRef.current = false;
    setSelectedCase(null);
    setAuthoritativeRun(null);
    setRunOwner(null);
    setEntryNarrative(null);
    setShowModeChooser(false);
    setStartBusy(false);
    setRegBusy(false);
    setSaveBusy(false);
    setNarrativeBusy(false);
    setAbandonRunBusy(false);
    setSaveError('');
    setStartError('');
    setRegError('');
    setNewSaveMode(false);
    setScreen('LANDING');
  }, [ownerKey]);

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
    const navigation = navigationRef.current;
    updateSetting('storyMode', normalizeStoryMode(mode));
    setStartBusy(true);
    setStartError('');
    try {
      const current = profile || await loadProfile();
      if (requestId !== entryRequestRef.current || navigation !== navigationRef.current) return;
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
      newSaveIntentRef.current = true;
      setNewSaveMode(true);
      if (current.detective_name) await openCasesWithSavedTeam(null, current, true);
      else setScreen('REGISTRATION');
    } catch (cause) {
      if (requestId !== entryRequestRef.current || navigation !== navigationRef.current) return;
      setStartError(publicErrorMessage(cause, lang));
    } finally {
      if (requestId === entryRequestRef.current && navigation === navigationRef.current) {
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
    const navigation = navigationRef.current;
    try {
      const result = await command('identity', { patch: identity });
      if (navigation !== navigationRef.current) return;
      if (result?.error || result?.pending || !result?.profile?.detective_name) throw new Error('Identity was not persisted.');
      const verified = await refresh();
      if (navigation !== navigationRef.current) return;
      if (verified?.detective_name !== identity.detective_name) {
        throw new Error('Identity did not survive cloud verification.');
      }
      if (newSaveIntentRef.current) await openCasesWithSavedTeam(null, verified, true);
      else setScreen('HOME');
    } catch (cause) {
      if (navigation !== navigationRef.current) return;
      setRegError(cause?.code === 'UNAUTHENTICATED'
        ? (lang === 'en' ? 'Your session has expired. Sign in again before registering.' : '登录状态已失效，请重新登录后再注册。')
        : (lang === 'en' ? 'Your identity was not saved to the cloud. Your input is preserved; check the network and retry.' : '身份尚未写入云端，已保留当前输入，请检查网络后重试。'));
    } finally {
      if (navigation === navigationRef.current) {
        registrationRef.current = false;
        setRegBusy(false);
      }
    }
  };

  const handleDeploy = async (strategy, teamConfig) => {
    if (selectedCase && !(multiSaveEnabled && newSaveIntentRef.current)) {
      setScreen('GAME');
      return { error: null };
    }
    if (activeRun && !(multiSaveEnabled && newSaveIntentRef.current)) { resumeCloudRun(activeRun); return { run: activeRun }; }
    teamIntentRef.current = teamConfig;
    setAgentStrategy(strategy);
    if (preferredCaseId) {
      const targetCase = ALL_CASES.find(item => item.case_id === preferredCaseId);
      if (targetCase) return requestCaseSelect(targetCase);
    }
    void loadCaseSelect();
    if (lobbyReturnScreen !== 'CASE_SELECT') setCaseSelectReturnScreen('LOBBY');
    setScreen('CASE_SELECT');
    return { error: null };
  };

  const requireConfirmed = (result) => {
    if (!result?.profile || result.error || result.pending) {
      throw Object.assign(new Error('The server did not accept this action.'), {
        code: 'PROFILE_ACTION_REJECTED',
        feedbackCode: typeof result?.error === 'string' ? result.error.toUpperCase() : '',
        confirmed: Boolean(result?.profile && result.error && !result.pending),
      });
    }
    return result;
  };

  const handleTeamSave = async (teamConfig) => requireConfirmed(await command('save_team', { team_config: teamConfig }));

  const handleSkillLoadout = async (skillLoadout) => requireConfirmed(await command('skill_loadout', { skill_loadout: skillLoadout }));

  const handleAgentPurchase = async (agentId) => command('purchase_agent', { agent_id: agentId });

  const resumeCloudRun = (run) => {
    const caseData = ALL_CASES.find(item => item.case_id === (run?.case_id || run?.state?.case_id));
    if (!run?.id || !caseData) throw new Error('The cloud run is unavailable.');
    setRunOwner(account?.id || '');
    setRestoreEpoch(value => value + 1);
    newSaveIntentRef.current = false;
    setNewSaveMode(false);
    setAuthoritativeRun(run);
    setAgentStrategy(run.agent_strategy || run.team_config);
    setSelectedCase(caseData);
    setScreen('GAME');
  };

  const handleCaseSelect = async (caseData) => {
    const createSave = multiSaveEnabled && newSaveIntentRef.current;
    if (selectedCase && !createSave) {
      if (selectedCase.case_id !== caseData.case_id) return { error: 'active_run_exists' };
      setScreen('GAME');
      return { error: null };
    }
    if (caseStartRef.current) return { error: 'busy' };
    caseStartRef.current = true;
    const navigation = navigationRef.current;
    try {
      await loadInvestigationTerminal();
      if (navigation !== navigationRef.current) return { error: 'cancelled' };
      if (isReadOnly) return { error: 'readonly' };
      if (activeRun && !createSave) {
        if (activeRun.case_id !== caseData.case_id) return { error: 'active_run_exists' };
        resumeCloudRun(activeRun);
        return { run: activeRun };
      }
      if (createSave) await reconcileSelectedRun();
      if (navigation !== navigationRef.current) return { error: 'cancelled' };
      const teamConfig = teamIntentRef.current || profile?.saved_team_config;
      const result = await command('start_case', {
        case_id: caseData.case_id, ...(teamConfig ? { team_config: teamConfig } : {}),
        ...(supportedInvestigationVersions.includes(2) ? { investigation_version: 2 } : {}),
        ...(createSave ? { new_save: true } : {}),
      });
      if (navigation !== navigationRef.current) return { error: 'cancelled' };
      if (result?.pending || (createSave && result?.error)) return { ...result, error: result?.error || 'cloud_run_unavailable' };
      if (!result?.active_run) return { ...result, error: result?.error || 'cloud_run_unavailable' };
      if (result.active_run.case_id !== caseData.case_id) return { ...result, error: 'active_run_exists' };
      // A replayed start receipt may describe a save that is no longer selected.
      if (createSave && result.run?.id !== result.active_run.id) return { ...result, error: 'selection_changed' };
      resumeCloudRun(result.active_run);
      return { ...result, run: result.active_run, error: null };
    } finally {
      if (navigation === navigationRef.current) caseStartRef.current = false;
    }
  };

  const requestCaseSelect = (caseData) => {
    if (!(multiSaveEnabled && newSaveIntentRef.current)) {
      if ((selectedCase && selectedCase.case_id !== caseData.case_id)
        || (activeRun && activeRun.case_id !== caseData.case_id)) return Promise.resolve({ error: 'active_run_exists' });
      if (selectedCase) { setScreen('GAME'); return Promise.resolve({ error: null }); }
      if (activeRun) { resumeCloudRun(activeRun); return Promise.resolve({ run: activeRun }); }
    }
    if (briefingRequestRef.current || caseStartRef.current) return Promise.resolve({ error: 'busy' });
    briefedRunRef.current = false;
    entryReturnScreenRef.current = screen;
    if (settings.storyMode !== 'theater') return handleCaseSelect(caseData);
    setNarrativeError('');
    setEntryNarrative({ kind: 'briefing', caseData });
    return new Promise(resolve => {
      briefingRequestRef.current = { caseData, resolve, confirming: false };
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
    setScreen(entryReturnScreenRef.current || 'HOME');
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
    const navigation = navigationRef.current;
    setNarrativeBusy(true);
    setNarrativeError('');
    try {
      // Set before selecting the run: its stable owner consumes this only at initialization.
      briefedRunRef.current = true;
      const result = await handleCaseSelect(request.caseData);
      if (navigation !== navigationRef.current) return;
      if (result?.error) {
        briefedRunRef.current = false;
        setNarrativeError(lang === 'en' ? 'Unable to enter. Check your energy and profile sync, then retry or return home.' : '暂时无法进入，请检查体力与档案同步后重试，或返回主页。');
        return;
      }
      briefingRequestRef.current = null;
      setEntryNarrative(null);
      request.resolve(result);
    } catch (cause) {
      if (navigation !== navigationRef.current) return;
      briefedRunRef.current = false;
      setNarrativeError(publicErrorMessage(cause, lang));
    } finally {
      request.confirming = false;
      if (navigation === navigationRef.current) setNarrativeBusy(false);
    }
  };

  const handleHomeStartInvestigation = () => {
    if (multiSaveEnabled) { void openCasesWithSavedTeam(); return; }
    if (selectedCase) { setScreen('GAME'); return; }
    if (activeRun) { resumeCloudRun(activeRun); return; }
    entryReturnScreenRef.current = 'HOME';
    setNarrativeError('');
    setEntryNarrative({ kind: 'prologue' });
  };

  const handleSettlement = async (summary) => {
    return settle(summary);
  };

  const handleOpenHome = () => setScreen('HOME');
  const handleResume = () => {
    if (selectedCase) setScreen('GAME');
    else if (activeRun) resumeCloudRun(activeRun);
  };

  const reconcileSelectedRun = async () => {
    if (!activeRun?.id) return;
    // Share the run's Web Lock and durable receipt before switching its pointer.
    const client = createPlayerRunClient({ ownerUid: account?.id, runId: activeRun.id,
      sessionId, invoke: cloudflareApi.functions.invoke });
    await client.resume();
  };

  const refreshSaves = async () => {
    const navigation = navigationRef.current;
    setSaveBusy(true);
    setSaveError('');
    try { await (profile ? refresh() : loadProfile()); }
    catch (cause) { if (navigation === navigationRef.current) setSaveError(publicErrorMessage(cause, lang)); }
    finally { if (navigation === navigationRef.current) setSaveBusy(false); }
  };

  const openSaveLibrary = async () => {
    if (caseStartRef.current || startRef.current) return;
    setScreen('SAVES');
    await refreshSaves();
  };

  const resumeSavedRun = async (save) => {
    if (caseStartRef.current || isReadOnly || !multiSaveEnabled || !save?.id) return;
    const navigation = navigationRef.current;
    caseStartRef.current = true;
    setSaveBusy(true);
    setSaveError('');
    try {
      await loadInvestigationTerminal();
      if (navigation !== navigationRef.current) return;
      await reconcileSelectedRun();
      if (navigation !== navigationRef.current) return;
      const result = requireConfirmed(await command('resume_run', { run_id: save.id }));
      if (navigation !== navigationRef.current) return;
      if (result.active_run?.id !== save.id) throw Object.assign(new Error('Save selection changed.'), { code: 'RUN_NOT_SELECTED' });
      briefedRunRef.current = true;
      resumeCloudRun(result.active_run);
    } catch (cause) {
      if (navigation === navigationRef.current) setSaveError(cause?.confirmed || cause?.code === 'RUN_NOT_FOUND'
        ? publicErrorMessage(cause, lang) : runRecoveryMessage(cause, lang));
    } finally {
      if (navigation === navigationRef.current) {
        caseStartRef.current = false;
        setSaveBusy(false);
      }
    }
  };

  const abandonActiveRun = async () => {
    const run = activeRun || authoritativeRun;
    if (abandonRunRef.current || abandonRunBusy || !run?.id) return false;
    if (isReadOnly) {
      setAbandonRunError(lang === 'zh' ? '档案当前为只读状态，请先恢复同步后重试。' : 'The profile is read-only. Restore sync before trying again.');
      return false;
    }
    abandonRunRef.current = true;
    const navigation = navigationRef.current;
    setAbandonRunBusy(true);
    setAbandonRunError('');
    try {
      const client = createPlayerRunClient({
        ownerUid: account?.id,
        runId: run.id,
        sessionId,
        invoke: cloudflareApi.functions.invoke,
      });
      const resumed = await client.resume();
      if (navigation !== navigationRef.current) return false;
      if (resumed.run.status === 'active') {
        const response = await client.command({ type: 'abandon' });
        if (navigation !== navigationRef.current) return false;
        if (response?.run?.status !== 'abandoned') throw new Error('The active investigation was not ended.');
      }
      // Abandon ends gameplay, but the server's paid slot remains occupied
      // until settlement. Confirm its release before enabling another case.
      const result = requireConfirmed(await command('settle_case', { run_id: run.id }));
      if (navigation !== navigationRef.current) return false;
      if (result.active_run !== null) throw new Error('The cloud investigation slot is still occupied.');
      setSelectedCase(null);
      setAuthoritativeRun(null);
      teamIntentRef.current = null;
      briefedRunRef.current = false;
      return true;
    } catch (cause) {
      if (navigation === navigationRef.current) setAbandonRunError(publicErrorMessage(cause, lang));
      return false;
    } finally {
      if (navigation === navigationRef.current) {
        abandonRunRef.current = false;
        setAbandonRunBusy(false);
      }
    }
  };

  const openCaseSelection = () => {
    void openCasesWithSavedTeam();
  };

  const leaveRun = (nextScreen) => {
    setSelectedCase(null);
    setAuthoritativeRun(null);
    void refresh().catch(() => {});
    setPreferredCaseId(null);
    setScreen(nextScreen);
  };

  const openLobbyForCase = (caseId = null, returnScreen = 'HOME', options = {}) => {
    if (multiSaveEnabled && !options.previewActiveRun) {
      newSaveIntentRef.current = true;
      setNewSaveMode(true);
      void loadAgentLobby();
      setPreferredCaseId(caseId);
      setLobbyReturnScreen(returnScreen);
      setLobbyPreviewRun(false);
      setScreen('LOBBY');
      return;
    }
    const currentCaseId = selectedCase?.case_id || activeRun?.case_id;
    if (caseId && currentCaseId && caseId !== currentCaseId) {
      void openCasesWithSavedTeam(caseId);
      return;
    }
    if (selectedCase && !options.previewActiveRun) {
      setScreen('GAME');
      return;
    }
    if (activeRun && !options.previewActiveRun) { resumeCloudRun(activeRun); return; }
    void loadAgentLobby();
    setPreferredCaseId(caseId || (options.previewActiveRun ? activeRun?.case_id || null : null));
    setLobbyReturnScreen(returnScreen);
    setLobbyPreviewRun(Boolean(options.previewActiveRun && activeRun));
    setScreen('LOBBY');
  };

  const openCasesWithSavedTeam = async (caseId = null, currentProfile = profile, directStart = false) => {
    setAbandonRunError('');
    void loadCaseSelect();
    const saved = currentProfile?.saved_team_config;
    if (multiSaveEnabled || directStart) {
      if (!currentProfile?.detective_name) {
        newSaveIntentRef.current = true;
        setScreen('REGISTRATION');
        return;
      }
      newSaveIntentRef.current = true;
      setNewSaveMode(true);
      teamIntentRef.current = { ...(saved || { specs: [{}, {}, {}], primary_agent_index: 0 }), core_agent_ids: getSelectedCoreAgentIds(currentProfile) };
      setAgentStrategy(buildTeamConfig(teamIntentRef.current, teamIntentRef.current.primary_agent_index,
        currentProfile?.skill_loadout, getActiveSupportAgentId(currentProfile)));
      setPreferredCaseId(caseId);
      setLobbyReturnScreen('HOME');
      setCaseSelectReturnScreen('HOME');
      setScreen('CASE_SELECT');
      return;
    }
    if (!saved && !selectedCase && !activeRun) {
      openLobbyForCase(caseId);
      return;
    }
    if (!selectedCase && !activeRun && saved) {
      teamIntentRef.current = { ...saved, core_agent_ids: getSelectedCoreAgentIds(profile) };
      setAgentStrategy(buildTeamConfig(
        teamIntentRef.current,
        saved.primary_agent_index,
        profile?.skill_loadout,
        getActiveSupportAgentId(profile),
      ));
    }
    setPreferredCaseId(caseId);
    setLobbyReturnScreen('HOME');
    setCaseSelectReturnScreen('HOME');
    setScreen('CASE_SELECT');
  };

  let content;
  if (screen === 'LANDING') {
    content = <GameLanding busy={startBusy || saveBusy} error={startError} onStart={handleStart} onOpenSaves={openSaveLibrary} />;
  } else if (screen === 'SAVES') {
    content = <SaveLibrary saves={savedRuns} currentRunId={activeRun?.id} busy={saveBusy}
      error={saveError} supported={multiSaveEnabled} limit={saveLibraryLimit} readOnly={isReadOnly}
      onResume={resumeSavedRun} onRefresh={refreshSaves} onNewGame={() => openCasesWithSavedTeam()}
      onBack={() => setScreen(profile?.detective_name ? 'HOME' : 'LANDING')} />;
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
        onSelectCase={openCaseSelection}
        onStartInvestigation={multiSaveEnabled || settings.storyMode === 'theater' ? handleHomeStartInvestigation : null}
        onOpenSaves={openSaveLibrary}
        multiSaveAvailable={multiSaveEnabled}
        onRegister={() => setScreen('REGISTRATION')}
        suspendedCase={selectedCase || ALL_CASES.find(item => item.case_id === activeRun?.case_id)}
        onResume={multiSaveEnabled ? openSaveLibrary : handleResume}
      />
    );
  } else if (screen === 'LOBBY') {
    content = (
      <AgentLobby
        profile={lobbyPreviewRun && activeRun
          ? {
            ...profile,
            saved_team_config: activeRun.team_config || profile?.saved_team_config,
            skill_loadout: activeRun.skill_loadout || profile?.skill_loadout,
          }
          : profile}
        readOnly={isReadOnly || lobbyPreviewRun}
        previewActiveRun={lobbyPreviewRun}
        investigationVersion={lobbyPreviewRun ? activeRun?.investigation_version || 1 : 2}
        skillsRevision={lobbyPreviewRun ? activeRun?.investigation?.skills?.revision || 0 : 1}
        targetCase={ALL_CASES.find(item => item.case_id === preferredCaseId) || null}
        onDeploy={handleDeploy}
        onBack={() => { setLobbyPreviewRun(false); setScreen(lobbyReturnScreen); }}
        backLabel={lobbyReturnScreen === 'CASE_SELECT'
          ? (lang === 'zh' ? '案件选择' : 'CASE SELECT')
          : (lang === 'zh' ? '侦探之家' : 'HOME')}
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
          setScreen(caseSelectReturnScreen);
        }}
        onResume={handleResume}
        onAbandonRun={abandonActiveRun}
        abandonBusy={abandonRunBusy}
        abandonError={abandonRunError}
        activeRun={multiSaveEnabled && newSaveMode ? null : activeRun || (selectedCase ? authoritativeRun : null)}
        newSave={multiSaveEnabled && newSaveMode}
        onOpenSaves={openSaveLibrary}
        returnToHome={caseSelectReturnScreen === 'HOME'}
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
          {selectedCase && runOwner === ownerKey && (
            <InvestigationTerminal
              key={`${ownerKey}:${authoritativeRun?.id}:${restoreEpoch}`}
              agentStrategy={agentStrategy}
              authoritativeRun={authoritativeRun}
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
