import { DEFAULT_LANGUAGE, Language, SUPPORTED_LANGUAGES } from './messages';

/**
 * Picks the response language for a request from its `Accept-Language` header
 * (the web client sets it from the user's chosen UI language — see
 * apps/web/src/api/client.ts).
 *
 * Deliberately a small hand-rolled parser rather than full RFC 4647 matching:
 * this API supports exactly two languages, so ordering by q-value and taking
 * the first supported tag is all the header can usefully tell us. Anything
 * unrecognized falls back to Arabic, the product's primary language.
 */
export function resolveLanguage(acceptLanguage: string | undefined): Language {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...rest] = part.trim().split(';');
      const qParam = rest.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      // `ar-SA` and `en-GB` should match `ar`/`en` — only the primary subtag matters here.
      return { tag: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);

  const match = ranked.find((entry) => SUPPORTED_LANGUAGES.includes(entry.tag as Language));
  return (match?.tag as Language) ?? DEFAULT_LANGUAGE;
}
