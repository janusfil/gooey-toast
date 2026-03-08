# gooey-toast

[![CI](https://img.shields.io/github/actions/workflow/status/janusfil/gooey-toast/ci.yml?branch=main&label=ci)](https://github.com/janusfil/gooey-toast/actions/workflows/ci.yml)
[![Publish](https://img.shields.io/github/actions/workflow/status/janusfil/gooey-toast/publish.yml?label=publish)](https://github.com/janusfil/gooey-toast/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/gooey-toast?logo=npm)](https://www.npmjs.com/package/gooey-toast)
[![npm downloads](https://img.shields.io/npm/dm/gooey-toast?logo=npm)](https://www.npmjs.com/package/gooey-toast)
[![GitHub release](https://img.shields.io/github/v/release/janusfil/gooey-toast?display_name=tag)](https://github.com/janusfil/gooey-toast/releases)
[![License](https://img.shields.io/npm/l/gooey-toast)](./LICENSE)

A framework-agnostic, physics-inspired toast notification package.

- No React/Vue peer dependency
- Works in Vue, React, Svelte, Astro, vanilla JS, and more
- Keeps the gooey SVG + spring motion style

## Installation

```bash
npm i gooey-toast
```

GitHub Packages mirror (scoped package):

```bash
npm i @janusfil/gooey-toast --registry=https://npm.pkg.github.com
```

## Quick start (vanilla JS/TS)

```ts
import { mountToaster, toast } from "gooey-toast";
import "gooey-toast/styles.css";

mountToaster({
  position: "top-right",
});

toast.success({
  title: "Saved",
  description: "Your settings have been updated.",
});
```

`toast.*` also auto-mounts a default toaster in `document.body` if you do not call `mountToaster` yourself.

## Vue usage

```ts
// main.ts
import { createApp } from "vue";
import App from "./App.vue";
import { mountToaster } from "gooey-toast";
import "gooey-toast/styles.css";

mountToaster({ position: "top-right" });

createApp(App).mount("#app");
```

```vue
<script setup lang="ts">
import { toast } from "gooey-toast";

const save = async () => {
  await toast.promise(fetch("/api/save", { method: "POST" }), {
    loading: { title: "Saving" },
    success: { title: "Done", description: "Everything is synced." },
    error: { title: "Failed", description: "Please retry." },
  });
};
</script>

<template>
  <button @click="save">Save</button>
</template>
```

## API

- `toast.show(options)`
- `toast.success(options)`
- `toast.error(options)`
- `toast.warning(options)`
- `toast.info(options)`
- `toast.action(options)`
- `toast.promise(promise, options)`
- `toast.dismiss(id)`
- `toast.clear(position?)`
- `mountToaster(options)` / `createToaster(options)`
- `configureToaster(options)`
- `unmountToaster()`

## Debug playground

When you need to verify and tune the current toast behavior locally, use the built-in playground:

```bash
npm run playground
```

Then open `http://localhost:8080/playground/index.html`.

It includes:

- quick actions for each `toast.*` state
- promise success/error scenarios
- controls for position, duration, roundness, fill, and autopilot timings
- live snapshot of DOM state (`[data-gooey-toast]`, viewport counts, CSS vars)
- event log for lifecycle checks

The playground also exposes helper functions in the browser console via
`window.__gooeyToastDebug` (`snapshot()`, `logs()`, `burst()`, `dismissLast()`, `clear()`).

## Styling

The package ships with `styles.css` and uses stable data attributes like `[data-gooey-toast]` for targeting. You can also pass class names through `options.styles` to style title, description, badge, and button per toast.

## Release and package automation

- Push and PR runs are validated by CI (`.github/workflows/ci.yml`).
- Tagging `vX.Y.Z` triggers publish flow (`.github/workflows/publish.yml`).
- Publish flow validates tag/version, builds artifacts, publishes to npm, mirrors
  the same version to GitHub Packages, and creates a GitHub Release with
  generated notes.

## Project hygiene

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Issue and PR templates are in `.github/`
