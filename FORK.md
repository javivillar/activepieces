# FORK.md — refresquito-keycloak-sso

This branch adds a native "Sign in with Keycloak" OIDC button to
Activepieces **Community Edition**, which has no SSO at all upstream
(federated login is gated behind `ApEdition.CLOUD`/`ApEdition.ENTERPRISE`,
and even Enterprise only supports SAML 2.0 — see
[activepieces/activepieces#11553](https://github.com/activepieces/activepieces/issues/11553)).

Branched from tag **`0.85.4`**. Base repo: `activepieces/activepieces`.
This fork: `javivillar/activepieces`. PR (against a synthetic base branch
pinned to `0.85.4`, so the diff is clean): [#1](https://github.com/javivillar/activepieces/pull/1).

Read this before rebasing/merging onto a newer upstream tag — it tells you
*why* each change exists, not just what changed, so you can judge whether
it still applies or whether upstream has since made it unnecessary.

## Design decision: no Enterprise license faking

Upstream's real federated-login machinery (`federated-authn` module, Google/
SAML providers) lives under `packages/server/api/src/app/ee/` and is only
*registered* for CLOUD/ENTERPRISE editions in `app.ts`. We deliberately did
**not** try to flip `AP_EDITION=ee` with a fake license — that requires a
real license key validated against Activepieces' own servers, which is out
of scope and not something to bypass.

Instead, the fix reuses `authenticationService.federatedAuthn()` — the
actual find-or-create-identity-and-issue-session core logic — which lives
in the **base (non-EE)** `authentication.service.ts` and has no license
gating at all. We only had to write our own OIDC provider + a new,
always-registered module that calls into that existing core.

**On upgrade: re-check this premise.** If a future upstream version moves
`federatedAuthn()` into `ee/`, or adds license/edition checks inside it,
this whole approach needs to be reconsidered.

## New files (should port forward with no conflicts)

- `packages/server/api/src/app/authentication/keycloak-authn/keycloak-authn-provider.ts`
  OIDC discovery (`.well-known/openid-configuration`), Authorization Code
  exchange via `safeHttp.axios` (this repo's SSRF-safe HTTP client — see
  `.claude/rules/safe-http.md`), id_token verification via `jwks-rsa` +
  the existing `helper/jwt-utils.ts`. Mirrors
  `ee/authentication/federated-authn/google-authn-provider.ts`'s shape
  closely on purpose — if upstream changes that file's pattern
  (e.g. a new shared OIDC helper that supersedes hand-rolling this), prefer
  adopting the new pattern here too instead of keeping this hand-rolled.

- `packages/server/api/src/app/authentication/keycloak-authn/keycloak-authn-module.ts`
  Routes `GET /v1/authn/keycloak/login`, `POST /v1/authn/keycloak/claim`,
  both public. Registered **unconditionally** in `app.ts` (not inside the
  `ApEdition` switch), no-ops entirely unless `AP_KEYCLOAK_SSO_ENABLED=true`.
  Calls `authenticationService.federatedAuthn()` with
  `provider: UserIdentityProvider.KEYCLOAK` and
  `predefinedPlatformId: await platformUtils.getPlatformIdForRequest(req)`
  — that platform resolution is the important bit, see below.

- `.github/workflows/refresquito-keycloak-build.yml`
  Self-contained CI (plain `docker/build-push-action` + buildx) publishing
  only to `ghcr.io/javivillar/activepieces`. Upstream's own
  `release-self-hosted.yml` needs a paid Depot project token this fork
  doesn't have — don't try to reuse it.

- `packages/web/src/assets/img/custom/auth/keycloak.svg`
  A generic Material-Symbols "key" glyph, **not** Keycloak's real logo
  (avoids trademark issues in a fork). Same style as the existing
  `saml.svg` (which is likewise a generic lock icon, not SAML's own mark).

## Modified files (check these carefully on rebase — most likely to conflict)

- **`packages/server/api/src/app/app.ts`**
  Two added lines: import + `await app.register(keycloakAuthnModule)`,
  placed right after `await app.register(authenticationModule)`, *outside*
  the `switch (edition)` block. If upstream restructures that switch or
  moves `authenticationModule`'s registration, just make sure
  `keycloakAuthnModule` stays registered unconditionally (all editions),
  not inside any one `case`.

- **`packages/shared/src/lib/core/authentication/user-identity.ts`**
  Added `KEYCLOAK = 'KEYCLOAK'` to `UserIdentityProvider`. **Do NOT** add it
  to `authentication.service.ts`'s `signUp()` function's
  `isFederatedProvider` check (`GOOGLE || JWT || SAML`) — that's
  deliberate. Adding it there reproduces a real bug: a brand-new federated
  user gets `verified: true` at creation, then `sendVerificationOrAutoVerify`
  calls `userIdentityService.verify()` unconditionally for
  `COMMUNITY`/`ENTERPRISE`, which throws `"User is already verified"`
  because it's not idempotent. Leaving `KEYCLOAK` out means the identity
  starts `verified: false` and that later `.verify()` call succeeds
  normally. If upstream ever fixes `verify()` to be idempotent, this
  constraint can be dropped and `KEYCLOAK` could be added to the list
  (cosmetic only, no functional difference either way at that point).

- **`packages/server/api/src/app/helper/system/system-props.ts`** +
  **`packages/server/api/src/app/helper/system-validator.ts`**
  New `AppSystemProp` entries (`KEYCLOAK_SSO_ENABLED`, `_ISSUER_URL`,
  `_CLIENT_ID`, `_CLIENT_SECRET`) + their validators + a startup
  fail-fast check (enabled but misconfigured → throws). Purely additive,
  low conflict risk — just re-add if upstream reformats these files.

- **`packages/server/api/src/app/flags/flag.service.ts`**
  Added `ApFlagId.KEYCLOAK_SSO_ENABLED` to both the `In([...])` query list
  and the pushed flag values array (`value:
  system.getBoolean(AppSystemProp.KEYCLOAK_SSO_ENABLED) ?? false`). This is
  how the frontend knows whether to render the button.

- **`packages/shared/src/lib/core/flag/flag.ts`**
  Added `KEYCLOAK_SSO_ENABLED = 'KEYCLOAK_SSO_ENABLED'` to `ApFlagId`.

- **`packages/shared/src/lib/core/common/telemetry.ts`**
  Widened `FederatedLoginStarted`'s `provider` union from
  `'google' | 'saml'` to include `'keycloak'`. Purely a type change for our
  own telemetry call in the frontend button.

- **`packages/web/src/api/authentication-api.ts`**
  Added `getKeycloakLoginUrl()` / `claimKeycloakRequest()`, calling the two
  new backend routes. Straightforward, low conflict risk.

- **`packages/web/src/features/authentication/components/third-party-logins.tsx`**
  The most likely file to conflict on a real upstream merge, since it's
  actively developed. Added:
  - A `keycloakSsoEnabled` flag read + a `handleKeycloakClick` handler
    using `oauth2Utils.openOAuth2Popup()` (**not**
    `oauth2Utils.useThirdPartyLogin()`, which the Google button uses — see
    "Real bug found in upstream" below for why).
  - A new `<Button>` block, gated by `keycloakSsoEnabled`, styled/labeled
    identically to the Google/SAML buttons already in this file.

  On rebase: re-locate these two additions (the handler + the button JSX)
  into whatever the file looks like upstream, keeping the same pattern —
  don't try to line-for-line patch if the surrounding code moved.

- **`packages/web/public/locales/en/translation.json`**
  Added `"Keycloak": "Keycloak"`. Trivial.

- **`Dockerfile`** and **`package.json`** (root)
  See "Build-environment fixes" below — these are environment-specific,
  not feature code. **Re-evaluate whether they're still needed** rather
  than blindly reapplying; the underlying Debian/npm-registry state may
  have changed by the time you're reading this.

## Real bug found in upstream (informational, not fixed here)

`third-party-logins.tsx`'s existing **Google** button uses
`oauth2Utils.useThirdPartyLogin()`, which does a **full-page redirect**
(`window.location.href = ...`) to the provider. The backend's own
`/redirect` handler (registered directly in `app.ts`, outside any edition
switch) only does `window.opener.postMessage(...)` — which requires the
auth flow to have been opened as a **popup**, so there's a `window.opener`
to post back to. A full-page redirect has no opener, so that response page
is a dead end for that flow in this exact deployment topology (single
origin serving both the SPA and the API, no separate popup step).

We did **not** fix the Google button — out of scope, and it may only ever
be exercised on Activepieces' own Cloud SaaS where the topology could
differ. Our Keycloak button avoids the same trap by using
`oauth2Utils.openOAuth2Popup()` instead (real popup + postMessage capture,
the same mechanism already used successfully by piece OAuth2 connections).
If you're rebasing and upstream has since fixed the Google button, look at
how they fixed it — our approach might become redundant with a shared
helper at that point.

## Build-environment fixes (unrelated to the Keycloak feature)

Three commits, entirely about getting `docker build .` to succeed on
**this fork's own CI** (plain GitHub Actions, no Depot) as of 2026-09-17 —
none of this touches application behavior:

1. **`Dockerfile`**: bullseye's `debian-security` apt repo had vanished
   from `deb.debian.org`'s CDN (every file 404s). Dropped that one
   `sources.list` line.
2. **`Dockerfile`**: the base image's `libc6`/`perl-base` are already a
   point release newer than what `debian bullseye/main` offers (that newer
   build only ever lived in the now-gone security repo). Fixed by naming
   them explicitly with `--allow-downgrades` **and** an exact version pin
   (`libc6=2.31-13+deb11u11 perl-base=5.32.1-4+deb11u3`) — naming them bare
   is a no-op since apt considers the already-installed newer one to
   satisfy an unversioned request.
3. **`package.json`**: removed `redis-memory-server` from
   `trustedDependencies`. It's a real (non-dev) dependency used only for an
   optional `AP_REDIS_TYPE=MEMORY` embedded-Redis mode
   (`database/redis/memory-redis.ts`) that this fork's deployment never
   uses (always a real bundled Redis). Its postinstall tries to compile
   bundled Redis Stack modules (Bloom/Search/JSON/TimeSeries), needing
   `cmake` and Redis's own Python-based "readies" build tooling — chasing
   that toolchain wasn't worth it for a script whose output is never used
   here. The package itself still installs and imports fine; only its
   postinstall is skipped.

**On upgrade**: try dropping all three first. `deb.debian.org`'s
`debian-security` repo being gone might be a permanent bullseye-EOL thing
(worth checking whether a newer `node:*-bullseye-slim` tag even still
exists, or whether upstream has moved to bookworm) or might have been a
transient/date-specific state. Re-test a plain `docker build .` before
reapplying any of these.

## Keycloak group → platformRole sync (added after the initial PR)

Requests `groups` in the OAuth scope and reads the id_token's `groups`
claim (plain names, not full paths — depends on the realm's `groups`
client scope mapper having `full.path=false`; check this on a different
Keycloak instance). `keycloak-authn-module.ts`'s `syncPlatformRoleFromGroups()`
runs after every `federatedAuthn()` call and calls `userService.update()`
to promote/demote between `PlatformRole.ADMIN`/`MEMBER` based on
membership in the group named by `AP_KEYCLOAK_ADMIN_GROUP` (default
`activepieces-admin`) — **both directions**, but the platform owner is
never touched (avoids a self-lockout footgun). Verified live, bidirectionally,
against a real Keycloak group.

Deliberately implemented as a post-processing step here rather than
threading a `platformRole` param through `authenticationService
.federatedAuthn()` → `signUp()` → `userService.getOrCreateWithProject()`
(which hardcodes `PlatformRole.MEMBER` for every newly-created user,
federated or not) — smaller diff, works uniformly for both the new-user
and existing-user code paths, lower conflict risk on rebase.

**Deployment gotcha, unrelated to the code itself**: if you're using a
mutable/floating image tag (this fork's own CI overwrites
`refresquito-keycloak-sso` on every push), make sure the chart's
`imagePullPolicy` is `Always`, not the default `IfNotPresent` — otherwise
`helm upgrade` can "successfully roll out" a pod that's silently still
running a stale cached image under the same tag string, with no visible
error. Bit us once deploying this exact feature.

## Editor/Viewer flow-edit permission via a shared TEAM project (added after the access gate)

User asked: a group/role mechanism to control who can edit a given
process ("proceso" = flow), as an admin-only function (no self-service).
Researched before writing any code:

- Activepieces already ships a complete project-role RBAC system
  (`DefaultProjectRole.ADMIN`/`EDITOR`/`VIEWER`, resolved to permissions
  in `packages/shared/src/lib/ee/authn/access-control-list.ts` —
  `WRITE_FLOW` for Admin/Editor, read-only for Viewer) and
  `OPEN_SOURCE_PLAN.teamProjectsLimit = TeamProjectsLimit.ONE` — the
  Community plan explicitly allows **exactly one** TEAM project. This is
  a real, designed-in capability, just unregistered outside CLOUD/
  ENTERPRISE in `app.ts`, same pattern as everything else in this fork.
- **Important limit, true at every edition including paid ones**:
  permission granularity is per-PROJECT, not per-individual-flow.
  Activepieces has no "can edit flow A but not flow B in the same
  project" concept anywhere. If truly per-flow isolation is ever needed,
  the only lever is separate projects per group of flows (Community's
  plan caps that at one extra TEAM project, though).
- Confirmed the actual enforcement path has no Community gate:
  `rbacService.assertPrinicpalAccessToProject()` (wired into every
  `securityAccess.project(...)` route, including `POST /v1/flows` and
  the flow-operation endpoint) has zero edition check. A separate,
  more granular function, `assertUserHasPermissionToFlow()`, DOES
  no-op for Community — but it's redundant for our purposes: it keys on
  the same `UPDATE_FLOW_STATUS`/`WRITE_FLOW` permissions the route-level
  check already enforces, so Viewer is still correctly blocked before
  ever reaching that no-op'd extra check.

**Implementation**: `syncSharedProjectRoleFromGroups()` in
`keycloak-authn-module.ts`, called after the platformRole sync. No-ops
entirely unless `AP_KEYCLOAK_SHARED_PROJECT_ID` is set (an admin creates
the one TEAM project once, e.g. via `POST /v1/projects` — already
registered in Community, no fork change needed for that part — and
passes its id). `AP_KEYCLOAK_EDITOR_GROUP`/`_VIEWER_GROUP` (default
`activepieces-editor`/`activepieces-viewer`) decide the role via
`projectMemberService.upsert()`/`.delete()`, imported directly from
`ee/projects/project-members/project-member.service` — same pragmatic
CE→EE import already established for `otpService` in
`authentication.service.ts` and `federatedAuthnService` in
`flag.service.ts` (pre-existing patterns in this codebase, not something
we introduced). Platform admins and the platform owner are skipped
(`userService.isUserPrivileged` already gives them access to every
project — an explicit membership row would be redundant, not wrong,
just noise). Editor/viewer groups were also added to
`assertGroupAccessAllowed()` — otherwise someone added only to
`activepieces-editor` couldn't complete SSO login at all.

**Verified live, full lifecycle, real permission enforcement (not just
the DB row)**: `test-a` with no group → (blocked by the access gate, see
above) → added to `activepieces-editor` → real `project_member` row
with role `Editor` appeared → **created an actual flow via `POST
/v1/flows` as that user, 201** → moved to `activepieces-viewer` → role
row updated to `Viewer` → **tried creating a flow again, got a real 403
`PERMISSION_DENIED` naming `WRITE_FLOW` as the missing permission** →
removed from both groups (kept only in `activepieces-user`) → the
`project_member` row was deleted entirely, confirming demotion-to-none
also works, not just role swaps.

## Keycloak group as an access gate (added after group-role sync)

`assertGroupAccessAllowed()` runs in the `/claim` handler **before**
`federatedAuthn()` is ever called: a Keycloak user who is in neither
`AP_KEYCLOAK_ADMIN_GROUP` nor the new `AP_KEYCLOAK_USER_GROUP` (default
`activepieces-user`) gets an immediate 403 (`ErrorCode.AUTHORIZATION`) and
never reaches Activepieces' own account-creation/invitation logic at all.
Group membership is now the real access control, layered on top of (not
instead of) Activepieces' own invitation-only sign-up gate — both must
pass for a brand-new identity; an *existing* identity (matched by email)
still needs to be in one of these two groups too, every login, not just
once at signup.

**Don't forget the platform owner**: the owner-skip in
`syncPlatformRoleFromGroups()` only protects their *role* from being
changed — it does NOT exempt them from this access gate. If the owner's
own Keycloak user isn't in either group, they get locked out of SSO login
entirely (their native email/password login still works, since that's a
separate code path). Make sure whoever holds the platform owner account is
in `AP_KEYCLOAK_ADMIN_GROUP` before enabling this in a fresh environment.

## Real RP-initiated logout (added after user-reported bug)

User-reported bug, real and confirmed: clicking logout only cleared
Activepieces' own local token (`authentication-session.ts`'s `logOut()`
never touched Keycloak at all) — Keycloak's own browser SSO session cookie
stayed alive, so clicking "Sign in with Keycloak" again silently
re-authenticated without ever prompting for a password. Standard OIDC SSO
behavior, just surprising without a matching real logout.

Fixed in two passes, because the first one wasn't enough — verify each
piece if you rebase this:

1. New `GET /v1/authn/keycloak/logout`, builds the URL from the OIDC
   discovery doc's `end_session_endpoint` + `post_logout_redirect_uri`.
   Frontend tags a session as Keycloak-originated and, on logout, redirects
   there instead of just clearing local storage.
2. **That alone was not enough** — live testing (curl + real cookie jar)
   showed Keycloak returning an interactive "Do you want to log out?"
   confirmation page instead of ending the session, because
   `id_token_hint` was missing. Fixed by having `authenticate()` also
   return the *raw* id_token string (not just its decoded claims),
   returning it to the frontend as `keycloakIdToken` on the `/claim`
   response, storing it, and passing it back as `?idTokenHint=` on
   `/logout` — `getLogoutUrl()` includes it as `id_token_hint` when
   present.

Also required a **separate Keycloak-side config change**, easy to miss on
a fresh client: the client's `post.logout.redirect.uris` attribute must
explicitly list the sign-in URL — it's independent from the normal
`redirectUris` used for login, and Keycloak rejects an unregistered
`post_logout_redirect_uri` outright.

**Verified live, full real flow** (curl + cookie jar, not just unit-level):
login as a real user → `GET /logout?idTokenHint=...` → `302` (direct
redirect, no confirmation page) → **logging in again with the same
browser/cookie jar shows the real Keycloak login form**, asking for
credentials again — confirmed by the presence of `name="username"` in the
response and the absence of an auto-redirect-with-code.

## What's intentionally NOT done

- No changes to the existing Google/SAML EE code paths, beyond widening one
  shared type (`FederatedLoginStarted`).
- No attempt to fix `useThirdPartyLogin()`'s full-page-redirect issue for
  the Google button (see above).
