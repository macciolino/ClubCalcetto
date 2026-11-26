'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { BaseRadarStep } from '@/components/onboarding/BaseRadarStep';

/**
 * A NEW account (profile with `base_radar_pending`, set by the server at sign-up) sees the Radar Base step before
 * anything else: a league, an invite link (`/join/…`, which then opens), or the board. The sign-in page is not covered
 * (it has its own steps, e.g. confirming the email). The welcome screen of an account without a league shows the same step.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const pathname = usePathname() || '/';
  if (user && profile?.base_radar_pending === true && !pathname.startsWith('/login')) return <BaseRadarStep />;
  return <>{children}</>;
}
