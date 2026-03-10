# Contributing

Thanks for helping improve gooey-toast.

## Local setup

```bash
npm ci
npm run build
npm run demo:build
npm run test:fuzz
```

For local visual debugging:

```bash
npm run playground
```

Then open `http://localhost:8080`.

## Pull requests

Before opening a PR, please:

1. Keep changes focused and small where possible.
2. Run `npm run build`.
3. Run `npm run test:fuzz`.
4. Run `npm run playground:build` for UI or behavior changes.
5. Run `npm run demo:build` when changing the published demo.
6. Update `README.md` when API or behavior changes.

## Versioning and release

- This project follows semver.
- Merge as many PRs as needed into `main`; do not cut a release until you are ready
  for the next package version.
- Git tags in the `vX.Y.Z` format trigger automated publishing.
- The publish workflow validates the tag, publishes to npm, attaches a release
  tarball plus `sha256sum.txt`, emits build provenance, and creates a GitHub
  Release.
- Generated release notes aggregate everything merged since the previous tag, so
  multiple PRs naturally end up in one changelog/release if they ship together.

## Reporting issues

- Bugs and feature requests: GitHub Issues
- Security concerns: GitHub Security Advisories (private)
