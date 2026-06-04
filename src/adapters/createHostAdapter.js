function noop() {}

export function createHostAdapter(overrides = {}) {
  return {
    async getProviderCredentials() {
      return overrides.getProviderCredentials?.(...arguments) ?? null;
    },
    async refreshProviderCredentials() {
      return overrides.refreshProviderCredentials?.(...arguments) ?? null;
    },
    async emitTrace(event) {
      await overrides.emitTrace?.(event);
    },
    async emitUsage(event) {
      await overrides.emitUsage?.(event);
    },
    onLifecycleEvent: overrides.onLifecycleEvent ?? noop,
  };
}
