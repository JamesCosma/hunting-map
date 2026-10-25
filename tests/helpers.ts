/** Builds a fetch stub that answers by URL substring. Unmatched URLs reject like a network error. */
export type Route = [match: string, respond: () => Response | Promise<Response>];

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function stubFetch(routes: Route[]): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const impl = (input: RequestInfo | URL): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    const route = routes.find(([match]) => url.includes(match));
    if (route == null) return Promise.reject(new TypeError(`Failed to fetch ${url}`));
    return Promise.resolve(route[1]());
  };
  return Object.assign(impl, { calls });
}
