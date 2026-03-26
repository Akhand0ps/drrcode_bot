"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.setSession = setSession;
exports.addMessage = addMessage;
exports.resetSession = resetSession;
const sessions = new Map();
function getSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, { step: 'IDLE', chatHistory: [] });
    }
    return sessions.get(chatId);
}
function setSession(chatId, data) {
    const current = getSession(chatId);
    sessions.set(chatId, { ...current, ...data });
}
function addMessage(chatId, role, content) {
    const session = getSession(chatId);
    session.chatHistory.push({ role, content });
    // Keep last 20 messages only
    if (session.chatHistory.length > 20) {
        session.chatHistory = session.chatHistory.slice(-20);
    }
}
function resetSession(chatId) {
    sessions.set(chatId, { step: 'IDLE', chatHistory: [] });
}
