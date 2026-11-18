import { notify } from '@/components/ui/Feedback';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';

/**
 * C7 — a save refused by Firestore (rules, connection) must not look like a success: the admin gets an error
 * message in the app language. Used by the services, outside React (language read from <html lang>).
 */
export function reportWriteError(err: unknown) {
  const msgs = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? en.saveErrors : it.saveErrors;
  const code = (err as { code?: string } | null)?.code || '';
  notify(code === 'permission-denied' ? msgs.denied : msgs.failed, 'error');
}
