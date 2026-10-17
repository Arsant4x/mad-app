import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

// File budget: a handful of in-memory refresh calls with millisecond delays, well under the default.
vi.setConfig({ testTimeout: 5_000 });

/**
 * One origin with one refresh cookie and a server that rotates it on every refresh and treats a token
 * presented twice as reuse, ending every session of the login (what the API does since refresh became single use).
 */
const server = vi.hoisted(() => {
  const state = {
    cookie: 'r1',
    next: 2,
    revoked: new Set<string>(),
    sessionEnded: false,
    calls: 0,
    inFlight: 0,
    maxInFlight: 0,
  };
  const adapter = async (config: InternalAxiosRequestConfig) => {
    if (!config.url?.endsWith('/auth/refresh')) throw new Error(`unexpected request ${config.url}`);
    state.calls += 1;
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    // The browser attaches the cookie it holds when the request leaves.
    const presented = state.cookie;
    await new Promise((resolve) => setTimeout(resolve, 5));
    state.inFlight -= 1;
    const reply = (status: number, data: unknown) => {
      const response = { data, status, statusText: String(status), headers: {}, config };
      if (status >= 400) throw Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response, config });
      return response;
    };
    if (state.sessionEnded || state.revoked.has(presented)) {
      state.sessionEnded = true;
      return reply(401, { message: 'session invalid' });
    }
    state.revoked.add(presented);
    const n = state.next++;
    state.cookie = `r${n}`;
    return reply(200, { accessToken: `a${n}`, user: { id: 'u1' } });
  };
  return { state, adapter };
});

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  actual.default.defaults.adapter = server.adapter as unknown as AxiosAdapter;
  return actual;
});

vi.mock('../i18n', () => ({ default: { language: 'ar' } }));

/** Each browser tab loads its own copy of the client module. */
async function openTab(): Promise<typeof import('./client')> {
  vi.resetModules();
  return import('./client');
}

type LockCallback<T> = (lock: { name: string } | null) => Promise<T> | T;

/** An exclusive lock manager shared by every tab of the origin, granting requests in order (with ifAvailable as in the browser). */
function sharedLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const held = new Set<string>();
  return {
    request<T>(name: string, optionsOrCallback: { ifAvailable?: boolean } | LockCallback<T>, maybeCallback?: LockCallback<T>): Promise<T> {
      const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
      const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as LockCallback<T>;
      if (options.ifAvailable && held.has(name)) return Promise.resolve().then(() => callback(null));
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(async () => {
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      });
      tails.set(name, run.catch(() => undefined));
      return run;
    },
  };
}

function setLocks(locks: unknown) {
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

describe('session refresh across tabs', () => {
  beforeEach(() => {
    Object.assign(server.state, { cookie: 'r1', next: 2, revoked: new Set<string>(), sessionEnded: false, calls: 0, inFlight: 0, maxInFlight: 0 });
  });
  afterEach(() => setLocks(undefined));

  it('two tabs refreshing at the same instant both stay signed in and never send the same token twice', async () => {
    setLocks(sharedLocks());
    const tabA = await openTab();
    const tabB = await openTab();

    const [a, b] = await Promise.all([tabA.refreshSession(), tabB.refreshSession()]);

    expect(server.state.sessionEnded).toBe(false);
    expect(server.state.maxInFlight).toBe(1);
    expect(a?.accessToken).toBeTruthy();
    expect(b?.accessToken).toBeTruthy();
  });

  it('without the lock API one tab still sends a single refresh for concurrent callers', async () => {
    setLocks(undefined);
    const tab = await openTab();

    const [a, b] = await Promise.all([tab.refreshSession(), tab.refreshSession()]);

    expect(server.state.calls).toBe(1);
    expect(a?.accessToken).toBe('a2');
    expect(b?.accessToken).toBe('a2');
  });

  it('a lock request that fails still refreshes the session', async () => {
    setLocks({ request: () => Promise.reject(new Error('locks unavailable')) });
    const tab = await openTab();

    const result = await tab.refreshSession();

    expect(server.state.calls).toBe(1);
    expect(result?.accessToken).toBe('a2');
  });
});
