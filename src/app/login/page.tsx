'use client';

import { markJustSignedIn } from '@/components/SplashScreen';
import { BrandLogo } from '@/components/BrandLogo';
import { PitchLines } from '@/components/PitchLines';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/config';
import { useAuth, savePendingInvite, takePendingInvite, afterRegistration, requestReturn } from '@/lib/context/AuthContext';
import { notify } from '@/components/ui/Feedback';
import { btn } from '@/components/ui/buttons';
import { FIELD_POSITIONS, FieldPosition } from '@/types/database';
import { 
  Loader2, 
  ArrowRight, 
  LogOut,
  Mail,
  Lock,
  User,
  Send,
  RefreshCw,
  CalendarCheck,
  Shuffle,
  BarChart3,
  Link2,
  Hourglass
} from 'lucide-react';

export default function LoginPage() {
  const {
    signInWithGoogle,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    sendVerificationEmail,
    checkEmailVerification,
    user,
    profile,
    isAdmin,
    isEmailVerified,
    signOut,
    refreshProfile,
  } = useAuth();
  // Link di invito per un ospite (/login?invite=…): nome dell'ospite per il banner
  const [inviteName, setInviteName] = useState('');
  // Account chiuso che prova a tornare: schermata "Bentornato", decide l'admin
  const [returning, setReturning] = useState<{ name?: string; askEmail?: boolean } | null>(null);
  const [returnEmail, setReturnEmail] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnBusy, setReturnBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const checkReturn = async (mail?: string | null) => {
    const r = await requestReturn(mail);
    if (r.pending) setReturning({ name: r.name });
    return r.pending;
  };

  const [mounted, setMounted] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Errori mostrati sotto i campi solo dopo il primo tentativo di invio (o quando si esce dal campo)
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));
  const [position, setPosition] = useState<FieldPosition>('Esterno');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  // Arrivo dal logout automatico (sessione di 30 giorni scaduta)
  // Il login occupa esattamente lo schermo: niente scroll della pagina sotto
  useEffect(() => {
    document.documentElement.classList.add('login-lock');
    return () => document.documentElement.classList.remove('login-lock');
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expired') === '1') {
      setErrorMessage('La sessione è scaduta (dura 30 giorni): accedi di nuovo con Google.');
    }
    if (new URLSearchParams(window.location.search).get('signedout') === '1') {
      setSuccessMessage('Sei uscito da tutti i dispositivi.');
    }
    if (new URLSearchParams(window.location.search).get('bentornato') === '1') setReturning({});
    const invite = new URLSearchParams(window.location.search).get('invite');
    if (invite) {
      fetch(`/api/invite?token=${encodeURIComponent(invite)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok) {
            setInviteName(String(d.name || ''));
            savePendingInvite(invite);
            setAuthMode('signup');
          } else {
            setErrorMessage('Questo link di invito non è più valido: chiedi un nuovo link all’amministratore.');
          }
        })
        .catch(() => undefined);
    }
  }, []);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Accesso fatto (e mail verificata, se serve): si va alla home
  const router = useRouter();
  useEffect(() => {
    if (mounted && user && profile && isEmailVerified) {
      // Già collegato e apre un link di invito: collega l'ospite a questo account
      const invite = takePendingInvite();
      if (invite) {
        afterRegistration(user, invite).then(async (res) => {
          if (res?.claimed) {
            await refreshProfile();
            notify(`Profilo di ${res.guestName} collegato: partite e statistiche sono tue.`);
          } else if (res && !res.ok) notify('Il link di invito non è più valido: chiedi un nuovo link all’amministratore.');
          router.replace('/');
        });
        return;
      }
      // L'animazione dopo il login la avvia il caricamento della Home (markJustSignedIn in AuthContext)
      router.replace('/');
    }
  }, [mounted, user, profile, isEmailVerified, router, refreshProfile]);

  const isStrictAdmin = Boolean(mounted && user && (profile?.role === 'admin' || isAdmin));

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error('Google login error:', err);
      const msg = err instanceof Error ? err.message : 'Errore durante il login con Google';
      if (msg.includes('auth/user-disabled')) {
        // Account chiuso: Google spesso non restituisce l'email; si prova dall'errore, altrimenti la si chiede
        let mail = (err as { customData?: { email?: string } }).customData?.email;
        if (!mail) {
          try {
            const idToken = GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0])?.idToken;
            if (idToken) mail = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email;
          } catch {
            /* ignore */
          }
        }
        if (!(await checkReturn(mail))) setReturning({ askEmail: true });
      } else if (msg.includes('auth/unauthorized-domain')) {
        setErrorMessage('Dominio non autorizzato su Firebase Console. Aggiungi localhost nelle impostazioni Auth.');
      } else if (!msg.includes('popup-closed-by-user')) {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Requisiti della password (solo in registrazione)
  const passwordRules = [
    { label: 'Almeno 8 caratteri', ok: [...password].length >= 8 },
    { label: 'Una lettera maiuscola', ok: /\p{Lu}/u.test(password) },
    { label: 'Una lettera minuscola', ok: /\p{Ll}/u.test(password) },
    { label: 'Un numero', ok: /\p{N}/u.test(password) },
    { label: 'Un carattere speciale (es. ! ? @ # $ %)', ok: /[^\p{L}\p{N}\s]/u.test(password) }, // lettere accentate e spazi non contano
  ];
  const isSignup = authMode === 'signup';
  const fieldErrors: Record<string, string> = {};
  if (isSignup && !firstName.trim()) fieldErrors.firstName = 'Il nome è obbligatorio.';
  if (isSignup && !lastName.trim()) fieldErrors.lastName = 'Il cognome è obbligatorio.';
  if (!email.trim()) fieldErrors.email = "L'email è obbligatoria.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fieldErrors.email = 'Inserisci un indirizzo email valido.';
  if (!password) fieldErrors.password = 'La password è obbligatoria.';
  else if (isSignup && passwordRules.some((r) => !r.ok)) fieldErrors.password = 'La password non rispetta tutti i requisiti.';
  if (isSignup && !confirmPassword) fieldErrors.confirmPassword = 'Ripeti la password.';
  else if (isSignup && confirmPassword !== password) fieldErrors.confirmPassword = 'Le password non coincidono.';
  const showError = (field: string) => (submitted || touched[field]) && Boolean(fieldErrors[field]);
  const inputClass = (field: string, withIcon = true) =>
    `w-full ${withIcon ? 'pl-9' : 'pl-3'} pr-3 py-3 bg-slate-950 border rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none transition-colors ${
      showError(field) ? 'border-rose-500 focus:border-rose-400' : 'border-slate-800 focus:border-emerald-500'
    }`;
  const fieldError = (field: string) =>
    showError(field) ? (
      <p id={`${field}-error`} className="mt-1 text-xs text-rose-400">
        {fieldErrors[field]}
      </p>
    ) : null;

  // Password dimenticata: Firebase manda una mail con il link per sceglierne una nuova
  const handleForgotPassword = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      touch('email');
      setErrorMessage('Scrivi la tua email qui sopra, poi tocca "Password dimenticata?".');
      return;
    }
    setResetBusy(true);
    try {
      firebaseAuth.languageCode = 'it';
      await sendPasswordResetEmail(firebaseAuth, mail);
      setSuccessMessage(`Se ${mail} è registrata, ti abbiamo inviato un link per scegliere una nuova password. Controlla anche lo spam.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('auth/too-many-requests')) setErrorMessage('Troppi tentativi: riprova tra qualche minuto.');
      else if (msg.includes('auth/invalid-email')) setErrorMessage("L'email non è valida.");
      // Utente inesistente: stesso messaggio di successo (non si rivela chi è registrato)
      else setSuccessMessage(`Se ${mail} è registrata, ti abbiamo inviato un link per scegliere una nuova password. Controlla anche lo spam.`);
    } finally {
      setResetBusy(false);
    }
  };

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setSubmitted(true);
    if (Object.keys(fieldErrors).length > 0) return;

    setIsLoading(true);
    try {
      if (authMode === 'signin') {
        await signInWithEmailPassword(email, password);
      } else {
        await signUpWithEmailPassword(email, password, firstName, lastName, position);
        setSuccessMessage('Account creato con successo! Ti abbiamo inviato una mail di verifica.');
      }
    } catch (err: unknown) {
      console.error('Auth error:', err);
      const msg = err instanceof Error ? err.message : 'Errore durante l\'autenticazione';
      if ((msg.includes('auth/email-already-in-use') || msg.includes('auth/user-disabled')) && (await checkReturn(email))) {
        // account chiuso che torna: schermata "Bentornato"
      } else if (msg.includes('auth/user-disabled')) {
        setErrorMessage('Questo account è stato disattivato. Per riattivarlo contatta l’amministratore del club.');
      } else if (msg.includes('auth/email-already-in-use')) {
        setErrorMessage('Questa email è già registrata. Effettua l\'accesso.');
      } else if (msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found') || msg.includes('auth/invalid-credential')) {
        setErrorMessage('Email o password non corretti.');
      } else if (msg.includes('auth/weak-password')) {
        setErrorMessage('Password troppo debole: rispetta tutti i requisiti indicati.');
      } else if (msg.includes('auth/operation-not-allowed')) {
        setErrorMessage(
          'Il provider Email/Password non è ancora abilitato nella console Firebase (Authentication > Sign-in method > Email/Password > Abilita).'
        );
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsCheckingVerification(true);
    setErrorMessage('');
    try {
      const verified = await checkEmailVerification();
      if (verified) {
        markJustSignedIn();
      window.location.href = '/';
      } else {
        setErrorMessage('L\'email non risulta ancora verificata. Clicca sul link che hai ricevuto via email.');
      }
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendVerificationEmail();
      setSuccessMessage('Email di verifica inviata di nuovo! Controlla la posta.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore invio';
      setErrorMessage(msg);
    }
  };

  const switchMode = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setSubmitted(false);
    setTouched({});
    setErrorMessage('');
    setSuccessMessage('');
  };
  const labelClass = 'block text-xs font-medium text-slate-300 mb-1.5';


  return (
    <div className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-slate-950">
      <div className="relative min-h-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center px-4 sm:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in">
      {/* Lato sinistro (solo schermi grandi): un campo da calcio visto dall'alto, con le linee che si disegnano */}
      <section className="hidden lg:block relative h-[calc(100dvh-3rem)] max-h-[880px] aspect-[2/3] justify-self-center rounded-3xl overflow-hidden border border-slate-800 bg-slate-900">
        <PitchLines className="absolute inset-0 h-full w-full" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" aria-hidden="true" />

        {/* Marchio: al centro della metà campo superiore */}
        <div className="absolute inset-x-0 top-[25%] -translate-y-1/2 flex items-center justify-center gap-3 animate-in">
          <BrandLogo size="lg" />
          <span className="text-3xl font-bold tracking-tight text-white">
            Club <span className="text-emerald-400">Soccer</span>
          </span>
        </div>

        {/* Messaggio e punti forti: nella metà campo inferiore, centrati */}
        <div className="absolute inset-x-0 top-[52%] px-10 flex flex-col items-center text-center gap-4">
          <h2 className="text-3xl xl:text-[2.1rem] font-bold tracking-tight text-white leading-tight">
            Il tuo calcetto, <span className="text-emerald-400">senza chat infinite.</span>
          </h2>
          <ul className="w-full max-w-sm space-y-2.5 text-left">
            {[
              { icon: CalendarCheck, title: 'Presenze', text: 'I primi 10 che ci sono giocano.' },
              { icon: Shuffle, title: 'Squadre equilibrate', text: 'Bianchi contro Neri, divisi bene.' },
              { icon: BarChart3, title: 'Statistiche', text: 'Gol, MVP, vittorie e forma.' },
            ].map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.03] backdrop-blur-[2px] border border-white/[0.06] px-3.5 py-2.5"
              >
                <span className="flex-shrink-0 h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Lato destro: accesso */}
      <section className="w-full max-w-md mx-auto space-y-8">
        {/* Logo e titolo (su telefono e tablet; su PC sono nel pannello a sinistra) */}
        <div className="text-center space-y-3 lg:text-left">
          <div className="inline-flex lg:hidden items-center gap-3 pb-3">
            <BrandLogo size="lg" />
            <span className="text-2xl font-bold tracking-tight text-white">
              Club <span className="text-emerald-400">Soccer</span>
            </span>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {returning
                ? `Bentornato${returning.name ? ` ${returning.name}` : ''}!`
                : user && !isEmailVerified
                ? 'Verifica la tua email'
                : profile
                ? 'Bentornato'
                : authMode === 'signin'
                ? 'Bentornato in campo'
                : 'Entra nel club'}
            </h1>
            <p className="text-sm text-slate-400">
              {returning?.askEmail
                ? 'Il tuo account era stato chiuso.'
                : returning
                ? 'Abbiamo rilevato un tuo profilo precedente.'
                : user && !isEmailVerified
                ? 'Manca solo un passaggio.'
                : profile
                ? 'Sei già collegato.'
                : authMode === 'signin'
                ? 'Accedi per segnare la tua presenza.'
                : 'Crea il tuo account in un minuto.'}
            </p>
          </div>
        </div>

        {/* Link di invito valido: di chi è il profilo che si collega */}
        {mounted && inviteName && !returning && !profile && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4 animate-in" role="status">
            <span className="flex-shrink-0 h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
              <Link2 className="h-[18px] w-[18px]" />
            </span>
            <p className="text-sm text-slate-200 leading-relaxed">
              Stai collegando il tuo account al profilo di <span className="font-semibold text-white">{inviteName}</span>: le tue partite e
              statistiche verranno mantenute.
            </p>
          </div>
        )}

        {!mounted ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 text-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400">Caricamento…</p>
          </div>
        ) : returning?.askEmail ? (
          /* Account chiuso con Google, email sconosciuta: la chiediamo per avvisare l'admin */
          <form
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 animate-in"
            onSubmit={async (e) => {
              e.preventDefault();
              setReturnError('');
              setReturnBusy(true);
              const ok = await checkReturn(returnEmail);
              setReturnBusy(false);
              if (!ok) setReturnError('Non troviamo un account chiuso con questa email. Controllala o contatta l’amministratore del club.');
            }}
          >
            <p className="text-sm text-slate-300 leading-relaxed">
              Scrivi l&apos;email con cui accedevi: avvisiamo l&apos;amministratore, che configura il tuo rientro.
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                autoComplete="email"
                value={returnEmail}
                onChange={(e) => setReturnEmail(e.target.value)}
                placeholder="nome@gmail.com"
                aria-label="Email dell'account"
                className="w-full pl-9 pr-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {returnError && <p className="text-xs text-rose-400">{returnError}</p>}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="submit" disabled={returnBusy || !returnEmail.trim()} className={`${btn.primary} sm:flex-1`}>
                {returnBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Chiedi il rientro
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturning(null);
                  setReturnError('');
                }}
                className={btn.secondary}
              >
                Annulla
              </button>
            </div>
          </form>
        ) : returning ? (
          /* Account chiuso che torna: attesa ripristino, decide l'admin */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 animate-in" role="status">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Hourglass className="h-5 w-5 text-emerald-400" />
              </span>
              <div className="space-y-2 text-sm leading-relaxed">
                <p className="text-slate-200">L&apos;amministratore del gruppo sta configurando il tuo rientro.</p>
                <p className="text-slate-400">
                  Non devi fare altro: appena conferma, entri con il tuo solito account (Google o email e password).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setReturning(null);
                setErrorMessage('');
                router.replace('/login');
              }}
              className={`${btn.secondary} sm:w-full`}
            >
              Torna all&apos;accesso
            </button>
          </div>
        ) : user && !isEmailVerified ? (
          /* STATO 1: EMAIL DA VERIFICARE */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 animate-in">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Mail className="h-5 w-5 text-amber-400" />
              </span>
              <p className="text-sm text-slate-300 leading-relaxed">
                Ti abbiamo inviato un link a <span className="font-semibold text-white break-all">{user.email}</span>. Aprilo per
                attivare l&apos;account, poi torna qui.
              </p>
            </div>

            {errorMessage && <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div>}
            {successMessage && <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMessage}</div>}

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCheckVerification}
                disabled={isCheckingVerification}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isCheckingVerification ? 'animate-spin' : ''}`} />
                Ho verificato l&apos;email
              </button>
              <button
                type="button"
                onClick={handleResendVerification}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-700 text-slate-200 hover:bg-slate-800 font-semibold rounded-xl text-sm transition-colors"
              >
                <Send className="h-4 w-4" />
                Reinvia l&apos;email
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-slate-400 hover:text-white text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Usa un altro account
              </button>
            </div>
          </div>
        ) : profile ? (
          /* STATO 2: GIÀ COLLEGATO */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 animate-in">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex-shrink-0 h-11 w-11 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-sm font-bold">
                {profile.full_name
                  .trim()
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold text-white truncate">{profile.full_name}</p>
                <p className="text-xs text-slate-400">
                  {isStrictAdmin ? 'Amministratore' : 'Giocatore'}
                  {profile.position ? ` · ${profile.position}` : ''}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Link
                href="/"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors"
              >
                Vai alla Home <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-slate-400 hover:text-rose-300 text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Esci
              </button>
            </div>
          </div>
        ) : (
          /* STATO 3: ACCESSO / REGISTRAZIONE */
          <div className="space-y-5">
            {/* Accedi / Registrati */}
            <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl text-sm" role="tablist" aria-label="Accesso">
              {(
                [
                  ['signin', 'Accedi'],
                  ['signup', 'Registrati'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={authMode === mode}
                  onClick={() => switchMode(mode)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                    authMode === mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {errorMessage && (
              <div role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 animate-in">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 animate-in">{successMessage}</div>
            )}

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-5 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl text-sm transition-colors active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              Continua con Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-slate-800" />
              <span className="text-xs text-slate-500">oppure con email</span>
              <div className="flex-1 border-t border-slate-800" />
            </div>

            <form onSubmit={handleEmailPasswordSubmit} noValidate className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="signup-first-name" className={labelClass}>
                        Nome
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          id="signup-first-name"
                          type="text"
                          required
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          onBlur={() => touch('firstName')}
                          aria-invalid={showError('firstName')}
                          aria-describedby={showError('firstName') ? 'firstName-error' : undefined}
                          placeholder="Mario"
                          className={inputClass('firstName')}
                        />
                      </div>
                      {fieldError("firstName")}
                    </div>
                    <div>
                      <label htmlFor="signup-last-name" className={labelClass}>
                        Cognome
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          id="signup-last-name"
                          type="text"
                          required
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          onBlur={() => touch('lastName')}
                          aria-invalid={showError('lastName')}
                          aria-describedby={showError('lastName') ? 'lastName-error' : undefined}
                          placeholder="Rossi"
                          className={inputClass('lastName')}
                        />
                      </div>
                      {fieldError("lastName")}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="signup-position" className={labelClass}>
                      Ruolo in campo
                    </label>
                    <select
                      id="signup-position"
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value as FieldPosition)}
                      className="w-full px-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    >
                      {FIELD_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Serve per comporre squadre equilibrate. Puoi cambiarlo dopo.</p>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="auth-email" className={labelClass}>
                  Email
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => touch('email')}
                    aria-invalid={showError('email')}
                    aria-describedby={showError('email') ? 'email-error' : undefined}
                    placeholder="nome@esempio.it"
                    className={inputClass('email')}
                  />
                </div>
                {fieldError("email")}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="auth-password" className={labelClass}>
                    Password
                  </label>
                  {!isSignup && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetBusy}
                      className="mb-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                    >
                      {resetBusy ? 'Invio…' : 'Password dimenticata?'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="auth-password"
                    type="password"
                    required
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => touch('password')}
                    aria-invalid={showError('password')}
                    aria-describedby={isSignup ? 'password-rules' : showError('password') ? 'password-error' : undefined}
                    placeholder={isSignup ? 'Crea una password sicura' : 'La tua password'}
                    className={inputClass('password')}
                  />
                </div>
                {fieldError("password")}
                {isSignup && (
                  <ul id="password-rules" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Requisiti della password">
                    {passwordRules.map((r) => (
                      <li
                        key={r.label}
                        className={`text-xs flex items-center gap-1.5 ${
                          r.ok ? 'text-emerald-400' : showError('password') ? 'text-rose-400' : 'text-slate-500'
                        }`}
                      >
                        <span aria-hidden="true">{r.ok ? '✓' : '•'}</span>
                        {r.label}
                        <span className="sr-only">{r.ok ? ' (rispettato)' : ' (mancante)'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {authMode === 'signup' && (
                <div>
                  <label htmlFor="auth-confirm-password" className={labelClass}>
                    Conferma password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="auth-confirm-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => touch('confirmPassword')}
                      aria-invalid={showError('confirmPassword')}
                      aria-describedby={showError('confirmPassword') ? 'confirmPassword-error' : undefined}
                      placeholder="Ripeti la password"
                      className={inputClass('confirmPassword')}
                    />
                  </div>
                  {fieldError("confirmPassword")}
                  {confirmPassword && confirmPassword === password && (
                    <p className="mt-1 text-xs text-emerald-400">✓ Le password coincidono</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : authMode === 'signin' ? 'Login' : 'Registrati'}
              </button>
              {isSignup && (
                <p className="text-xs text-slate-500 text-center">Ti invieremo un&apos;email per confermare l&apos;indirizzo.</p>
              )}
            </form>

            <p className="text-sm text-slate-400 text-center">
              {authMode === 'signin' ? 'Non hai un account? ' : 'Hai già un account? '}
              <button
                type="button"
                onClick={() => switchMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="font-semibold text-emerald-300 hover:text-emerald-200"
              >
                {authMode === 'signin' ? 'Registrati' : 'Accedi'}
              </button>
            </p>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
