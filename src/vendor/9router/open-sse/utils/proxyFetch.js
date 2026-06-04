let fetchImplementation = (...args) => globalThis.fetch(...args);

export function setProxyAwareFetchImplementation(nextFetch) {
  fetchImplementation = nextFetch ?? ((...args) => globalThis.fetch(...args));
}

export function resetProxyAwareFetchImplementation() {
  fetchImplementation = (...args) => globalThis.fetch(...args);
}

export async function proxyAwareFetch(url, options) {
  return fetchImplementation(url, options);
}
