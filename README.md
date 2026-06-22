# SL Marketplace Cleaner

A Tampermonkey userscript that filters Second Life Marketplace search results client-side, with no external requests.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. [Install the userscript by clicking here](https://raw.githubusercontent.com/Atasly/SL-MP-Cleaner/main/SL MP Cleaner.user.js)

---

## Features

### 1. Merchant Blacklist
Hides all results from specific stores.

```js
blacklist: ['Spam Store', 'Another Store']
```

Matching is case-insensitive. Any item whose store name exactly matches an entry is hidden.

---

### 2. Demo Filter
Hides items whose title contains demo-related words:
`demo`, `trial`, `preview`, `sample`, `tester`, `test version`

```js
hideDemos: true   // set to false to keep demos visible
```

---

### 3. Negative Keywords
Hides any item whose title contains one of the specified strings.

```js
negativeKeywords: ['gacha', 'fatpack']
```

Matching is case-insensitive and substring-based (e.g. `'gacha'` matches `"Spring Gacha Set"`).

---

### 4. Color Variant Collapse
When the same item is listed separately per color, only the first result is kept and the rest are hidden.

```js
collapseColors: true   // set to false to see all color variants
```

Color words stripped during comparison include: black, white, red, blue, green, pink, purple, yellow, orange, brown, tan, gray/grey, silver, gold, beige, cream, olive, mint, burgundy, navy, teal.

Text in `(parentheses)`, `{braces}`, and `[brackets]` is also stripped before comparing, since stores often put the color there.

Two items are considered variants of each other if they share the same store and the same title after color/bracket stripping.

---

### 5. Store Saturation Limit
Caps how many results from a single store are shown per page. 
`-1` to disable

```js
maxPerStore: 3   // show at most 3 results per store
```

Results are processed top-to-bottom; the first N items from each store are kept and the rest hidden.

---

### 6. Automatically hide Demos and Limited items
Automatically hides Limited Quantities items, and Demo ones

```js
alwaysHideDemos: true     // Always hide demos items
alwaysHideLimited: true   // Always hide limited items, i.e. gacha
```

---

### 7. Rename tab titles
Rename tab titles to `SL MP - [search/item name]`

---

### 8. Convert SL prices to RL currencies
Converts SL prices to RL currencies, currently € and USD supported.
More conversions could be added, but due to the hard-coded nature of it, it is left to the user.

```js
showCurrency: true     // Show currency
currency: EUR		   // Choose between Euro (EUR) and US Dollars (USD) as a currency
usdPerLinden: 0.004    // i.e. 1 for 250
eurPerUsd: 0.87		   // The conversion from USD to EUR
```

---

## Changing Settings

All settings live in the `SETTINGS` object at the top of the script. Edit them directly in the Tampermonkey editor and save — changes take effect on the next page load.

```js
const SETTINGS = {
    blacklist:        ['Bad Store'],
    negativeKeywords: ['gacha', 'fatpack'],
    maxPerStore:      3,
    collapseColors:   true,
    hideDemos:        true
};
```

Settings are also persisted via `GM_getValue`/`GM_setValue`, meaning future versions of the script can offer a UI to edit them without touching the code.

---

## Notes

- Filtering is purely visual — items are hidden with `display: none`, not removed from the DOM
- Works with SL Marketplace's AJAX pagination; results are re-filtered automatically as new pages load
- Filtering re-runs whenever new content is added to the page (via MutationObserver), debounced at 50ms to avoid performance issues
