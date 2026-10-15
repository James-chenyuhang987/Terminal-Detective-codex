import { getRejectedReportPenalty } from '../../src/game/caseEvaluation.js';

export const INVESTIGATION_BALANCE_REVISION = 2;
export const INVESTIGATION_COST_RULES = Object.freeze({
  unsuccessful_inspection_confusion: 3,
  unsuccessful_reconstruction_confusion: 3,
});

// Persisted investigations without this marker retain the prices and pacing
// they started with. In particular, reading a run never upgrades its rules.
export function investigationBalanceRevision(run) {
  return run.investigation_version === 2 && run.investigation?.balance_revision === INVESTIGATION_BALANCE_REVISION
    ? INVESTIGATION_BALANCE_REVISION : 1;
}

export function usesBalancedInvestigation(run) {
  return investigationBalanceRevision(run) === INVESTIGATION_BALANCE_REVISION;
}

export function investigationReportPolicy(run) {
  if (!usesBalancedInvestigation(run)) return null;
  const correctionAvailable = !run.investigation.evidence_correction_used;
  const correctionPenalty = { apLoss: run.state.action_points_left > 0 ? 1 : 0, reputationLoss: 8, confusionIncrease: 4 };
  return {
    balance_revision: INVESTIGATION_BALANCE_REVISION,
    evidence_correction_available: correctionAvailable,
    evidence_rejection_penalty: correctionAvailable
      ? { apLoss: 0, reputationLoss: 0, confusionIncrease: 0 }
      : correctionPenalty,
    evidence_rejection_penalty_after_correction: correctionPenalty,
    conclusion_rejection_penalty: getRejectedReportPenalty(run.state),
  };
}
