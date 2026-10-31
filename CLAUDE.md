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

## Out of scope

No npm publishing and no CI/CD or release workflows: publishing for all
`@bunary/*` packages is on hold until the maintainer says otherwise.
