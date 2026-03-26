export type Step = 'IDLE' | 'WAITING_JD' | 'WAITING_CV' | 'CHATTING' | 'IMPROVING' | 'WAITING_MULTI_JD' | 'MULTI_JD_CHATTING';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  step: Step;
  jd?: string;
  multiJDs?: string[]; // For multi-role comparison
  cvText?: string;
  chatHistory: Message[];
  selectedJDIndex?: number; // For tracking which JD is being discussed
}

const sessions = new Map<number, Session>();

export function getSession(chatId: number): Session {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: 'IDLE', chatHistory: [] });
  }
  return sessions.get(chatId)!;
}

export function setSession(chatId: number, data: Partial<Session>) {
  const current = getSession(chatId);
  sessions.set(chatId, { ...current, ...data });
}

export function addMessage(chatId: number, role: 'user' | 'assistant', content: string) {
  const session = getSession(chatId);
  session.chatHistory.push({ role, content });
  // Keep last 20 messages only
  if (session.chatHistory.length > 20) {
    session.chatHistory = session.chatHistory.slice(-20);
  }
}

export function resetSession(chatId: number) {
  sessions.set(chatId, { step: 'IDLE', chatHistory: [] });
}