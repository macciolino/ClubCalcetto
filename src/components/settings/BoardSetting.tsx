'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Megaphone } from 'lucide-react';
import { notify } from '@/components/ui/Feedback';
import { useBoardPrefs } from '@/lib/hooks/useBoardPrefs';
import { PreferenceRow, PreferenceSheet } from './PreferenceSheet';

type Choice = 'on' | 'off';

/**
 * Impostazioni → Tuo account → "Bacheca «Cerco giocatore»": Visibile / Nascosta. For who is not interested in the board:
 * it leaves the navigation, the Home card and the badge. Saved on the profile (follows the person on every device).
 */
export function BoardSetting() {
  const t = useTranslations('boardPref');
  const { off, setOff } = useBoardPrefs();
  const [open, setOpen] = useState(false);
  const current: Choice = off ? 'off' : 'on';

  const choose = (choice: Choice) => {
    setOpen(false);
    if (choice === current) return;
    setOff(choice === 'off');
    notify(t(choice === 'off' ? 'changedOff' : 'changedOn'));
  };

  return (
    <>
      <PreferenceRow icon={<Megaphone className="h-4 w-4" />} label={t('label')} value={t(current)} onClick={() => setOpen(true)} />
      {open && (
        <PreferenceSheet<Choice>
          title={t('title')}
          subtitle={t('subtitle')}
          value={current}
          activeLabel={t('active')}
          footnote={t('savedOnDevice')}
          onClose={() => setOpen(false)}
          onChoose={choose}
          options={[
            { id: 'on', label: t('on'), hint: t('onHint'), icon: <Eye className="h-5 w-5" /> },
            { id: 'off', label: t('off'), hint: t('offHint'), icon: <EyeOff className="h-5 w-5" /> },
          ]}
        />
      )}
    </>
  );
}
