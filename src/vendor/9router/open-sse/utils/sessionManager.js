import crypto from "node:crypto";

import { MEMORY_CONFIG } from "../config/runtimeConfig.js";

const runtimeSessionStore = new Map();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of runtimeSessionStore) {
    if (now - entry.lastUsed > MEMORY_CONFIG.sessionTtlMs) {
      runtimeSessionStore.delete(key);
    }
  }
}, MEMORY_CONFIG.sessionCleanupIntervalMs);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

export function generateBinaryStyleId() {
  return crypto.randomUUID() + Date.now().toString();
}

export function deriveSessionId(connectionId) {
  if (!connectionId) {
    return generateBinaryStyleId();
  }

  const existing = runtimeSessionStore.get(connectionId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.sessionId;
  }

  const MAX_SESSIONS = 1000;
  if (runtimeSessionStore.size >= MAX_SESSIONS) {
    const oldest = runtimeSessionStore.keys().next().value;
    runtimeSessionStore.delete(oldest);
  }

  const sessionId = generateBinaryStyleId();
  runtimeSessionStore.set(connectionId, { sessionId, lastUsed: Date.now() });
  return sessionId;
}

export function clearSessionStore() {
  runtimeSessionStore.clear();
}
