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
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';
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
  const t = useTranslations('login');
  const { locale } = useLocaleSetting();
  const labels = usePlayerLabels();
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
      setErrorMessage(t('expired'));
    }
    if (new URLSearchParams(window.location.search).get('signedout') === '1') {
      setSuccessMessage(t('signedOut'));
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
            setErrorMessage(t('inviteInvalid'));
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
            notify(t('guestClaimed', { name: res.guestName || '' }));
          } else if (res && !res.ok) notify(t('inviteInvalid2'));
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
      const msg = err instanceof Error ? err.message : t('googleError');
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
        setErrorMessage(t('unauthorizedDomain'));
      } else if (!msg.includes('popup-closed-by-user')) {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Requisiti della password (solo in registrazione)
  const passwordRules = [
    { label: t('rule8'), ok: [...password].length >= 8 },
    { label: t('ruleUpper'), ok: /\p{Lu}/u.test(password) },
    { label: t('ruleLower'), ok: /\p{Ll}/u.test(password) },
    { label: t('ruleNumber'), ok: /\p{N}/u.test(password) },
    { label: t('ruleSpecial'), ok: /[^\p{L}\p{N}\s]/u.test(password) }, // lettere accentate e spazi non contano
  ];
  const isSignup = authMode === 'signup';
  const fieldErrors: Record<string, string> = {};
  if (isSignup && !firstName.trim()) fieldErrors.firstName = t('errFirstName');
  if (isSignup && !lastName.trim()) fieldErrors.lastName = t('errLastName');
  if (!email.trim()) fieldErrors.email = t('errEmail');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fieldErrors.email = t('errEmailInvalid');
  if (!password) fieldErrors.password = t('errPassword');
  else if (isSignup && passwordRules.some((r) => !r.ok)) fieldErrors.password = t('errPasswordRules');
  if (isSignup && !confirmPassword) fieldErrors.confirmPassword = t('errRepeat');
  else if (isSignup && confirmPassword !== password) fieldErrors.confirmPassword = t('errMismatch');
  const showError = (field: string) => (submitted || touched[field]) && Boolean(fieldErrors[field]);
  const inputClass = (field: string, withIcon = true) =>
    `w-full ${withIcon ? 'pl-9' : 'pl-3'} pr-3 py-3 bg-app border rounded-xl text-primary text-sm placeholder:text-muted focus:outline-none transition-colors ${
      showError(field) ? 'border-rose-500 focus:border-rose-400' : 'border-line focus:border-accent'
    }`;
  const fieldError = (field: string) =>
    showError(field) ? (
      <p id={`${field}-error`} className="mt-1 text-xs text-danger">
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
      setErrorMessage(t('forgotNeedEmail'));
      return;
    }
    setResetBusy(true);
    try {
      firebaseAuth.languageCode = locale;
      await sendPasswordResetEmail(firebaseAuth, mail);
      setSuccessMessage(t('resetSent', { email: mail }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('auth/too-many-requests')) setErrorMessage(t('tooMany'));
      else if (msg.includes('auth/invalid-email')) setErrorMessage(t('emailInvalid'));
      // Utente inesistente: stesso messaggio di successo (non si rivela chi è registrato)
      else setSuccessMessage(t('resetSent', { email: mail }));
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
        setSuccessMessage(t('accountCreated'));
      }
    } catch (err: unknown) {
      console.error('Auth error:', err);
      const msg = err instanceof Error ? err.message : t('authError');
      if ((msg.includes('auth/email-already-in-use') || msg.includes('auth/user-disabled')) && (await checkReturn(email))) {
        // account chiuso che torna: schermata "Bentornato"
      } else if (msg.includes('auth/user-disabled')) {
        setErrorMessage(t('disabled'));
      } else if (msg.includes('auth/email-already-in-use')) {
        setErrorMessage(t('inUse'));
      } else if (msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found') || msg.includes('auth/invalid-credential')) {
        setErrorMessage(t('wrongCredentials'));
      } else if (msg.includes('auth/weak-password')) {
        setErrorMessage(t('weakPassword'));
      } else if (msg.includes('auth/operation-not-allowed')) {
        setErrorMessage(t('providerOff'));
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
        setErrorMessage(t('notVerified'));
      }
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendVerificationEmail();
      setSuccessMessage(t('verificationResent'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('sendError');
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
  const labelClass = 'block text-xs font-medium text-secondary mb-1.5';


  return (
    <div className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-app">
      <div className="relative min-h-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center px-4 sm:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in">
      {/* Lato sinistro (solo schermi grandi): un campo da calcio visto dall'alto, con le linee che si disegnano.
          Classe "dark": è un'illustrazione notturna, resta scura anche con il tema chiaro. */}
      <section className="dark hidden lg:block relative h-[calc(100dvh-3rem)] max-h-[880px] aspect-[2/3] justify-self-center rounded-3xl overflow-hidden border border-line bg-card">
        <PitchLines className="absolute inset-0 h-full w-full" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" aria-hidden="true" />

        {/* Marchio: al centro della metà campo superiore */}
        <div className="absolute inset-x-0 top-[25%] -translate-y-1/2 flex items-center justify-center gap-3 animate-in">
          <BrandLogo size="lg" />
          <span className="text-3xl font-bold tracking-tight text-primary">
            Club <span className="text-accent-text">Soccer</span>
          </span>
        </div>

        {/* Messaggio e punti forti: nella metà campo inferiore, centrati */}
        <div className="absolute inset-x-0 top-[52%] px-10 flex flex-col items-center text-center gap-4">
          <h2 className="text-3xl xl:text-[2.1rem] font-bold tracking-tight text-primary leading-tight">
            {t.rich('tagline', { accent: (c) => <span className="text-accent-text">{c}</span> })}
          </h2>
          <ul className="w-full max-w-sm space-y-2.5 text-left">
            {[
              { icon: CalendarCheck, title: t('f1Title'), text: t('f1Text') },
              { icon: Shuffle, title: t('f2Title'), text: t('f2Text') },
              { icon: BarChart3, title: t('f3Title'), text: t('f3Text') },
            ].map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.03] backdrop-blur-[2px] border border-white/[0.06] px-3.5 py-2.5"
              >
                <span className="flex-shrink-0 h-9 w-9 rounded-xl bg-accent/10 text-accent-text flex items-center justify-center">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-primary">{title}</span>
                  <span className="block text-xs text-secondary">{text}</span>
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
            <span className="text-2xl font-bold tracking-tight text-primary">
              Club <span className="text-accent-text">Soccer</span>
            </span>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              {returning
                ? returning.name
                  ? t('welcomeBackName', { name: returning.name })
                  : t('welcomeBackBang')
                : user && !isEmailVerified
                ? t('verifyTitle')
                : profile
                ? t('welcomeBack')
                : authMode === 'signin'
                ? t('welcomePitch')
                : t('joinClub')}
            </h1>
            <p className="text-sm text-secondary">
              {returning?.askEmail
                ? t('closedAccount')
                : returning
                ? t('foundProfile')
                : user && !isEmailVerified
                ? t('oneStep')
                : profile
                ? t('alreadyIn')
                : authMode === 'signin'
                ? t('signInHint')
                : t('signUpHint')}
            </p>
          </div>
        </div>

        {/* Link di invito valido: di chi è il profilo che si collega */}
        {mounted && inviteName && !returning && !profile && (
          <div className="flex items-start gap-3 rounded-2xl bg-accent/10 border border-accent/25 p-4 animate-in" role="status">
            <span className="flex-shrink-0 h-9 w-9 rounded-xl bg-accent/15 text-accent-text flex items-center justify-center">
              <Link2 className="h-[18px] w-[18px]" />
            </span>
            <p className="text-sm text-primary leading-relaxed">
              {t.rich('inviteBanner', { name: inviteName, b: (c) => <span className="font-semibold text-primary">{c}</span> })}
            </p>
          </div>
        )}

        {!mounted ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 text-accent-text animate-spin" />
            <p className="text-sm text-secondary">{t('loading')}</p>
          </div>
        ) : returning?.askEmail ? (
          /* Account chiuso con Google, email sconosciuta: la chiediamo per avvisare l'admin */
          <form
            className="bg-card border border-line rounded-2xl p-6 space-y-4 animate-in"
            onSubmit={async (e) => {
              e.preventDefault();
              setReturnError('');
              setReturnBusy(true);
              const ok = await checkReturn(returnEmail);
              setReturnBusy(false);
              if (!ok) setReturnError(t('noClosedAccount'));
            }}
          >
            <p className="text-sm text-secondary leading-relaxed">
              {t('returnHint')}
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="email"
                required
                autoComplete="email"
                value={returnEmail}
                onChange={(e) => setReturnEmail(e.target.value)}
                placeholder="nome@gmail.com"
                aria-label={t('returnEmailAria')}
                className="w-full pl-9 pr-3 py-3 bg-app border border-line rounded-xl text-primary text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </div>
            {returnError && <p className="text-xs text-danger">{returnError}</p>}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="submit" disabled={returnBusy || !returnEmail.trim()} className={`${btn.primary} sm:flex-1`}>
                {returnBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t('askReturn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturning(null);
                  setReturnError('');
                }}
                className={btn.secondary}
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        ) : returning ? (
          /* Account chiuso che torna: attesa ripristino, decide l'admin */
          <div className="bg-card border border-line rounded-2xl p-6 space-y-5 animate-in" role="status">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-10 w-10 rounded-full bg-accent/15 flex items-center justify-center">
                <Hourglass className="h-5 w-5 text-accent-text" />
              </span>
              <div className="space-y-2 text-sm leading-relaxed">
                <p className="text-primary">{t('adminConfiguring')}</p>
                <p className="text-secondary">
                  {t('nothingToDo')}
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
              {t('backToLogin')}
            </button>
          </div>
        ) : user && !isEmailVerified ? (
          /* STATO 1: EMAIL DA VERIFICARE */
          <div className="bg-card border border-line rounded-2xl p-6 space-y-5 animate-in">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Mail className="h-5 w-5 text-warning" />
              </span>
              <p className="text-sm text-secondary leading-relaxed">
                {t.rich('verifySent', { email: user.email || '', b: (c) => <span className="font-semibold text-primary break-all">{c}</span> })}
              </p>
            </div>

            {errorMessage && <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-danger">{errorMessage}</div>}
            {successMessage && <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent-text">{successMessage}</div>}

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCheckVerification}
                disabled={isCheckingVerification}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-accent hover:bg-accent/90 text-on-accent font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isCheckingVerification ? 'animate-spin' : ''}`} />
                {t('iVerified')}
              </button>
              <button
                type="button"
                onClick={handleResendVerification}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-line-strong text-primary hover:bg-card-hover font-semibold rounded-xl text-sm transition-colors"
              >
                <Send className="h-4 w-4" />
                {t('resend')}
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-secondary hover:text-primary text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t('otherAccount')}
              </button>
            </div>
          </div>
        ) : profile ? (
          /* STATO 2: GIÀ COLLEGATO */
          <div className="bg-card border border-line rounded-2xl p-6 space-y-5 animate-in">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex-shrink-0 h-11 w-11 rounded-full bg-accent/15 text-accent-text flex items-center justify-center text-sm font-bold">
                {profile.full_name
                  .trim()
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold text-primary truncate">{profile.full_name}</p>
                <p className="text-xs text-secondary">
                  {isStrictAdmin ? t('admin') : t('player')}
                  {profile.position ? ` · ${labels.position(profile.position)}` : ''}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Link
                href="/"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-accent hover:bg-accent/90 text-on-accent font-semibold rounded-xl text-sm transition-colors"
              >
                {t('goHome')} <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-secondary hover:text-danger text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t('signOut')}
              </button>
            </div>
          </div>
        ) : (
          /* STATO 3: ACCESSO / REGISTRAZIONE */
          <div className="space-y-5">
            {/* Accedi / Registrati */}
            <div className="flex bg-card border border-line p-1 rounded-xl text-sm" role="tablist" aria-label={t('accessAria')}>
              {(
                [
                  ['signin', t('tabSignIn')],
                  ['signup', t('tabSignUp')],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={authMode === mode}
                  onClick={() => switchMode(mode)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                    authMode === mode ? 'bg-line-strong text-primary' : 'text-secondary hover:text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {errorMessage && (
              <div role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-danger animate-in">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent-text animate-in">{successMessage}</div>
            )}

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-5 bg-white hover:bg-slate-100 text-slate-900 border border-line-strong font-semibold rounded-xl text-sm transition-colors active:scale-[0.99] disabled:opacity-60"
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
              {t('google')}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-line" />
              <span className="text-xs text-muted">{t('orEmail')}</span>
              <div className="flex-1 border-t border-line" />
            </div>

            <form onSubmit={handleEmailPasswordSubmit} noValidate className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="signup-first-name" className={labelClass}>
                        {t('firstName')}
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                          placeholder={t('firstNamePh')}
                          className={inputClass('firstName')}
                        />
                      </div>
                      {fieldError("firstName")}
                    </div>
                    <div>
                      <label htmlFor="signup-last-name" className={labelClass}>
                        {t('lastName')}
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                          placeholder={t('lastNamePh')}
                          className={inputClass('lastName')}
                        />
                      </div>
                      {fieldError("lastName")}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="signup-position" className={labelClass}>
                      {t('position')}
                    </label>
                    <select
                      id="signup-position"
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value as FieldPosition)}
                      className="w-full px-3 py-3 bg-app border border-line rounded-xl text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                    >
                      {FIELD_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {labels.position(pos)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted mt-1">{t('positionHint')}</p>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="auth-email" className={labelClass}>
                  {t('email')}
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                    placeholder={t('emailPh')}
                    className={inputClass('email')}
                  />
                </div>
                {fieldError("email")}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="auth-password" className={labelClass}>
                    {t('password')}
                  </label>
                  {!isSignup && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetBusy}
                      className="mb-1.5 text-xs font-semibold text-accent-text hover:text-accent-text disabled:opacity-50"
                    >
                      {resetBusy ? t('sending') : t('forgot')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                    placeholder={isSignup ? t('passwordNewPh') : t('passwordPh')}
                    className={inputClass('password')}
                  />
                </div>
                {fieldError("password")}
                {isSignup && (
                  <ul id="password-rules" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-label={t('rulesAria')}>
                    {passwordRules.map((r) => (
                      <li
                        key={r.label}
                        className={`text-xs flex items-center gap-1.5 ${
                          r.ok ? 'text-accent-text' : showError('password') ? 'text-danger' : 'text-muted'
                        }`}
                      >
                        <span aria-hidden="true">{r.ok ? '✓' : '•'}</span>
                        {r.label}
                        <span className="sr-only">{r.ok ? t('ruleOk') : t('ruleMissing')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {authMode === 'signup' && (
                <div>
                  <label htmlFor="auth-confirm-password" className={labelClass}>
                    {t('confirmPassword')}
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                      placeholder={t('confirmPh')}
                      className={inputClass('confirmPassword')}
                    />
                  </div>
                  {fieldError("confirmPassword")}
                  {confirmPassword && confirmPassword === password && (
                    <p className="mt-1 text-xs text-accent-text">{t('match')}</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-accent hover:bg-accent/90 text-on-accent font-semibold rounded-xl text-sm transition-colors active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : authMode === 'signin' ? t('submitSignIn') : t('submitSignUp')}
              </button>
              {isSignup && (
                <p className="text-xs text-muted text-center">{t('verifyNote')}</p>
              )}
            </form>

            <p className="text-sm text-secondary text-center">
              {authMode === 'signin' ? t('noAccount') : t('haveAccount')}
              <button
                type="button"
                onClick={() => switchMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="font-semibold text-accent-text hover:text-accent-text"
              >
                {authMode === 'signin' ? t('tabSignUp') : t('tabSignIn')}
              </button>
            </p>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
