/** C11: dates a sign-up / withdrawal can still affect (Rome time): from yesterday to 30 days ahead. */
export function isReconcileDate(d: string, now = new Date()): boolean {
  const romeDay = (offsetDays: number) =>
    new Date(now.getTime() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  return d >= romeDay(-1) && d <= romeDay(30);
}
