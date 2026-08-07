# SL Marketplace Cleaner

A Tampermonkey userscript that filters Second Life Marketplace search results entirely in the browser with no external requests.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. [Install the userscript by clicking here](<https://raw.githubusercontent.com/Atasly/SL-MP-Cleaner/main/SL MP Cleaner.user.js>)

---

## The SL Cleaner menu

Every search page gets an **SL Cleaner** button in the sort bar (to the left of "Best Selling"). A badge on the button shows how many items on the current page were hidden. Clicking it opens a menu with every option below.

All changes apply immediately and are remembered across page loads (`GM_getValue`/`GM_setValue`). Options that live in the menu:

| Option | Default | Effect |
| ------ | ------- | ------ |
| Hide demos (title) | on | Hides items whose name contains the word **demo** |
| Hide limited quantity | on | Checks the marketplace's native "limited quantity" filter |
| Collapse color variants | on | Keeps the first listing of each product/color set |
| Filter to preferred body | on | Hides items made for a body other than your preferred one |
| Preferred body | Reborn | Reborn/eBody, Maitreya/Lara, Legacy, Kupra/Khupra, Jake, Gianni |
| Show converted prices | on | Appends a €/USD price to each listing |
| Max per store | Off | Caps how many listings per store are shown (1/2/3/5/10) |
| Debug log | off | Logs every hide decision and a summary to the browser console |

---

## How each filter works

### Demo detection

Items are checked against the **full product name**, read from the `product_dl_data_*` script embedded in each result card — the marketplace truncates the visible card title, so reading the embedded name avoids both missed demos and false positives.

A name counts as a demo if it contains the word `demo` (also `demos`), as a whole word and case-insensitively:

- Matches: `... BOM-DEMO`, `SaCaYa ... Demo`, `... Fatpack DEMO`
- Does **not** match: `Demolition Hammer`, `Demons and Devils`, `Sample Textures Pack`, `Preview Dress`, `Trial Version Leggings`, `Super Tester Gadget`

Only the word "demo" is considered — trial/preview/sample/tester keywords are intentionally **not** used. This is purely our own title matching; the marketplace's native `no_demos` checkbox is deliberately never touched.

### Body filter (preferred body)

Bodies are detected from the product name, with aliases merged so interchangeable names count as one body:

| Option | Also matches |
| ------ | ------------ |
| Reborn/eBody | `reborn`, `ebody`, `e-body`, `e body` |
| Maitreya/Lara | `maitreya`, `lara` |
| Legacy | `legacy` |
| Kupra/Khupra | `kupra`, `khupra` |
| Jake | `jake` |
| Gianni | `gianni` |

When "Filter to preferred body" is on, every item whose detected body is not the preferred one is hidden. All items for the preferred body stay visible — sub-variants such as `Reborn Waifu`, `Reborn Teacups`, `Reborn V-Tech`, and fatpacks are **not** merged; they are each kept as their own listing. Items with **no** detectable body (add-on HUDs, megapacks, male-only fatpacks, etc.) are always kept.

### Color variant collapse

Two listings are treated as color variants of the same product when they share the same store, the same product stem, and the same demo status. The stem is the lowercase title after stripping:

- color words (black, white, red, blue, green, pink, purple, yellow, orange, brown, tan, gray/grey, silver, gold, beige, cream, olive, mint, violet, burgundy, navy, teal, lavender, magenta, sky, lime)
- text inside `(parentheses)` (stores often put the color there)
- all punctuation (collapsed to spaces)

Text in `{braces}` and `[brackets]` is **kept** — those usually carry product markers like `{PRIDE MEGAPACK}` rather than colors.

Of each such group only the first listing (in page order) is shown. Body-specific items and generic items are grouped separately, and demo versions are grouped separately from full versions, so a demo never collapses a full product.

### Store saturation limit

With "Max per store" set to N, only the first N listings of each store (in page order) are shown; the rest are hidden. `Off` disables this.

### Limited quantity

"Hide limited quantity" simply checks the marketplace's own `no_quantity` filter checkbox, so the marketplace does the hiding.

### Currency conversion

Each `L$` price gets a small appended span with the price converted to € or USD:

- `usdPerLinden` — L$ → USD rate (default `1/250`)
- `eurPerUsd` — USD → EUR rate (default `0.87`)

### Tab titles

Result pages are renamed to `SL MP - <search query>` so tabs are easy to tell apart.

---

## Rule order

For each item the filters run in this order, and the first match hides it:

1. Merchant blacklist
2. Demo
3. Negative keyword
4. Body filter (other than preferred body)
5. Color variant
6. Store saturation limit

## Code-level settings

The defaults live in `DEFAULT_SETTINGS` at the top of the script. Most are exposed in the menu; the following two are only changeable in code (persisted via `GM_setValue`):

```js
blacklist:        [],            // store names to hide entirely (exact, case-insensitive)
negativeKeywords: [],            // title substrings to hide, e.g. ['gacha']
```

```js
collapseBodies:  true,           // 'Filter to preferred body'
preferredBody:   'Reborn',       // one of: Reborn, Maitreya, Legacy, Kupra, Jake, Gianni
```

---

## Notes

- Filtering is purely visual — items are hidden with `display: none`, not removed from the DOM
- Results are re-filtered automatically as the marketplace loads new pages (via `MutationObserver`, debounced 50 ms)
- Hidden-count badge updates on every re-filter
