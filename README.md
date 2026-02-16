# gooey-toast

A framework-agnostic, physics-inspired toast notification package.

- No React/Vue peer dependency
- Works in Vue, React, Svelte, Astro, vanilla JS, and more
- Keeps the gooey SVG + spring motion style

## Installation

```bash
npm i gooey-toast
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

## Styling

The package ships with `styles.css` and uses stable data attributes like `[data-sileo-toast]` for targeting. You can also pass class names through `options.styles` to style title, description, badge, and button per toast.
