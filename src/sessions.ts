export type Step = 'IDLE' | 'WAITING_JD' | 'WAITING_CV' | 'SCORED' | 'IMPROVING';

export interface Session {
  step: Step;
  jd?: string;
  cvText?: string;
}

const sessions = new Map<number, Session>();

export function getSession(chatId: number): Session {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: 'IDLE' });
  }
  return sessions.get(chatId)!;
}

export function setSession(chatId: number, data: Partial<Session>) {
  const current = getSession(chatId);
  sessions.set(chatId, { ...current, ...data });
}

export function resetSession(chatId: number) {
  sessions.set(chatId, { step: 'IDLE' });
}