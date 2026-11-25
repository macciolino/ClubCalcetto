'use client';

import { useTranslations } from 'next-intl';
import { isExternalId } from '@/lib/utils/externalPlayers';

/**
 * Discreet "Ospite" badge next to the name of a player from the "Cerco giocatore" board (id `ext-…`): they played
 * that match of this league without being a member. Renders nothing for anyone else.
 */
export function GuestBadge({ id }: { id: string }) {
  const t = useTranslations('common');
  if (!isExternalId(id)) return null;
  return (
    <span className="ml-1.5 inline-block shrink-0 rounded-full border border-line-strong px-1.5 py-px align-middle text-[10px] font-medium text-secondary">
      {t('guestPlayer')}
    </span>
  );
}
