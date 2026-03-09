# gooey-toast

[![CI](https://img.shields.io/github/actions/workflow/status/janusfil/gooey-toast/ci.yml?branch=main&label=ci)](https://github.com/janusfil/gooey-toast/actions/workflows/ci.yml)
[![Publish](https://img.shields.io/github/actions/workflow/status/janusfil/gooey-toast/publish.yml?label=publish)](https://github.com/janusfil/gooey-toast/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/gooey-toast?logo=npm)](https://www.npmjs.com/package/gooey-toast)
[![npm downloads](https://img.shields.io/npm/dm/gooey-toast?logo=npm)](https://www.npmjs.com/package/gooey-toast)
[![GitHub release](https://img.shields.io/github/v/release/janusfil/gooey-toast?display_name=tag)](https://github.com/janusfil/gooey-toast/releases)
[![License](https://img.shields.io/npm/l/gooey-toast)](./LICENSE)

<video src="./gooey-toast.mp4" controls muted playsinline loop></video>

A framework-agnostic, physics-inspired toast notification package.

Inspired by the original React [Sileo](https://github.com/hiaaryan/sileo) project by Aryan Arora, this package brings the same gooey toast feel to framework-agnostic apps.

- No React/Vue peer dependency
- Works in Vue, React, Svelte, Astro, vanilla JS, and more
- Keeps the gooey SVG + spring motion style
- Optional visual timeout bar for auto-dismiss toasts

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

## Options reference

### `ToastOptions`

Used by `toast.show`, `toast.success`, `toast.error`, `toast.warning`, `toast.info`, and
`toast.action`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `id` | `string` | auto-generated | Stable toast id. Reusing an existing id updates that toast instead of adding a new one. |
| `title` | `string` | current state label (`"success"`, `"error"`, etc.) | Main one-line label shown in the header pill. |
| `description` | `string \| number \| Node \| DocumentFragment \| (() => value)` | hidden/collapsed | Expandable body content under the header. |
| `position` | `"top-left" \| "top-center" \| "top-right" \| "bottom-left" \| "bottom-center" \| "bottom-right"` | toaster default (`"top-right"` by default) | Per-toast placement override. |
| `duration` | `number \| null` | `6000` ms | Auto-dismiss timeout. Use `null` (or `<= 0`) to disable auto-dismiss. |
| `timeoutIndicator` | `boolean` | `false` | Shows a subtle countdown bar inside the toast header for finite durations. It pauses together with the dismiss timer on hover. |
| `icon` | `ToastRenderable \| null` | state icon | Custom icon content shown in the badge. |
| `styles` | `{ title?, description?, badge?, button? }` | none | Optional class names for per-part styling. |
| `fill` | `string` | `#FFFFFF` | Fill color for gooey SVG background shapes. |
| `roundness` | `number` | `18` | Corner radius used by header/body gooey shapes. |
| `autopilot` | `boolean \| { expand?: number; collapse?: number }` | enabled; `expand: 150`, `collapse: 4000` | Automatic expand/collapse timings for toasts with content. Use `false` to disable. |
| `button` | `{ title: string; onClick: () => void }` | none | Renders action button inside description area. |

### `ToastPromiseOptions<T>`

Used by `toast.promise(promiseOrFactory, options)`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `loading` | `{ title?: string; icon?: ToastRenderable \| null }` | required | Initial loading toast. Internally uses `duration: null` while pending. |
| `success` | `ToastOptions \| (data: T) => ToastOptions` | required | Toast config when promise resolves (unless `action` is provided). |
| `error` | `ToastOptions \| (err: unknown) => ToastOptions` | required | Toast config when promise rejects. |
| `action` | `ToastOptions \| (data: T) => ToastOptions` | none | If set and promise resolves, this branch is used instead of `success`. |
| `position` | `ToastPosition` | toaster default | Position for the whole promise lifecycle toast id. |

### `ToasterOptions`

Used by `mountToaster`, `createToaster`, and `configureToaster`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `target` | `HTMLElement` | `document.body` | DOM container where viewport sections are mounted. |
| `position` | `ToastPosition` | `"top-right"` | Default position for new toasts without explicit `position`. |
| `offset` | `number \| string \| { top?, right?, bottom?, left? }` | none | Custom viewport offsets (`px` if number). |
| `options` | `Partial<ToastOptions>` | none | Global default toast options merged into every toast call. |

### Behavior defaults

- Hover pauses dismiss timers and timeout bars; leaving resumes from the remaining time.
- Dismissed toasts animate out before leaving the stack.
- `description` content is collapsed by default and expands on hover/autopilot.
- Swipe up/down beyond ~`30px` dismisses a toast.
- `toast.*` auto-mounts a default toaster if you do not mount one manually.

## Debug playground

When you need to verify and tune the current toast behavior locally, use the built-in playground:

```bash
npm run playground
```

Then open `http://localhost:8080`.

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
