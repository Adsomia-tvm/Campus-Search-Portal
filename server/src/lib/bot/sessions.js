/**
 * BOT SESSION MANAGER
 * In-memory conversation state. Each WhatsApp phone number gets a session.
 * Sessions expire after 30 minutes of inactivity.
 */

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

// Map<phoneNumber, { state, data, lastActive, history }>
const sessions = new Map();

function getSession(phone) {
  const s = sessions.get(phone);
  if (!s) return createSession(phone);
  if (Date.now() - s.lastActive > SESSION_TTL) {
    sessions.delete(phone);
    return createSession(phone);
  }
  s.lastActive = Date.now();
  return s;
}

function createSession(phone) {
  const s = {
    phone,
    state: 'MAIN_MENU',   // Current state in the flow
    step: 0,               // Sub-step within a flow
    data: {},              // Collected data (name, city, course, etc.)
    lastActive: Date.now(),
    history: [],           // Last 10 messages for context
  };
  sessions.set(phone, s);
  return s;
}

function updateSession(phone, updates) {
  const s = getSession(phone);
  Object.assign(s, updates, { lastActive: Date.now() });
  return s;
}

function resetSession(phone) {
  // Preserve conversation history across resets so AI has full context
  const old = sessions.get(phone);
  const history = old?.history || [];
  sessions.delete(phone);
  const s = createSession(phone);
  s.history = history;
  return s;
}

function addToHistory(phone, role, text) {
  const s = getSession(phone);
  s.history.push({ role, text, time: Date.now() });
  if (s.history.length > 20) s.history = s.history.slice(-20);
}

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, s] of sessions) {
    if (now - s.lastActive > SESSION_TTL) sessions.delete(phone);
  }
}, 10 * 60 * 1000);

module.exports = { getSession, createSession, updateSession, resetSession, addToHistory };
