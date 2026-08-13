// ==UserScript==
// @name         SL Marketplace Cleaner
// @namespace    slmarketplace
// @version      0.71
// @description  Clean up Second Life Marketplace search results
// @match        https://marketplace.secondlife.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_SETTINGS = {
        blacklist: [],
        blacklistEnabled: true,
        negativeKeywords: [],
        negativeKeywordsEnabled: true,
        maxPerStore: -1,
        collapseColors: true,
        collapseBodies: true,
        preferredBody: 'Reborn',
        hideDemos: true,
        hideLimited: true,
        showCurrency: true,
        currency: 'EUR',
        usdPerLinden: 1 / 250,
        eurPerUsd: 0.87,
        layoutEnabled: true,
        theme: 'day',
        debug: false,
    };

    const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

    function loadSettings() {
        const s = {};
        for (const key of SETTING_KEYS) {
            s[key] = GM_getValue(key, DEFAULT_SETTINGS[key]);
        }
        return s;
    }

    const settings = loadSettings();

    function saveSetting(key, value) {
        settings[key] = value;
        GM_setValue(key, value);
    }

    function coerceSetting(key, value) {
        const def = DEFAULT_SETTINGS[key];
        if (typeof def === 'boolean') return !!value;
        if (typeof def === 'number') return Number(value);
        return value;
    }

    function setSetting(key, value) {
        saveSetting(key, coerceSetting(key, value));
        refreshAll();
        syncUIFromSettings();
        refreshAppearance();
    }

    function parseListInput(text) {
        return [...new Set(String(text || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean))];
    }

    const TRANSLIT = {
        'ᴀ':'a', 'ʙ':'b', 'ᴄ':'c', 'ᴅ':'d', 'ᴇ':'e', 'ꜰ':'f', 'ɢ':'g', 'ʜ':'h', 'ɪ':'i', 'ᴊ':'j',
        'ᴋ':'k', 'ʟ':'l', 'ᴍ':'m', 'ɴ':'n', 'ᴏ':'o', 'ᴘ':'p', 'ʀ':'r', 'ꜱ':'s', 'ᴛ':'t',
        'ᴜ':'u', 'ᴠ':'v', 'ᴡ':'w', 'ʏ':'y', 'ᴢ':'z',
        'ɐ':'a', 'ɑ':'a', 'ɒ':'o', 'ɔ':'o', 'ɓ':'b', 'ɕ':'c', 'ɖ':'d', 'ɗ':'d', 'ɘ':'e', 'ə':'e',
        'ɚ':'er', 'ɛ':'e', 'ɜ':'e', 'ɝ':'er', 'ɞ':'o', 'ɟ':'j', 'ɡ':'g', 'ɥ':'h', 'ɦ':'h',
        'ɨ':'i', 'ɬ':'l', 'ɭ':'l', 'ɮ':'l', 'ɯ':'u', 'ɰ':'u', 'ɱ':'m', 'ɲ':'n', 'ɳ':'n',
        'ɵ':'o', 'ɹ':'r', 'ɺ':'r', 'ɻ':'r', 'ɼ':'r', 'ɽ':'r', 'ɾ':'r', 'ʁ':'r',
        'ʂ':'s', 'ʃ':'sh', 'ʈ':'t', 'ʉ':'u', 'ʊ':'u', 'ʋ':'v', 'ʌ':'a', 'ʍ':'w', 'ʎ':'y',
        'ʐ':'z', 'ʑ':'z', 'ʒ':'zh', 'ʔ':'', 'ʕ':'', 'ʡ':'', 'ʢ':'',
        'ʰ':'h', 'ʲ':'j', 'ʷ':'w', 'ˀ':'', 'ˈ':'', 'ˌ':'', 'ː':'', 'ˑ':'', 'ʼ':'',
        'å':'a', 'ø':'o', 'æ':'ae', 'œ':'oe', 'ß':'ss', 'ð':'d', 'þ':'th'
    };

    function normalizeName(s) {
        return String(s || '')
            .replace(/[\p{S}]+/gu, ' ')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .split('').map(ch => TRANSLIT[ch] ?? ch).join('')
            .split('.').map((tok, i, arr) => {
                if (i === arr.length - 1) return tok;
                const next = arr[i + 1];
                if (tok && next && (tok.length === 1 || next.length === 1)) return tok + '.';
                return tok + ' ';
            }).join('')
            .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
            .replace(/[\s\u00A0]+/g, ' ')
            .replace(/^[.\s]+|[.\s]+$/g, '')
            .toLowerCase();
    }

    function blacklistMatch(brand, entry) {
        const b = String(brand || '').trim();
        const e = String(entry || '').trim();
        if (!b || !e) return false;
        return b.toLowerCase() === e.toLowerCase() || normalizeName(b) === normalizeName(e);
    }

    const COLOR_WORDS = [
        'black', 'white', 'red', 'blue', 'green', 'pink', 'purple',
        'yellow', 'orange', 'brown', 'tan', 'gray', 'grey',
        'silver', 'gold', 'beige', 'cream', 'olive', 'mint', 'violet',
        'burgundy', 'navy', 'teal', 'lavender', 'magenta', 'sky', 'lime'
    ];

    function normalizeTitle(title) {
        let t = title.toLowerCase();
        for (const color of COLOR_WORDS) {
            t = t.replace(new RegExp(`\\b${color}\\b`, 'g'), '');
        }
        return t
            .replace(/\{.*?\}/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeForDemo(text) {
        return text.toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const DEMO_RE = /\bdemo(s)?\b/;

    function isDemo(name) {
        if (!name) return false;
        return DEMO_RE.test(normalizeForDemo(name));
    }

    const BODY_ALIASES = [
        { id: 'Reborn', label: 'Reborn/eBody', re: /\b(reborn|e\s?body)\b/ },
        { id: 'Maitreya', label: 'Maitreya/Lara', re: /\b(maitreya|lara)\b/ },
        { id: 'Legacy', label: 'Legacy', re: /\blegacy\b/ },
        { id: 'Kupra', label: 'Kupra/Khupra', re: /\b(kupra|khupra)\b/ },
        { id: 'Jake', label: 'Jake', re: /\bjake\b/ },
        { id: 'Gianni', label: 'Gianni', re: /\bgianni\b/ },
    ];

    function detectBody(name) {
        if (!name) return null;
        const text = normalizeForDemo(name);
        for (const body of BODY_ALIASES) {
            if (body.re.test(text)) return body.id;
        }
        return null;
    }

    function shouldHideBody(body) {
        return !!(settings.collapseBodies && body && body !== settings.preferredBody);
    }

    function variantStem(title, stripColors) {
        let t = title.toLowerCase();
        if (stripColors) {
            for (const color of COLOR_WORDS) {
                t = t.replace(new RegExp(`\\b${color}\\b`, 'g'), ' ');
            }
            t = t.replace(/\(.*?\)/g, ' ');
        }
        return t.replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
    }

    function computeGroupKey(item) {
        const body = settings.collapseBodies ? detectBody(item.name) : null;
        const stem = variantStem(item.title, settings.collapseColors);
        const demoFlag = isDemo(item.name) ? '|demo' : '|full';
        return normalizeName(item.brand) + '|' + (body ? 'B' : 'C') + '|' + stem + demoFlag;
    }

    function decodeEntities(s) {
        if (!s) return '';
        const el = document.createElement('textarea');
        el.innerHTML = s;
        return el.value;
    }

    function slugToName(pathname) {
        const parts = pathname.split('/').filter(Boolean);
        const slug = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');
        return decodeEntities(slug.replace(/-/g, ' '));
    }

    function parseProductData(text) {
        const data = {};
        const grab = (field) => {
            const m = text.match(new RegExp(`'${field}':\\s*'([^']*)'`));
            return m ? m[1] : null;
        };
        const name = grab('name');
        const brand = grab('brand');
        if (name !== null) data.name = decodeEntities(name).trim();
        if (brand !== null) data.brand = decodeEntities(brand).trim();
        return data;
    }

    const CARD_SELECTOR = 'div.gallery-item[id^="product-"]';

    function getCards() {
        return [...document.querySelectorAll(CARD_SELECTOR)].map(card => {
            const script = card.querySelector('script');
            const data = script ? parseProductData(script.textContent) : {};
            const titleEl = card.querySelector('a.subtitle1');
            let name = data.name;
            if (!name && titleEl) name = decodeEntities(titleEl.textContent.trim());
            if (!name && titleEl && titleEl.href) {
                name = slugToName(new URL(titleEl.href, location.href).pathname);
            }
            const brandEl = card.querySelector('span.store-item');
            const brand = data.brand || (brandEl ? brandEl.textContent.trim() : '');
            const title = titleEl ? decodeEntities(titleEl.textContent.trim()) : '';
            return { card, name, title: title || name, brand, href: titleEl ? titleEl.href : '' };
        }).filter(item => item.name);
    }

    let lastSummary = null;

    function firstMatchingRule(item, storeCounts, variantReason) {
        const name = item.name.toLowerCase();
        const brand = normalizeName(item.brand);

        if (settings.blacklistEnabled && item.brand && settings.blacklist.some(b => blacklistMatch(item.brand, b))) {
            return 'blacklist';
        }
        if (settings.hideDemos && isDemo(item.name)) {
            return 'demo';
        }
        if (settings.negativeKeywordsEnabled && settings.negativeKeywords.some(kw => kw && name.includes(kw.toLowerCase()))) {
            return 'negative keyword';
        }
        if (shouldHideBody(item.body)) {
            return 'body filter';
        }
        if (settings.collapseColors && variantReason) {
            return variantReason;
        }
        if (settings.maxPerStore > 0) {
            const count = storeCounts.get(brand) || 0;
            if (count >= settings.maxPerStore) {
                return 'store limit';
            }
            storeCounts.set(brand, count + 1);
        }
        return null;
    }

    function applyFilters() {
        const items = getCards();
        const storeCounts = new Map();
        const variantReasons = new Map();
        const summary = { total: items.length, hidden: 0, reasons: {} };

        for (const item of items) {
            item.body = settings.collapseBodies ? detectBody(item.name) : null;
        }

        if (settings.collapseColors) {
            const groups = new Map();
            for (const item of items) {
                const key = computeGroupKey(item);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(item);
            }
            for (const group of groups.values()) {
                if (group.length <= 1) continue;
                const winner = group[0];
                for (const item of group) {
                    if (item !== winner) {
                        variantReasons.set(item, 'color variant');
                    }
                }
            }
        }

        for (const item of items) {
            item.card.style.display = '';
            const reason = firstMatchingRule(item, storeCounts, variantReasons.get(item));
            if (reason) {
                item.card.style.display = 'none';
                summary.hidden += 1;
                summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
                if (settings.debug) {
                    console.info('[SLMC] hidden → ' + reason + ':', item.name, '(', item.brand, ')');
                }
            }
        }

        lastSummary = summary;
        if (settings.debug) {
            console.info('[SLMC] summary:', summary);
        }
        updateBadge();
        return summary;
    }

    function addToBlacklist(storeName) {
        const list = [...new Set([...(settings.blacklist || []), String(storeName || '').trim()].filter(Boolean))];
        setSetting('blacklist', list);
        if (settings.debug) {
            console.info('[SLMC] blacklisted store:', storeName);
        }
    }

    function removeFromBlacklist(storeName) {
        const list = (settings.blacklist || []).filter(entry => !blacklistMatch(storeName, entry));
        setSetting('blacklist', list);
        if (settings.debug) {
            console.info('[SLMC] un-blacklisted store:', storeName);
        }
    }

    function addStoreBlacklistButton() {
        if (!settings.blacklistEnabled) return;
        const profile = document.querySelector('.merchant-profile');
        if (!profile) return;
        const favLink = profile.querySelector('a.profile-detail-link[href^="/favorite_stores"]');
        if (!favLink) return;
        ensureStyle(STORE_BTN_CSS, 'slmc-store-style');
        if (profile.querySelector('.slmc-store-bl-btn')) return;
        const titleEl = document.querySelector('#merchant-details .merchant-title h5');
        const storeName = titleEl ? titleEl.textContent.trim() : '';
        if (!storeName) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slmc-store-bl-btn';
        const refresh = () => {
            const isBlacklisted = (settings.blacklist || []).some(entry => blacklistMatch(storeName, entry));
            btn.classList.toggle('slmc-bl-btn-done', isBlacklisted);
            btn.textContent = isBlacklisted ? 'Remove from Blacklist' : '⊘ Blacklist this store';
            btn.title = isBlacklisted ? 'Remove this store from the blacklist' : 'Add this store to the blacklist';
        };
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isBlacklisted = (settings.blacklist || []).some(entry => blacklistMatch(storeName, entry));
            if (isBlacklisted) {
                removeFromBlacklist(storeName);
            } else {
                addToBlacklist(storeName);
            }
            refresh();
        });
        refresh();
        favLink.insertAdjacentElement('afterend', btn);
    }

    function convertPrice(linden) {
        const usd = linden * settings.usdPerLinden;
        switch (settings.currency) {
            case 'EUR':
                return '€' + (usd * settings.eurPerUsd).toFixed(2);
            case 'USD':
                return '$' + usd.toFixed(2);
            default:
                return '$' + usd.toFixed(2);
        }
    }

    function removeConvertedPrices() {
        document.querySelectorAll('.slmc-converted').forEach(el => el.remove());
    }

    function addConvertedPrice(el) {
        if (el.querySelector('.slmc-converted')) return;
        const match = el.textContent.match(/L\$\s*([\d.,\s]+)/);
        if (!match) return;
        const value = parseInt(match[1].replace(/[\s.,]/g, ''), 10);
        const span = document.createElement('span');
        span.className = 'slmc-converted';
        span.textContent = ' (' + convertPrice(value) + ')';
        el.appendChild(span);
    }

    function addConvertedPrices() {
        const els = new Set([
            ...document.querySelectorAll('.title4'),
            ...document.querySelectorAll('.price-ld'),
        ]);
        els.forEach(addConvertedPrice);
    }

    function applyPrices() {
        if (settings.showCurrency) {
            addConvertedPrices();
        } else {
            removeConvertedPrices();
        }
    }

    function setNativeCheckbox(name, checked) {
        const el = document.querySelector(`input[name="${name}"]`);
        if (el && el.type === 'checkbox' && el.checked !== checked) {
            el.checked = checked;
        }
    }

    function applyMarketplaceFilters() {
        if (settings.hideLimited) {
            setNativeCheckbox('no_quantity', true);
        }
    }

    function refreshAll() {
        applyMarketplaceFilters();
        applyFilters();
        applyPrices();
    }

    function updateTitle() {
        const params = new URLSearchParams(location.search);
        const q = params.get('q') || params.get('search[keywords]');
        document.title = q ? 'SL MP - ' + q : 'SL MP - ' + document.title.slice(26);
    }

    const UI_ID = 'slmc-ui';

    const UI_ROWS = [
        { key: 'hideDemos', type: 'bool', label: 'Hide demos (title)' },
        { key: 'hideLimited', type: 'bool', label: 'Hide limited quantity' },
        { key: 'collapseColors', type: 'bool', label: 'Collapse color variants' },
        { key: 'collapseBodies', type: 'bool', label: 'Filter to preferred body' },
        { key: 'preferredBody', type: 'select', label: 'Preferred body', options: [
            ['Reborn', 'Reborn/eBody'], ['Maitreya', 'Maitreya/Lara'], ['Legacy', 'Legacy'],
            ['Kupra', 'Kupra/Khupra'], ['Jake', 'Jake'], ['Gianni', 'Gianni']
        ] },
        { key: 'showCurrency', type: 'bool', label: 'Show converted prices' },
		{ key: 'blacklist', type: 'list', label: 'Blacklist stores', placeholder: 'exact store names, one per line' },
        { key: 'negativeKeywords', type: 'list', label: 'Negative keywords', placeholder: 'title substrings, e.g. gacha' },
        { key: 'maxPerStore', type: 'select', label: 'Max per store', options: [['-1', 'Off'], ['1', '1'], ['2', '2'], ['3', '3'], ['5', '5'], ['10', '10']] },
        { key: 'layoutEnabled', type: 'bool', label: 'Full-width layout' },
        { key: 'debug', type: 'bool', label: 'Debug log' },
    ];

    const UI_CSS = `
        #slmc-ui { position: relative; display: inline-block; }
        #slmc-ui .slmc-menu {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            width: 280px !important;
            min-width: 280px !important;
            max-width: 340px !important;
            margin: 0;
            padding: 6px 0;
            list-style: none;
            box-sizing: border-box;
            background: #ffffff;
            border: 1px solid #d9dde3;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            overflow: visible;
        }
        #slmc-ui .slmc-menu[aria-hidden="true"] { display: none !important; }
        #slmc-ui .slmc-menu[aria-hidden="false"] { display: block !important; }
        #slmc-ui .slmc-row { display: block; }
        #slmc-ui .slmc-row label {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            cursor: pointer;
            white-space: nowrap;
            font-size: 13px;
            color: #333;
        }
        #slmc-ui .slmc-row label:hover { background: rgba(0, 0, 0, 0.05); }
        #slmc-ui .slmc-row input[type="checkbox"] { margin: 0; flex: 0 0 auto; }
        #slmc-ui .slmc-row-select {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 16px;
            font-size: 13px;
            white-space: nowrap;
            color: #333;
        }
        #slmc-ui .slmc-row-select select { max-width: 90px; }
        #slmc-ui .slmc-row-list { padding: 8px 16px; }
        #slmc-ui .slmc-row-list-head {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #333;
            white-space: nowrap;
        }
        #slmc-ui .slmc-row-list .slmc-row-list-enable {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            margin: 0;
            padding: 0;
        }
        #slmc-ui .slmc-row-list-enable input[type="checkbox"] { margin: 0; }
        #slmc-ui .slmc-row-list-head .slmc-badge { margin-left: auto; }
        #slmc-ui .slmc-row-list.slmc-list-disabled { opacity: 0.5; }
        #slmc-ui .slmc-list-toggle, #slmc-ui .slmc-list-btn {
            background: #f0f2f4;
            border: 1px solid #d9dde3;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 12px;
            cursor: pointer;
            color: #333;
        }
        #slmc-ui .slmc-list-toggle:hover, #slmc-ui .slmc-list-btn:hover { background: #e2e6ea; }
        #slmc-ui .slmc-list-editor { margin-top: 6px; }
        #slmc-ui .slmc-list-editor textarea {
            width: 100%;
            box-sizing: border-box;
            font-size: 12px;
            padding: 4px 6px;
            border: 1px solid #d9dde3;
            border-radius: 4px;
            resize: vertical;
            color: #333;
            background: #fff;
        }
        #slmc-ui .slmc-list-actions { display: flex; gap: 6px; margin-top: 6px; }
        #slmc-ui .slmc-badge {
            margin-left: 6px; min-width: 18px; padding: 0 5px; border-radius: 9px;
            font-size: 11px; line-height: 18px; text-align: center;
            background: #e2e6ea; color: #4a5560;
        }
        #slmc-ui .slmc-badge-active { background: #0178BF; color: #fff; }
    `;

    const STORE_BTN_CSS = `
        button.slmc-store-bl-btn {
            display: block;
            width: 100%;
            margin: 8px 0 0;
            padding: 6px 10px;
            border: 1px solid #c5ccd3 !important;
            border-radius: 3px;
            background: #fafbfc !important;
            color: #5a6672 !important;
            font-size: 12px;
            font-weight: 400;
            line-height: 16px;
            box-sizing: border-box;
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
            text-align: center;
            text-decoration: none;
        }
        button.slmc-store-bl-btn:hover { background: #e2e6ea !important; color: #5a6672 !important; }
        button.slmc-store-bl-btn.slmc-bl-btn-done,
        button.slmc-store-bl-btn.slmc-bl-btn-done:hover {
            background: #fafbfc !important;
            border-color: #c5ccd3 !important;
            color: #5a6672 !important;
        }
    `;

    const LAYOUT_CSS = `
        html.slmc-layout { --max-page-width: 100vw; }
        html.slmc-layout #body-shadow-repeating {
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
        }
        html.slmc-layout #canvas #merchant-banner { float: none !important; width: auto !important; margin-right: 0 !important; }
        html.slmc-layout #centered-page {
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
        }
        html.slmc-layout #canvas { margin-left: 24px !important; margin-right: 24px !important; }
        html.slmc-layout #canvas #main-content { width: auto !important; max-width: none !important; }
        html.slmc-layout #canvas #search-results-container {
            width: auto !important;
            max-width: none !important;
            float: none !important;
            margin-left: 240px !important;
            display: flow-root !important;
        }
        html.slmc-layout .search-results-container {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            max-width: none !important;
            float: none !important;
            margin-left: 0 !important;
            display: flow-root !important;
        }
        html.slmc-layout #search-menu.search-menu { width: 220px !important; margin-right: 20px !important; }
        html.slmc-layout #search-results-container .product-listing.gallery,
        html.slmc-layout .search-results-container .product-listing.gallery { width: 100% !important; max-width: none !important; }
        html.slmc-layout .search-results-container .product-listing.gallery {
            display: block !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container {
            gap: 10px 8px !important;
            justify-content: flex-start !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item {
            width: 220px !important;
            height: 268px !important;
            max-width: 220px !important;
            flex-shrink: 0 !important;
            margin: 0 !important;
            border: 1px solid #ccc !important;
            border-radius: 0 !important;
            background: #fff !important;
            overflow: hidden !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item:hover {
            border-color: #ccc !important;
            box-shadow: none !important;
            transform: none !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .product-image {
            display: block !important;
            text-align: center !important;
            width: 220px !important;
            height: 165px !important;
            margin-bottom: 10px !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .product-image img {
            width: 100% !important;
            height: 100% !important;
            max-width: 220px !important;
            max-height: 165px !important;
            object-fit: contain !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .item-description-container {
            padding: 0 5px 10px 5px !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .item-description-container .item-description {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-top: 6px !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .item-description-container .subtitle1 {
            overflow-wrap: break-word !important;
            font-weight: bold !important;
            line-height: 100% !important;
            height: 27px !important;
            font-size: 14px !important;
            display: block !important;
            overflow: hidden !important;
            color: var(--color-black) !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .item-description-container .body2 {
            margin-top: 6px !important;
            height: 20px !important;
            overflow: hidden !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .item-description-container .item-description .title4 {
            font-weight: bold !important;
            font-size: 15px !important;
        }
        html.slmc-layout .search-results-container .gallery-item-container .gallery-item .item-description-container .item-description .product-review-stars {
            display: inline-flex !important;
            align-items: center !important;
            vertical-align: middle !important;
        }
        html.slmc-layout .search-results-container .featured-items-carousel .gallery-item-container .gallery-item {
            height: auto !important;
        }
        html.slmc-layout .search-results-container .featured-items-carousel {
            width: 100% !important;
            max-width: none !important;
            grid-column: 1 / -1 !important;
        }
        html.slmc-layout .search-results-container .featured-items-carousel .carousel-container {
            width: 100% !important;
            max-width: none !important;
        }
        html.slmc-layout .search-results-container .featured-items-carousel .gallery-item-container {
            gap: 10px 8px !important;
        }
        html.slmc-layout .sidebar-container { font-size: 12px !important; line-height: 16px !important; }
        html.slmc-layout .sidebar-container h4 { margin-bottom: 8px !important; }
        html.slmc-layout .sidebar-container .category-link a,
        html.slmc-layout .sidebar-container .category-link span,
        html.slmc-layout .sidebar-container .checkbox-container label,
        html.slmc-layout .sidebar-container label,
        html.slmc-layout .sidebar-container .subtitle1 { font-size: 12px !important; }
        html.slmc-layout .sidebar-container .category-link svg { width: 18px !important; height: 18px !important; }
        html.slmc-layout #merchant-metadata .merchant-photo img { width: 32px !important; height: 32px !important; }
        html.slmc-layout #merchant-metadata .merchant-title h5 { font-size: 14px !important; }
        html.slmc-layout #merchant-metadata .merchant-profile dt { font-size: 12px !important; padding-left: 8px !important; }
    `;

    const NIGHT_CSS = `
        html.slmc-night { color-scheme: dark; }
        html.slmc-night body,
        html.slmc-night #centered-page,
        html.slmc-night #canvas-container,
        html.slmc-night #canvas,
        html.slmc-night #main-content,
        html.slmc-night .layout__wrapper,
        html.slmc-night .layout__main {
            background-color: #15181e !important;
            color: #e6e9ef !important;
        }
        html.slmc-night a { color: #52c4ff !important; }
        html.slmc-night a:visited { color: #9aa2b1 !important; }
        html.slmc-night .product-listing.gallery .gallery-item,
        html.slmc-night .gallery-item-container .gallery-item,
        html.slmc-night .home-card,
        html.slmc-night .home-featured {
            background-color: #22262f !important;
            border-color: #3a404c !important;
            color: #e6e9ef !important;
        }
        html.slmc-night .search-results-container .gallery-item-container .gallery-item,
        html.slmc-night .featured-items-carousel .gallery-item-container .gallery-item {
            background-color: #22262f !important;
            border-color: #3a404c !important;
        }
        html.slmc-night .featured-items-carousel { background-color: #1b1f27 !important; }
        html.slmc-night .gallery-item .subtitle1,
        html.slmc-night .gallery-item .item-description-container .body2,
        html.slmc-night .gallery-item .store-item,
        html.slmc-night .sidebar-container,
        html.slmc-night .filter-options,
        html.slmc-night .range-container,
        html.slmc-night .breadcrumb,
        html.slmc-night .breadcrumb a,
        html.slmc-night .footer-paginate a,
        html.slmc-night .footer-paginate span { color: #cfd6e0 !important; }
        html.slmc-night .gallery-item .title4,
        html.slmc-night .item-description-container .item-description .title4,
        html.slmc-night .gallery-item a.product-title,
        html.slmc-night .item-description-container .subtitle1,
        html.slmc-night .item-description a,
        html.slmc-night #merchant-metadata .merchant-title h5,
        html.slmc-night .merchant-profile p,
        html.slmc-night .sidebar-container a,
        html.slmc-night .sorting-container,
        html.slmc-night .search-results-headers h1 { color: #e6e9ef !important; }
        html.slmc-night .sidebar-container .category-count { color: #9aa2b1 !important; }
        html.slmc-night #merchant-metadata .merchant-profile dt { color: #cfd6e0 !important; }
        html.slmc-night #marketplace-toolbar,
        html.slmc-night .layout__header,
        html.slmc-night .search-desktop,
        html.slmc-night .marketplace-tabs { color: #e6e9ef !important; }
        html.slmc-night .marketplace-tabs,
        html.slmc-night .marketplace-tabs .tab-container,
        html.slmc-night .marketplace-tabs .tab-headers,
        html.slmc-night .marketplace-tabs .sidebar-content,
        html.slmc-night .marketplace-tabs .sidebar,
        html.slmc-night .range-container,
        html.slmc-night .range-container .form-group {
            background-color: #1b1f27 !important;
            border-color: #3a404c !important;
        }
        html.slmc-night .marketplace-tabs .tab-header.selected { background-color: #2a2f3a !important; }
        html.slmc-night .tab-header { color: #9aa2b1 !important; }
        html.slmc-night .tab-header.selected { color: #e6e9ef !important; }
        html.slmc-night .search-input input,
        html.slmc-night input[type="text"],
        html.slmc-night input[type="search"],
        html.slmc-night input[type="number"],
        html.slmc-night textarea,
        html.slmc-night select { background-color: #22262f !important; color: #e6e9ef !important; border-color: #3a404c !important; }
        html.slmc-night input[type="checkbox"] { accent-color: #52c4ff; }
        html.slmc-night .popupmenu-button,
        html.slmc-night .sorting-container .popupmenu-button,
        html.slmc-night .result-sort-header-desktop .popupmenu-button { background: transparent !important; color: #e6e9ef !important; border-color: #3a404c !important; }
        html.slmc-night .menu { background-color: #22262f !important; border-color: #3a404c !important; }
        html.slmc-night .menu button { background: transparent !important; color: #e6e9ef !important; }
        html.slmc-night .marketplace-cart a { color: #e6e9ef !important; }
        html.slmc-night #slmc-ui .slmc-menu { background: #22262f !important; border-color: #3a404c !important; }
        html.slmc-night #slmc-ui .slmc-row label,
        html.slmc-night #slmc-ui .slmc-row-select,
        html.slmc-night #slmc-ui .slmc-row-list-head { color: #e6e9ef !important; }
        html.slmc-night #slmc-ui .slmc-list-editor textarea { background: #15181e !important; color: #e6e9ef !important; border-color: #3a404c !important; }
        html.slmc-night button.slmc-store-bl-btn { background: #22262f !important; border-color: #3a404c !important; color: #cfd6e0 !important; }
        html.slmc-night button.slmc-store-bl-btn:hover { background: #2a2f3a !important; color: #e6e9ef !important; }
    `;

    const NAV_TOGGLE_CSS = `
        button.slmc-nav-toggle {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            margin-left: 15px;
            padding: 4px 7px;
            background: transparent !important;
            border: none !important;
            border-radius: 4px;
            color: #b6b6b6 !important;
            line-height: 0;
            cursor: pointer;
            box-shadow: none !important;
            appearance: none;
            -webkit-appearance: none;
            font-size: 14px;
        }
        button.slmc-nav-toggle:hover { background: rgba(255, 255, 255, 0.08) !important; color: #ffffff !important; }
        button.slmc-nav-toggle:focus { outline: 1px solid #00bfff; background: rgba(255, 255, 255, 0.08) !important; }
        button.slmc-nav-toggle.slmc-nav-toggle-on { color: #00bfff !important; }
        button.slmc-nav-toggle svg { display: block; }
    `;

    const NAV_LAYOUT_ICON = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" fill="currentColor"/></svg>';
    const NAV_LAYOUT_OFF_ICON = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 2h4v12H6z" fill="currentColor"/></svg>';

    let uiBuilt = false;

    function buildRow(row) {
        const li = document.createElement('li');
        li.className = 'slmc-row';
        if (row.type === 'bool') {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.setting = row.key;
            const text = document.createElement('span');
            text.textContent = row.label;
            label.appendChild(input);
            label.appendChild(text);
            li.appendChild(label);
        } else if (row.type === 'select') {
            li.classList.add('slmc-row-select');
            const text = document.createElement('span');
            text.textContent = row.label;
            const select = document.createElement('select');
            select.dataset.setting = row.key;
            for (const [value, label] of row.options) {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                select.appendChild(opt);
            }
            li.appendChild(text);
            li.appendChild(select);
        } else if (row.type === 'list') {
            li.classList.add('slmc-row-list');
            const head = document.createElement('div');
            head.className = 'slmc-row-list-head';
            const enable = document.createElement('label');
            enable.className = 'slmc-row-list-enable';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.dataset.setting = row.key + 'Enabled';
            const text = document.createElement('span');
            text.textContent = row.label;
            enable.appendChild(toggleInput);
            enable.appendChild(text);
            const badge = document.createElement('span');
            badge.className = 'slmc-badge';
            badge.dataset.listBadge = row.key;
            badge.textContent = '0';
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'slmc-list-toggle';
            editBtn.dataset.listToggle = row.key;
            editBtn.textContent = 'Edit';
            head.appendChild(enable);
            head.appendChild(badge);
            head.appendChild(editBtn);
            li.appendChild(head);

            const editor = document.createElement('div');
            editor.className = 'slmc-list-editor';
            editor.dataset.listEditor = row.key;
            editor.hidden = true;
            const ta = document.createElement('textarea');
            ta.rows = 5;
            ta.placeholder = row.placeholder;
            const actions = document.createElement('div');
            actions.className = 'slmc-list-actions';
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'slmc-list-btn';
            saveBtn.dataset.listSave = row.key;
            saveBtn.textContent = 'Save';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'slmc-list-btn';
            cancelBtn.dataset.listCancel = row.key;
            cancelBtn.textContent = 'Cancel';
            actions.appendChild(saveBtn);
            actions.appendChild(cancelBtn);
            editor.appendChild(ta);
            editor.appendChild(actions);
            li.appendChild(editor);
        }
        return li;
    }

    function wireUI(root, button, menu) {
        function close() {
            menu.setAttribute('aria-hidden', 'true');
            button.setAttribute('aria-expanded', 'false');
        }
        function open() {
            document.querySelectorAll('.slmc-menu[aria-hidden="false"]').forEach(other => {
                other.setAttribute('aria-hidden', 'true');
                const b = document.querySelector(`[aria-controls="${other.id}"]`);
                if (b) b.setAttribute('aria-expanded', 'false');
            });
            menu.setAttribute('aria-hidden', 'false');
            button.setAttribute('aria-expanded', 'true');
        }

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (button.getAttribute('aria-expanded') === 'true') close();
            else open();
        });

        menu.addEventListener('click', (e) => e.stopPropagation());

        menu.addEventListener('change', (e) => {
            const input = e.target.closest('[data-setting]');
            if (!input) return;
            const value = input.type === 'checkbox' ? input.checked : input.value;
            setSetting(input.dataset.setting, value);
        });

        menu.addEventListener('click', (e) => {
            const toggle = e.target.closest('[data-list-toggle]');
            const save = e.target.closest('[data-list-save]');
            const cancel = e.target.closest('[data-list-cancel]');
            if (!toggle && !save && !cancel) return;
            const li = e.target.closest('.slmc-row-list');
            const editor = li.querySelector('.slmc-list-editor');
            const ta = editor.querySelector('textarea');
            if (toggle) {
                if (editor.hidden) {
                    ta.value = (settings[toggle.dataset.listToggle] || []).join('\n');
                    editor.hidden = false;
                    toggle.textContent = 'Close';
                    ta.focus();
                } else {
                    editor.hidden = true;
                    toggle.textContent = 'Edit';
                }
            } else if (save) {
                setSetting(save.dataset.listSave, parseListInput(ta.value));
                editor.hidden = true;
                li.querySelector('[data-list-toggle]').textContent = 'Edit';
            } else if (cancel) {
                editor.hidden = true;
                li.querySelector('[data-list-toggle]').textContent = 'Edit';
            }
        });

        document.addEventListener('click', (e) => {
            if (!root.contains(e.target)) close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
    }

    function ensureStyle(css, id) {
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function isLayoutPage() {
        const p = location.pathname;
        return p.startsWith('/products/search') || /^\/stores\/\d+(\/|$)/.test(p);
    }

    function ensureLayoutStyles() {
        ensureStyle(LAYOUT_CSS, 'slmc-layout-style');
        ensureStyle(NIGHT_CSS, 'slmc-night-style');
        ensureStyle(NAV_TOGGLE_CSS, 'slmc-nav-style');
    }

    function applyLayoutClass() {
        document.documentElement.classList.toggle('slmc-layout', isLayoutPage() && !!settings.layoutEnabled);
    }

    function refreshAppearance() {
        applyLayoutClass();
        document.documentElement.classList.remove('slmc-night');
        updateNavToggleButtons();
    }

    function updateNavToggleButtons() {
        const layoutBtn = document.getElementById('slmc-layout-toggle');
        if (layoutBtn) {
            const on = !!settings.layoutEnabled;
            layoutBtn.classList.toggle('slmc-nav-toggle-on', on);
            layoutBtn.innerHTML = on ? NAV_LAYOUT_ICON : NAV_LAYOUT_OFF_ICON;
            layoutBtn.title = on ? 'Full-width layout: ON' : 'Full-width layout: OFF';
        }
    }

    function addNavToggles() {
        const header = document.querySelector('nav.header');
        if (!header) return;
        ensureLayoutStyles();
        const existing = document.getElementById('slmc-layout-toggle');
        if (existing && existing.isConnected) return;
        ['slmc-layout-toggle', 'slmc-theme-toggle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        const layoutBtn = document.createElement('button');
        layoutBtn.type = 'button';
        layoutBtn.id = 'slmc-layout-toggle';
        layoutBtn.className = 'slmc-nav-toggle';
        layoutBtn.innerHTML = NAV_LAYOUT_ICON;
        layoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setSetting('layoutEnabled', !settings.layoutEnabled);
        });

        const host = header.querySelector('.nav__signed-in, .nav__signed-out') || header;
        if (host === header) {
            header.appendChild(layoutBtn);
        } else {
            const buyLd = header.querySelector('#navbar_buyld');
            if (buyLd) {
                host.insertBefore(layoutBtn, buyLd);
            } else {
                host.insertBefore(layoutBtn, host.firstChild);
            }
        }
        updateNavToggleButtons();
    }

    function injectUI() {
        if (uiBuilt) return;
        const container = document.querySelector('.sorting-container');
        if (!container) return;

        const root = document.createElement('div');
        root.className = 'popupmenu-container slmc-ui';
        root.id = UI_ID;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'popupmenu-button reset-button';
        button.id = 'slmc-ui-btn';
        button.setAttribute('aria-haspopup', 'true');
        button.setAttribute('aria-expanded', 'false');
        button.title = 'SL Marketplace Cleaner settings';

        const icon = document.createElement('span');
        icon.innerHTML = '<svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4H14.5M5.16667 8H11.8333M7.16667 12H9.83333" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        const label = document.createElement('span');
        label.className = 'label2';
        label.textContent = 'SL Cleaner';

        const badge = document.createElement('span');
        badge.className = 'slmc-badge';
        badge.id = 'slmc-badge';
        badge.textContent = '0';
        badge.title = 'Items hidden on this page';

        button.appendChild(icon);
        button.appendChild(label);
        button.appendChild(badge);

        const menu = document.createElement('ul');
        menu.className = 'menu slmc-menu';
        menu.id = 'slmc-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-hidden', 'true');

        for (const row of UI_ROWS) {
            menu.appendChild(buildRow(row));
        }

        root.appendChild(button);
        root.appendChild(menu);
        container.insertBefore(root, container.firstChild);

        ensureStyle(UI_CSS, 'slmc-ui-style');
        uiBuilt = true;        wireUI(root, button, menu);
        syncUIFromSettings();
        updateBadge();
    }

    function syncListBadges() {
        if (!uiBuilt) return;
        document.querySelectorAll('#slmc-ui [data-list-badge]').forEach(badge => {
            const key = badge.dataset.listBadge;
            const n = (settings[key] || []).length;
            badge.textContent = String(n);
            badge.classList.toggle('slmc-badge-active', n > 0);
        });
    }

    function syncUIFromSettings() {
        if (!uiBuilt) return;
        document.querySelectorAll('#slmc-ui [data-setting]').forEach(el => {
            const key = el.dataset.setting;
            if (el.type === 'checkbox') {
                el.checked = !!settings[key];
            } else if (el.type === 'select-one') {
                el.value = String(settings[key]);
            }
        });
        syncListBadges();
        document.querySelectorAll('#slmc-ui .slmc-row-list').forEach(li => {
            const cb = li.querySelector('input[type="checkbox"]');
            li.classList.toggle('slmc-list-disabled', cb ? !cb.checked : false);
        });
        const prefSelect = document.querySelector('#slmc-ui select[data-setting="preferredBody"]');
        if (prefSelect) prefSelect.disabled = !settings.collapseBodies;
    }

    function updateBadge() {
        if (!uiBuilt) return;
        const badge = document.getElementById('slmc-badge');
        if (!badge) return;
        const n = lastSummary ? lastSummary.hidden : 0;
        badge.textContent = String(n);
        badge.classList.toggle('slmc-badge-active', n > 0);
    }

    function ensureUI() {
        const container = document.querySelector('.sorting-container');
        if (!container) return;
        const existing = document.getElementById(UI_ID);
        if (existing && existing.isConnected) return;
        uiBuilt = false;
        injectUI();
    }

    let filterTimer = null;

    function onDomChange() {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => {
            ensureUI();
            applyFilters();
            addStoreBlacklistButton();
            addNavToggles();
        }, 50);
    }

    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
            onDomChange();
        }
    });

    function init() {
        refreshAppearance();
        ensureLayoutStyles();
        updateTitle();
        applyMarketplaceFilters();
        applyFilters();
        applyPrices();
        ensureUI();
        addStoreBlacklistButton();
        addNavToggles();
    }

    let initialized = false;

    function boot() {
        if (initialized) return;
        initialized = true;

        const start = () => {
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
            init();
        };

        if (document.readyState === 'loading') {
            window.addEventListener('load', start);
        } else {
            start();
        }
    }

    window.__SLMC = {
        isDemo,
        detectBody,
        shouldHideBody,
        variantStem,
        computeGroupKey,
        normalizeForDemo,
        normalizeTitle,
        slugToName,
        parseProductData,
        parseListInput,
        normalizeName,
        blacklistMatch,
        getSettings: () => ({ ...settings }),
        refreshAppearance,
        addNavToggles,
        updateNavToggleButtons,
    };

    boot();
})();
