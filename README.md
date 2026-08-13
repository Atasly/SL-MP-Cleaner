# SL Marketplace Cleaner

A Tampermonkey userscript that filters Second Life Marketplace search results entirely in the browser with no external requests.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. [Install the userscript by clicking here](<https://raw.githubusercontent.com/Atasly/SL-MP-Cleaner/main/SL MP Cleaner.user.js>)

---

## The SL Cleaner menu

Every search page gets an **SL Cleaner** button in the sort bar (to the left of "Best Selling"). A badge on the button shows how many items on the current page were hidden. Clicking it opens a menu with every option below.

All changes apply immediately and are remembered across page loads (`GM_getValue`/`GM_setValue`) and **sync across every open marketplace tab** — change a setting (blacklist, grid mode, anything) in one tab and the other tabs re-apply it instantly, no reload needed. Options that live in the menu:

| Option | Default | Effect |
| ------ | ------- | ------ |
| Blacklist stores | empty | Hides every listing from these stores |
| Negative keywords | empty | Hides listings whose title contains these substrings |
| Hide demos (title) | on | Hides items whose name contains the word **demo** |
| Hide limited quantity | on | Checks the marketplace's native "limited quantity" filter |
| Collapse color variants | on | Keeps the first listing of each product/color set |
| Filter to preferred body | on | Hides items made for a body other than your preferred one |
| Preferred body | Reborn | Reborn/eBody, Maitreya/Lara, Legacy, Kupra/Khupra, Jake, Gianni |
| Show converted prices | on | Appends a €/USD price to each listing |
| Max per store | off | Caps how many listings per store are shown (1/2/3/5/10) |
| Full-width layout | on | Expands the search and store pages to fill the browser window instead of the narrow 700px column (cards keep their original size) |
| Debug log | off | Logs every hide decision and a summary to the browser console |

The **Full-width layout** option is also available as a quick button in the marketplace header on every page (next to the Buy L$ button). The grid icon toggles full-width layout on/off and **changes its icon** to reflect the state (2×2 grid when on, single narrow column when off) — even on pages the layout doesn't affect, like the home page, so you always get visual feedback. The setting is remembered across page loads.

> **Note:** settings sync live across all open marketplace tabs. Any change made in one tab — a blacklist/negative-keyword edit, a toggle flip, or the grid button — is picked up by every other open MP tab within moments, and the receiving tabs re-filter and restyle themselves automatically.

> **Note:** the **Day/night** dark theme is currently **disabled** while it is being reworked. The theme toggle is hidden and no `slmc-night` styling is applied anywhere.

### List editors

**Blacklist stores** and **Negative keywords** each have a checkbox toggle (like every other option) plus a small inline editor. Ticking the checkbox on/off enables or disables the filter immediately; press **Edit** to open the editor, type one entry per line (commas are also treated as separators), then **Save**. A badge next to each label shows how many entries the list holds.

- Blacklist entries are matched against the store name **either** as the exact name (case-insensitive) **or** as a normalized equivalent — punctuation/symbols and emoji are ignored, fancy letters (small-caps like `⊰ɴɪᴀꜱᴀᴍ☯ꜱᴛᴏʀᴇ⊱`, IPA like `ˈtɒksɪk`) are folded to plain ASCII, accents are ignored, and whitespace is collapsed. So `:::SOLE:::` is blacklisted by `sole`, `Sashi{MIA}` by `sashi mia`, `❤️ YsoraL❤️` by `ysoral`, and `Couer  Sucré` by `couer sucre`. Dots stay meaningful between single letters (`*B.D.R.*` → `b.d.r`, `M.mie` → `m.mie`) but act as spaces between words (`something.cool` → `something cool`).
- Negative keywords are matched as **substrings** of the product title, case-insensitively (e.g. `gacha` hides every title containing "gacha").
- A **⊘ Blacklist this store** button under the "Add To Favorite Stores" link on every store page (e.g. `marketplace.secondlife.com/stores/248523`) adds that store's exact name to the blacklist in one click. Once added it turns into **Remove from Blacklist** — click it again to take the store back off the list. If the store is already blacklisted when you open the page, the button starts in the remove state.

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

Each `L$` price gets a small appended span with the price converted to € or USD. This works both on search result cards (`.title4`) and on individual item pages (`.price-ld`); the number formats `L$ 1,399`, `L$ 1399` and `L$ 1 399` are all handled:

- `usdPerLinden` — L$ → USD rate (default `1/250`)
- `eurPerUsd` — USD → EUR rate (default `0.87`)

### Tab titles

Result pages are renamed to `SL MP - <search query>` so tabs are easy to tell apart.

### Full-width layout

The marketplace shows results in a ~700px column centered on the page. **Full-width layout** widens the results area to fill the browser window (store pages and the new search layout are both supported). On store pages the sidebar and card sizing are kept intact - cards stay at their original 220x268 size, just arranged in more columns. On search pages the cards are compacted to match the store style (220x268, 1px `#ccc` border, white background, square corners) and the filter sidebar is narrowed to the same width as a store's, so search shows the same 7 columns per row as a store at 1920px. The featured-items carousel on search pages is kept full-width with its cards unclipped, so the extra "Featured" label line fits. The full-width class is only applied on search results (`/products/search`) and store pages (`/stores/<id>`) — elsewhere the grid button is present but does not widen the page.

**Dark mode** is currently **disabled while it is being reworked**. The header button is hidden, the option no longer appears in the SL Cleaner menu, and the `slmc-night` class is never applied, so all pages stay on the marketplace's default light theme. The night CSS is still shipped in the userscript for the rework.

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

The defaults live in `DEFAULT_SETTINGS` at the top of the script. Every option is exposed in the menu (the list editors write the same `blacklist`/`negativeKeywords` arrays the code uses); the values below are what the code reads, so editing them in the source also works and is remembered via `GM_setValue`:

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
