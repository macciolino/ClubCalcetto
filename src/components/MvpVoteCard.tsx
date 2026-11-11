'use client';

import React, { useEffect, useState } from 'react';
import { MatchTeamPlayer, MvpVote } from '@/types/database';
import { castMvpVote, countMvpVotes, subscribeMvpVotes, setMvpVoteTest, clearMvpVotes } from '@/lib/firebase/firestoreService';
import { mvpVotingWindow } from '@/lib/utils/matchUtils';
import { formatItalianDate } from '@/lib/utils/dateUtils';
import { Star, Clock, Check, Loader2, FlaskConical, Trash2 } from 'lucide-react';

interface MvpVoteCardProps {
  date: string;
  matchTime: string;
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  /** Firebase uid of who is looking (null = not signed in) */
  voterUid: string | null;
  isAdmin?: boolean;
  /** Test mode saved on the teams of that day: 'admins' = only admins, 'all' = everyone can vote now */
  testMode?: 'admins' | 'all' | false;
}

const timeLabel = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** MVP of the day voted by everyone. Opens 45 minutes after the end of the match (start time + 1h45). */
export function MvpVoteCard({ date, matchTime, white, black, voterUid, isAdmin = false, testMode = false }: MvpVoteCardProps) {
  const [votes, setVotes] = useState<MvpVote[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setVotes([]);
    const unsub = subscribeMvpVotes(date, setVotes);
    return () => unsub();
  }, [date]);

  // Aggiorna l'orologio ogni 30 secondi: il voto si apre da solo all'orario giusto
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { opensAt, closesAt } = mvpVotingWindow(date, matchTime);
  const isTesting = testMode === 'all' || (isAdmin && testMode === 'admins');
  const isOpen = isTesting || (now >= opensAt && now < closesAt);
  const isClosed = !isTesting && now >= closesAt;
  const myVote = voterUid ? votes.find((v) => v.voter_id === voterUid)?.player_id : undefined;
  const tally = countMvpVotes(votes);
  const countOf = (id: string) => tally.find((t) => t.playerId === id)?.count || 0;
  const players = [...white, ...black];
  const leader = tally[0] ? players.find((p) => p.id === tally[0].playerId) : undefined;

  const changeTest = async (mode: 'admins' | 'all' | false) => {
    if (mode === 'all' && !confirm('Il voto di prova si apre ADESSO per tutti i giocatori. Ricordati di azzerare i voti alla fine. Continuare?')) return;
    try {
      await setMvpVoteTest(date, mode);
    } catch (err) {
      console.warn('[MVP] modalità test non aggiornata:', err);
      setError('Non è stato possibile cambiare la modalità test (servono le squadre salvate).');
    }
  };

  const handleClearVotes = async () => {
    if (!confirm(`Cancellare tutti i ${votes.length} voti MVP di questa partita?`)) return;
    try {
      await clearMvpVotes(date);
    } catch (err) {
      console.warn('[MVP] cancellazione voti non riuscita:', err);
      setError('Cancellazione dei voti non riuscita.');
    }
  };

  const handleVote = async (playerId: string) => {
    if (!voterUid || !isOpen) return;
    setSaving(playerId);
    setError('');
    try {
      await castMvpVote(date, voterUid, playerId);
    } catch (err) {
      console.warn('[MVP] voto non riuscito:', err);
      setError('Voto non registrato. Riprova.');
    } finally {
      setSaving(null);
    }
  };

  const opensLabel = `${formatItalianDate(toYmd(opensAt))} alle ${timeLabel(opensAt)}`;

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4" aria-labelledby="mvp-vote-title">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 id="mvp-vote-title" className="text-sm font-bold text-white flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" /> Vota l&apos;MVP della giornata
        </h3>
        <span className="text-xs font-mono text-slate-400">{votes.length} voti</span>
      </div>

      {isAdmin && (
        <div className={`rounded-2xl border p-3 space-y-2 ${testMode ? 'border-violet-400/50 bg-violet-500/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <p className="text-xs text-slate-300 flex items-start gap-1.5">
            <FlaskConical className="h-4 w-4 text-violet-300 flex-shrink-0" />
            {testMode === 'all'
              ? 'PROVA CON TUTTI attiva: ogni giocatore vede il voto aperto e può votare adesso. A fine prova premi "Termina prova" e poi "Azzera voti".'
              : testMode
              ? 'PROVA SOLO ADMIN attiva: solo gli amministratori vedono il voto aperto. I giocatori vedono il voto normale.'
              : 'Solo admin: puoi provare il voto prima della partita, solo tra admin oppure con tutti i giocatori.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {testMode !== 'admins' && (
              <button
                type="button"
                onClick={() => changeTest('admins')}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-400/50 text-violet-200 hover:bg-violet-500/20"
              >
                Prova solo admin
              </button>
            )}
            {testMode !== 'all' && (
              <button
                type="button"
                onClick={() => changeTest('all')}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-400/50 text-violet-200 hover:bg-violet-500/20"
              >
                Prova con tutti
              </button>
            )}
            {testMode && (
              <button
                type="button"
                onClick={() => changeTest(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Termina prova
              </button>
            )}
            {votes.length > 0 && (
              <button
                type="button"
                onClick={handleClearVotes}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/40 text-rose-300 hover:bg-rose-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" /> Azzera voti
              </button>
            )}
          </div>
        </div>
      )}

      {!isAdmin && testMode === 'all' && (
        <p className="text-xs text-violet-200 bg-violet-500/10 border border-violet-400/40 rounded-xl p-3 flex items-start gap-1.5">
          <FlaskConical className="h-4 w-4 flex-shrink-0" />
          Voto di PROVA: serve a controllare che tutto funzioni, i voti verranno cancellati.
        </p>
      )}

      {!isOpen && !isClosed && (
        <p className="text-sm text-slate-300 flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          Il voto si apre a fine partita: {opensLabel}.
        </p>
      )}

      {isClosed && (
        <p className="text-sm text-slate-300">
          Voto chiuso.{' '}
          {leader ? (
            <>
              Il più votato è <strong className="text-amber-300">{leader.name}</strong> ({tally[0].count} voti).
            </>
          ) : (
            'Nessun voto ricevuto.'
          )}
        </p>
      )}

      {isOpen && (
        <>
          <p className="text-xs text-slate-400">
            {voterUid
              ? myVote
                ? 'Hai votato. Puoi cambiare il voto fino alla chiusura.'
                : 'Tocca il giocatore che secondo te è stato il migliore in campo.'
              : 'Accedi per votare.'}{' '}
            Chiusura: {formatItalianDate(toYmd(closesAt))} alle {timeLabel(closesAt)}.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([['⚪ Bianchi', white], ['⚫ Neri', black]] as const).map(([title, list]) => (
              <div key={title} className="space-y-1.5">
                <div className="text-xs font-bold text-slate-300">{title}</div>
                {list.map((p) => {
                  const mine = myVote === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleVote(p.id)}
                      disabled={!voterUid || saving !== null}
                      aria-pressed={mine}
                      className={`w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm font-semibold transition-all disabled:opacity-70 ${
                        mine
                          ? 'border-amber-400 bg-amber-400/15 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      {saving === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      ) : mine ? (
                        <Check className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Star className="h-4 w-4 text-slate-600" />
                      )}
                      <span className="flex-1 truncate">{p.name}</span>
                      {countOf(p.id) > 0 && (
                        <span className="text-xs font-mono font-bold text-amber-300">{countOf(p.id)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
