# @bunary/http — agent instructions

## Definition of done

A PR that changes anything a user of the package can observe (public API,
types, options, defaults, response shape, headers, status codes, error
behaviour) is not done until, in the same PR:

- `docs/index.md` documents the change: new options, exports and behaviour get
  a section or an updated example; removed or changed behaviour is corrected
  wherever the docs mention it.
- `README.md` is updated if it covers the changed area.
- `CHANGELOG.md` has an entry under `## [Unreleased]` (Added / Changed / Fixed /
  Breaking), ending with the issue number, e.g. `(#117)`.

Internal-only changes (tests, refactors with no observable effect, CI) need a
CHANGELOG entry only if they fix a user-visible bug.

### Version bump on every shipped change

Every PR that changes `src/` or anything else shipped in the package's code
(what ends up in `dist`, or `package.json` exports, dependencies and peer
dependencies) must, in the same PR:

- Bump `package.json` `version` by semver: patch for fixes, minor for
  features, major for breaking changes. While the version is a pre-release,
  bump the pre-release number instead, whatever the kind of change:
  `1.0.0-rc.N` → `1.0.0-rc.N+1` (e.g. `1.0.0-rc.1` → `1.0.0-rc.2`).
- Move its CHANGELOG entries from `## [Unreleased]` to a new heading for that
  version, `## [x.y.z] - YYYY-MM-DD`, directly below `## [Unreleased]`
  (which stays, empty).

Why: on merge to `main`, the tag-release job tags `v<version>` from
`package.json`. If the version was not bumped, that tag already exists and
tag-release fails on the duplicate tag, even with CI and tests green.

Docs-only (including `README.md`, `docs/` and `CHANGELOG.md`), test-only and
CI-only changes do not bump the version.

## Out of scope

No npm publishing and no CI/CD or release workflows: publishing for all
`@bunary/*` packages is on hold until the maintainer says otherwise.
