# Search exclusion and private page addresses

Nothing in this project is meant to be found by a search engine. The portal is
staff-only, client selection pages are private links, and the 2027 Atlas is
shared deliberately rather than searched for. This is how that is enforced,
and how to check each part of it.

Written 16 September 2026.

## 1. What now applies, and where

| Layer | Value | Applies to |
|---|---|---|
| `X-Robots-Tag` header | `noindex, nofollow, noarchive, nosnippet, noimageindex` | **Every response from the project**, on every hostname |
| `Referrer-Policy` header | `no-referrer` | Every response, same coverage |
| `<meta name="robots">` | `noindex, nofollow` | Every HTML page, inherited from the root layout |
| `/robots.txt` | `User-Agent: *` + `Allow: /` | The crawler's first request |
| Sitemap | none, by design | — |

Both headers come from one catch-all rule in `next.config.ts`:

```ts
{ source: "/:path*", headers: NOINDEX_HEADERS }
```

`/:path*` matches the root and every path below it. Verified on a production
build: HTML pages, API JSON, 404s, redirects, images and fonts in `public/`,
`public/geo/countries-110m.json`, and hashed `/_next/static/*` chunks all
carry both headers. This is why the rule lives in `next.config.ts` rather than
in middleware: it is applied at the edge for every path with no per-request
invocation, and none of the usual middleware matchers exclude static assets.

**Hostnames.** The rule is build configuration, so it rides on every
deployment of this project without naming a host: the custom domains
(including `retail-charter.ocyachts.com`), the project's own
`charter-campaign-q4.vercel.app`, and every preview deployment. Vercel already
adds its own `noindex` to deployment-specific preview URLs, but not to the
production `.vercel.app` domain — which is exactly the gap this closes.

**Why `Allow: /` and not `Disallow: /`.** A crawler has to fetch a page to
read the header or the meta tag that excludes it. `Disallow: /` would block
the fetch, so the directives would never be read, and a URL someone linked to
could still be listed with no description. Allowing the fetch is what makes
the exclusion stick.

**Link previews are unaffected.** The Open Graph and Twitter cards on
`/2027-charter-season` are untouched. Unfurlers (WhatsApp, Slack, iMessage,
LinkedIn) read those cards and do not honour robots directives, and
`robots.txt` allows them to fetch.

## 2. Verifying in the Network tab

Open DevTools, tick **Disable cache**, and read **Response Headers** on each
request. Every one of these should show
`x-robots-tag: noindex, nofollow, noarchive, nosnippet, noimageindex` and
`referrer-policy: no-referrer`.

| Check | Request to look at | Expected |
|---|---|---|
| A client page | `/destinations/<slug>` or `/selection/<slug>`, the top document | Both headers; also `cache-control: private, no-store` |
| The public Atlas | `/2027-charter-season`, the top document | Both headers |
| The portal | `/portal` | Both headers (on the 307 to sign-in as well) |
| An API response | `/api/fleet` in the XHR/Fetch filter | Both headers on JSON |
| An image | any file under `/assets/` in the Img filter | Both headers — this is what `noimageindex` needs |
| A font | any `/fonts/*.ttf` | Both headers |
| A build chunk | any `/_next/static/**.js` | Both headers |
| A 404 | any address that does not exist | Both headers |
| Robots | `/robots.txt` | Body is `User-Agent: *` then `Allow: /`, nothing else |
| Sitemap | `/sitemap.xml` | 404 |

In the **Elements** panel, every page should carry
`<meta name="robots" content="noindex, nofollow">` in `<head>`.

From a terminal, the same check in one line:

```
curl -sS -o /dev/null -D - https://<host>/assets/logo-white.png | grep -i "robots\|referrer"
```

## 3. Private page addresses

A published client page has no sign-in: whoever holds the URL sees the
client's name, their itinerary and their rates. Addresses used to be derived
from the client's surname and the season alone (`harrington-summer-2027`),
which a script could guess from a list of common surnames.

Every **new** address now carries a random eight-character tail, drawn with
`crypto.randomInt` from a 28-character alphabet with no vowels and no
easily-misread characters:

```
/destinations/harrington-summer-2027-ck9qhhn4
```

That is about 3.8 × 10^11 possibilities, which cannot be walked. The tail is
added in `publishSelection()` (`src/server/pages.mjs`), server-side, so no
form can bypass it.

**Pages already published keep their address.** A republish reuses the
existing slug, so links already with a client never break — and those older
addresses stay guessable. If that matters for a particular client, unpublish
and publish again to mint a new address, and send the new link.

The Tier 2 form's PAGE ADDRESS field has been removed: the address is no
longer something a consultant chooses. The base is now the client's surname
plus the season, and the form shows the finished address after publishing, as
it did before.

## 4. Known gap: the static design bundles

`index.html` and the four demo bundles (`/atlas/`, `/personalised-atlas/`,
`/yacht-selection/`, `/portal/`) live at the **repository root**, not in
`selection-app/public/`. They are therefore not part of this Next.js
deployment, and nothing in `next.config.ts` can reach them.

Each of the five now carries `<meta name="robots" content="noindex, nofollow">`
as a standalone layer, which covers them wherever they are served from. If
they are in fact deployed — by a second Vercel project, or any other host —
that deployment needs its own `X-Robots-Tag`, via a `vercel.json` at the
repository root:

```json
{ "headers": [{ "source": "/(.*)", "headers": [
  { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive, nosnippet, noimageindex" },
  { "key": "Referrer-Policy", "value": "no-referrer" }
]}]}
```

They were **not** moved into `selection-app/public/`. A file at
`public/destinations/index.html` or `public/portal/index.html` takes precedence
over the app's own `/destinations/[slug]` and `/portal` routes, which would
break the Tier 2 client pages and the portal outright.

The same precedence rule is why the globe's country geometry sits at
`public/geo/` rather than `public/atlas/`: `next.config.ts` redirects
`/atlas/:slug` to `/destinations/:slug` for links issued before the Tier 2
rename, and Next.js applies redirects *before* it serves anything from
`public/`, so geometry left under `/atlas/` would be redirected away and the
globe would fail to draw on both Tier 1 and Tier 2.
