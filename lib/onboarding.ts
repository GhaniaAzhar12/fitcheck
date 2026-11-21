export const MIN_REPOS = 3;
export const MAX_REPOS = 6;

export type OnboardingStep = 1 | 2 | 3;

type ProfileLike = { cvText: string | null; repos: string[] } | null;

/** Onboarding is done once there is a CV and at least one evidence repo. */
export function isOnboarded(profile: ProfileLike): boolean {
  return Boolean(profile?.cvText && profile.repos.length > 0);
}

/** The first step that still needs doing. */
export function nextStep(profile: ProfileLike): OnboardingStep {
  if (!profile?.cvText) return 1;
  if (!profile.repos.length) return 2;
  return 3;
}

/** How many repos the user must pick, given how many they have. */
export function minReposFor(available: number): number {
  return Math.max(1, Math.min(MIN_REPOS, available));
}
