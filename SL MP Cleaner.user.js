// ==UserScript==
// @name         SL Marketplace Cleaner
// @namespace    slmarketplace
// @version      0.43
// @description  Clean up Second Life Marketplace search results
// @match        https://marketplace.secondlife.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    const SETTINGS = {
        blacklist: GM_getValue('blacklist', [
            // for ex. 'dirty deer', 'gentle gravitas'
        ]),

        negativeKeywords: GM_getValue('negativeKeywords', [
            // for ex. 'adult', 'summer'
        ]),

        maxPerStore: GM_getValue('maxPerStore', -1),

        collapseColors: GM_getValue('collapseColors', true),
        hideUnlabelledDemos: GM_getValue('hideUnlabelledDemos', true),
        alwaysHideDemos: GM_getValue('alwaysHideDemos', false),
        alwaysHideLimited: GM_getValue('alwaysHideLimited', true),

        showCurrency: GM_getValue('showCurrency', true),
        currency: GM_getValue('currency', 'EUR'),
        usdPerLinden: GM_getValue('usdPerLinden', 1 / 250),
        eurPerUsd: GM_getValue('eurPerUsd', 0.87),
    };

    const COLOR_WORDS = [
        'black','white','red','blue','green','pink','purple',
        'yellow','orange','brown','tan','gray','grey',
        'silver','gold','beige','cream','olive','mint','violet',
        'burgundy','navy','teal','lavender','magenta','sky','lime'
    ];

    function applyMarketplaceFilters() {
        if (SETTINGS.alwaysHideDemos) {
            const demoBox =
                  document.querySelector('input[name="no_demos"]');

            if (demoBox && !demoBox.checked) {
                demoBox.checked = true;
            }
        }

        if (SETTINGS.alwaysHideLimited) {
            const limitedBox =
                  document.querySelector('input[name="no_quantity"]');

            if (limitedBox && !limitedBox.checked) {
                limitedBox.checked = true;
            }
        }
    }

    function convertPrice(linden) {
        const usd =
              linden * SETTINGS.usdPerLinden;

        switch (SETTINGS.currency) {

            case 'EUR':
                return '€' +
                    (usd * SETTINGS.eurPerUsd)
                    .toFixed(2);

            case 'USD':
                return '$' +
                    usd.toFixed(2);

            default:
                return '$' +
                    usd.toFixed(2);
        }
    }

    function addConvertedPrices() {
        document.querySelectorAll('.title4')
            .forEach(el => {

            if (el.querySelector('.slmc-converted')) {
                return;
            }

            const match = el.textContent.match(/L\$\s*([\d.,\s]+)/);
            if (!match) return;
            const value = parseInt(match[1].replace(/[\s.,]/g, ''), 10);

            const span = document.createElement('span');

            span.className = 'slmc-converted';

            span.textContent =
                ' (' +
                convertPrice(value) +
                ')';

            el.appendChild(span);
        });
    }

    function updateTitle() {
        const params =
              new URLSearchParams(
                  location.search
              );

        const q =
              params.get('q');

        if (q) {
            document.title =
                'SL MP - ' + q;
        }
        else {
            document.title =
                'SL MP - ' + document.title.slice(26);
        }
    }

    function normalizeTitle(title) {
        let t = title.toLowerCase();
        for (const color of COLOR_WORDS) {
            const re = new RegExp(`\\b${color}\\b`, 'gi');
            t = t.replace(re, '');
        }
        t = t
            .replace(/\{.*?\}/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return t;
    }

    function isDemo(title) {
        const demoWords = ['demo', 'trial', 'preview', 'sample', 'tester', 'test version'];
        return demoWords.some(w => title.toLowerCase().includes(w));
    }

    function getCards() {
        // ✅ Correct selector: div.gallery-item with id starting with "product-"
        const cards = document.querySelectorAll('div.gallery-item[id^="product-"]');

        return [...cards].map(card => {
            // Title from the subtitle1 link
            const titleEl = card.querySelector('a.subtitle1');
            const title = titleEl ? titleEl.textContent.trim() : '';

            // Brand from the store-item span
            const brandEl = card.querySelector('span.store-item');
            let brand = brandEl ? brandEl.textContent.trim() : '';

            // Fallback: extract from the inline script's 'brand': '...' value
            if (!brand) {
                const script = card.querySelector('script');
                if (script) {
                    const match = script.textContent.match(/'brand':\s*'([^']+)'/);
                    if (match) brand = match[1];
                }
            }

            return { title, brand, card };
        }).filter(item => item.title);
    }

    let filterTimer = null;

    function filterResults() {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(_doFilter, 50);
    }

    function isDemoFilterActive() {
        // Server-side filter already active via URL param
        const params = new URLSearchParams(location.search);
        if (params.get('search[no_demos]') === '1') return true;

        // Or user enabled alwaysHideDemos (which checks the checkbox)
        if (SETTINGS.alwaysHideDemos) return true;

        return false;
    }

    function _doFilter() {
        const cards = getCards();
        const storeCounts = new Map();
        const seenVariants = new Set();

        for (const item of cards) {
            const titleLower = item.title.toLowerCase();
            const brandLower = item.brand.toLowerCase();

            // Reset visibility so re-runs on AJAX navigation work cleanly
            item.card.style.display = '';

            // 1. Merchant blacklist
            if (item.brand && SETTINGS.blacklist.some(b => brandLower === b.toLowerCase())) {
                item.card.style.display = 'none';
                continue;
            }

            // 2. Demo filter
            if (SETTINGS.hideUnlabelledDemos && isDemoFilterActive() && isDemo(item.title)) {
                item.card.style.display = 'none';
                continue;
            }

            // 3. Negative keywords
            if (SETTINGS.negativeKeywords.some(kw => titleLower.includes(kw.toLowerCase()))) {
                item.card.style.display = 'none';
                continue;
            }

            // 4. Color variant collapse
            if (SETTINGS.collapseColors) {
                const key = brandLower + '|' + normalizeTitle(item.title);
                if (seenVariants.has(key)) {
                    item.card.style.display = 'none';
                    continue;
                }
                seenVariants.add(key);
            }

            // 5. Store saturation limit
            const count = storeCounts.get(brandLower) || 0;
            if (SETTINGS.maxPerStore > 0 && count >= SETTINGS.maxPerStore) {
                item.card.style.display = 'none';
                continue;
            }
            storeCounts.set(brandLower, count + 1);
        }
    }

    const observer = new MutationObserver((mutations) => {
        const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
        if (hasNewNodes) filterResults();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('load', () => {
        updateTitle();
        applyMarketplaceFilters();
        filterResults();
        if (SETTINGS.showCurrency) addConvertedPrices();
    });

})();
