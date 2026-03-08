# Contributing

Thanks for helping improve gooey-toast.

## Local setup

```bash
npm ci
npm run build
```

For local visual debugging:

```bash
npm run playground
```

Then open `http://localhost:8080/playground/index.html`.

## Pull requests

Before opening a PR, please:

1. Keep changes focused and small where possible.
2. Run `npm run build`.
3. Run `npm run playground:build` for UI or behavior changes.
4. Update `README.md` when API or behavior changes.

## Versioning and release

- This project follows semver.
- Git tags in the `vX.Y.Z` format trigger automated publishing.
- The publish workflow validates the tag, publishes to npm, publishes a scoped
  mirror to GitHub Packages, and creates a GitHub Release.

## Reporting issues

- Bugs and feature requests: GitHub Issues
- Security concerns: GitHub Security Advisories (private)
