import { assessProviderCommercialRights, type ProviderCommercialRightsAssessment } from './provider-commercial-rights';
import { evaluateProviderTrial, type ProviderTrialReport } from './provider-trial';

export type ProviderIntegrationDecision = {
  status: 'ready_for_controlled_integration' | 'blocked';
  providerId: string;
  trial: ProviderTrialReport;
  commercialRights: ProviderCommercialRightsAssessment;
  blockers: string[];
  recordReleaseRequiresPerObservationCommercialUseCheck: true;
  boundary: string;
};

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function assessProviderIntegrationDecision(
  trialInput: unknown,
  commercialRightsInput: unknown,
): ProviderIntegrationDecision {
  const trial = evaluateProviderTrial(trialInput);
  const commercialRights = assessProviderCommercialRights(commercialRightsInput);
  const blockers: string[] = [];

  if (!trial.evidenceComplete) {
    const failedChecks = trial.checks.filter((check) => !check.pass).map((check) => check.id);
    if (failedChecks.length) blockers.push(`provider trial evidence incomplete: ${failedChecks.join(', ')}`);
    if (trial.errors.length) blockers.push(`provider trial has ${trial.errors.length} validation error(s)`);
  }

  if (commercialRights.status !== 'ready') {
    if (commercialRights.validationErrors.length) {
      blockers.push(`commercial rights packet has ${commercialRights.validationErrors.length} validation error(s)`);
    }
    blockers.push(...commercialRights.blockers.map((blocker) => `commercial rights: ${blocker}`));
  }

  if (!nonEmpty(trial.providerId) || !nonEmpty(commercialRights.providerId)) {
    blockers.push('provider identity must be present in both trial and commercial-rights evidence');
  } else if (trial.providerId !== commercialRights.providerId) {
    blockers.push(`provider identity mismatch: trial=${trial.providerId} rights=${commercialRights.providerId}`);
  }

  return {
    status: blockers.length === 0 ? 'ready_for_controlled_integration' : 'blocked',
    providerId:
      nonEmpty(trial.providerId) && nonEmpty(commercialRights.providerId) && trial.providerId === commercialRights.providerId
        ? trial.providerId
        : '',
    trial,
    commercialRights,
    blockers: unique(blockers),
    recordReleaseRequiresPerObservationCommercialUseCheck: true,
    boundary:
      'This decision authorizes no observation for product exposure by itself. Each commercial observation must separately match a release-ready provider rights packet by provider and licenceTag.',
  };
}
