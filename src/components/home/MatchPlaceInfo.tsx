'use client';

import React from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { textLink } from '@/components/ui/buttons';
import type { MatchPlace } from '@/lib/utils/matchUtils';

/** Home → next match: where it is played, one line each (name, address, Google Maps, notes). */
export function MatchPlaceInfo({ place }: { place: MatchPlace }) {
  const t = useTranslations('home');
  return (
    <div className="flex items-start gap-2 min-w-0" aria-label={t('place')} role="group">
      <MapPin className="h-5 w-5 text-accent-text flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-base font-semibold text-primary break-words">{place.name}</p>
        {place.address && <p className="text-xs text-secondary break-words">{place.address}</p>}
        <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} pt-1`}>
          {t('openMaps')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        {place.notes && <p className="text-xs text-muted italic break-words pt-0.5">{place.notes}</p>}
      </div>
    </div>
  );
}
