import {
  ERROR_RULES,
  BACKOFF_CONFIG,
  TRANSIENT_COOLDOWN_MS,
} from "../config/errorConfig.js";

export function getQuotaCooldown(backoffLevel = 0) {
  const level = Math.max(0, backoffLevel - 1);
  const cooldown = BACKOFF_CONFIG.base * Math.pow(2, level);
  return Math.min(cooldown, BACKOFF_CONFIG.max);
}

export function checkFallbackError(status, errorText, backoffLevel = 0) {
  const lowerError = errorText
    ? (typeof errorText === "string" ? errorText : JSON.stringify(errorText)).toLowerCase()
    : "";

  for (const rule of ERROR_RULES) {
    if (rule.text && lowerError && lowerError.includes(rule.text)) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return {
          shouldFallback: true,
          cooldownMs: getQuotaCooldown(newLevel),
          newBackoffLevel: newLevel,
        };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
    }

    if (rule.status && rule.status === status) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return {
          shouldFallback: true,
          cooldownMs: getQuotaCooldown(newLevel),
          newBackoffLevel: newLevel,
        };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
    }
  }

  return { shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS };
}

export function isAccountUnavailable(unavailableUntil) {
  if (!unavailableUntil) {
    return false;
  }
  return new Date(unavailableUntil).getTime() > Date.now();
}

export function getUnavailableUntil(cooldownMs) {
  return new Date(Date.now() + cooldownMs).toISOString();
}

export function filterAvailableAccounts(accounts, excludeId = null) {
  const now = Date.now();
  return accounts.filter((account) => {
    if (excludeId && account.id === excludeId) {
      return false;
    }
    if (account.rateLimitedUntil) {
      const until = new Date(account.rateLimitedUntil).getTime();
      if (until > now) {
        return false;
      }
    }
    return true;
  });
}
