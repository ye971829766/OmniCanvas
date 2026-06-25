<template>
  <router-view />
</template>

<style>
/*
 * Global Typography Scale
 * Modify these variables to adjust font sizes across the entire app.
 */
:root {
  --text-xs:   11px;   /* tiny hints, counters */
  --text-sm:   13px;   /* secondary / muted text */
  --text-base: 15px;   /* primary body text, chat messages */
  --text-lg:   17px;   /* headings, titles */
}

body {
  font-size: var(--text-base);
}
</style>
