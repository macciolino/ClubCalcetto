import { redirect } from 'next/navigation';

/** The admin panel now lives in Impostazioni: old links keep working. */
export default function AdminPage() {
  redirect('/impostazioni?sezione=partita');
}
