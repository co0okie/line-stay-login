export const HOST = 'line-chrome-gw.line-apps.com';
export const NAME = 'lct';
export const DAYS = 400;
const DAY = 86400;
const REFRESH_BELOW = 395 * DAY;

export function matches(cookie) {
  return cookie?.name === NAME && cookie.domain?.replace(/^\./, '') === HOST;
}

function key(cookie) {
  return JSON.stringify([cookie.storeId, cookie.domain, cookie.path,
    cookie.partitionKey?.topLevelSite ?? null,
    cookie.partitionKey?.hasCrossSiteAncestor ?? null]);
}

export function createRetainer(api, now = () => Date.now() / 1000) {
  const generations = new Map();
  let tail = Promise.resolve();

  function enqueue(work) {
    const result = tail.then(work);
    // A failed API call must not block subsequent login events.
    tail = result.catch(() => {});
    return result;
  }

  async function retain(observed, generation) {
    const cookieKey = key(observed);
    const query = {name: NAME, domain: HOST, storeId: observed.storeId};
    if (observed.partitionKey) query.partitionKey = observed.partitionKey;
    const currentCookies = await api.cookies.getAll(query);
    const current = currentCookies.find(c => matches(c) && key(c) === cookieKey);
    // Re-read Chrome's current state. Never restore a deleted or replaced cookie.
    if (!current || current.value !== observed.value ||
        (generations.get(cookieKey) ?? 0) !== generation) return false;
    if (!current.value || (!current.session && current.expirationDate <= now()))
      return false;
    if (!current.session && current.expirationDate - now() > REFRESH_BELOW)
      return false;

    const details = {
      url: `https://${HOST}${current.path}`,
      name: NAME, value: current.value, path: current.path,
      secure: current.secure, httpOnly: current.httpOnly,
      sameSite: current.sameSite, storeId: current.storeId,
      expirationDate: now() + DAYS * DAY,
    };
    if (!current.hostOnly) details.domain = current.domain;
    if (current.partitionKey) details.partitionKey = current.partitionKey;
    await api.cookies.set(details);
    return true;
  }

  function onChanged({cookie, removed}) {
    if (!matches(cookie)) return Promise.resolve(false);
    const cookieKey = key(cookie);
    const generation = (generations.get(cookieKey) ?? 0) + 1;
    generations.set(cookieKey, generation);
    // No retained copy, and no work on removal events (including logout).
    if (removed) return Promise.resolve(false);
    return enqueue(() => retain(cookie, generation));
  }

  function sweep() {
    return enqueue(async () => {
      const cookies = await api.cookies.getAll({name: NAME, domain: HOST});
      let updated = 0;
      for (const cookie of cookies.filter(matches)) {
        if (await retain(cookie, generations.get(key(cookie)) ?? 0)) updated++;
      }
      return {present: cookies.some(matches), updated};
    });
  }

  return {onChanged, sweep};
}
