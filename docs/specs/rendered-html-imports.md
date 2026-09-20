# Rendered HTML for URL imports

## Problem

The production URL-import pipeline fetches response HTML without running JavaScript. Recipe sites can insert their recipe card, servings, timing, and nutrition after page load, leaving the extractor with incomplete source evidence.

## Outcome

Every production URL import obtains the final, rendered DOM from a headless browser before HTML cleaning and extraction. The rendered HTML remains the evidence document used by extraction and diagnostics.

## Scope

- Add a dedicated browser-rendering service or worker to the production deployment, using headless Chromium and an explicit, versioned renderer API.
- Route URL imports through that renderer before the existing cleaner, extractor, and enrichment flow.
- Wait for DOM content and a short bounded network-idle period, then serialize `document.documentElement.outerHTML`.
- Validate the initial URL and every main-frame redirect with the existing safe HTTP(S) policy. Block local, private, loopback, link-local, reserved, credential-bearing, and non-HTTP(S) destinations.
- Enforce fixed limits for navigation time, total render time, concurrency, response size, request count, and memory. Abort third-party media, fonts, trackers, and oversized resources that are unnecessary for recipe DOM construction.
- Return the requested URL, final URL, rendered HTML, duration, and a classified failure reason. Preserve the sanitized requested/final URL in source evidence.
- Fall back to the existing bounded raw HTML fetch only when rendering fails for an operational reason. Record the fallback and renderer failure category in the import trace.
- Send a Sentry info event for completed extractions that lack any of: total time, servings, calories, protein, fat, or carbohydrates. Event context contains field names, source kind, sanitized URL, and renderer/fallback status only.

## Exclusions

- Browser login, cookies, user sessions, and interaction with consent dialogs.
- Executing imports inside the API request handler.
- Sending rendered page HTML or recipe text to Sentry.
- Retrospective re-import of existing recipes.

## Acceptance criteria

1. A JavaScript-created recipe card is present in the rendered source passed to the cleaner and extractor.
2. The renderer rejects every unsafe initial URL and unsafe redirect before browser navigation continues.
3. A renderer timeout, crash, or blocked page still produces a normal import result through the raw-fetch fallback, with a traceable diagnostic code.
4. Renderer concurrency and all limits are configurable through production environment settings with conservative defaults.
5. The API image or separate renderer image contains the pinned browser runtime and has a health check.
6. Automated tests cover rendered-DOM extraction, unsafe navigation rejection, timeout fallback, and Sentry context redaction.
7. A manual production-like test confirms a dynamic recipe card yields title, ingredients, steps, servings, total time, and available nutrition fields.

## Implementation plan

1. Add renderer configuration, result and failure contracts, URL-navigation policy, and unit tests.
2. Build the isolated headless Chromium renderer with request interception, limits, and health endpoint; pin the browser version in its image.
3. Integrate rendered fetches into the URL import worker and v2 linked-page provider, retaining raw-fetch fallback and trace events.
4. Add the critical-field Sentry info reporter at the completed extraction boundary and test that it excludes page and recipe text.
5. Add deployment configuration, resource limits, health checks, and monitoring dashboards; validate a dynamic recipe site in a production-like environment.
