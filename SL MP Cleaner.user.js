// ==UserScript==
// @name         SL Marketplace Cleaner
// @namespace    slmarketplace
// @version      0.56
// @description  Clean up Second Life Marketplace search results
// @match        https://marketplace.secondlife.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_SETTINGS = {
        blacklist: [],
        negativeKeywords: [],
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
        return item.brand.toLowerCase() + '|' + (body ? 'B' : 'C') + '|' + stem + demoFlag;
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
        if (name !== null) data.name = decodeEntities(name);
        if (brand !== null) data.brand = decodeEntities(brand);
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
        const brand = item.brand.toLowerCase();

        if (item.brand && settings.blacklist.some(b => brand === b.toLowerCase())) {
            return 'blacklist';
        }
        if (settings.hideDemos && isDemo(item.name)) {
            return 'demo';
        }
        if (settings.negativeKeywords.some(kw => kw && name.includes(kw.toLowerCase()))) {
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

    function addConvertedPrices() {
        document.querySelectorAll('.title4').forEach(el => {
            if (el.querySelector('.slmc-converted')) return;
			const match = el.textContent.match(/L\$\s*([\d.,\s]+)/);
            if (!match) return;
			const value = parseInt(match[1].replace(/[\s.,]/g, ''), 10);
            const span = document.createElement('span');
            span.className = 'slmc-converted';
            span.textContent = ' (' + convertPrice(value) + ')';
            el.appendChild(span);
        });
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
        { key: 'maxPerStore', type: 'select', label: 'Max per store', options: [['-1', 'Off'], ['1', '1'], ['2', '2'], ['3', '3'], ['5', '5'], ['10', '10']] },
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
        #slmc-ui .slmc-badge {
            margin-left: 6px; min-width: 18px; padding: 0 5px; border-radius: 9px;
            font-size: 11px; line-height: 18px; text-align: center;
            background: #e2e6ea; color: #4a5560;
        }
        #slmc-ui .slmc-badge-active { background: #0178BF; color: #fff; }
    `;

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

        document.addEventListener('click', (e) => {
            if (!root.contains(e.target)) close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
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

        const style = document.createElement('style');
        style.textContent = UI_CSS;
        document.head.appendChild(style);

        uiBuilt = true;
        wireUI(root, button, menu);
        syncUIFromSettings();
        updateBadge();
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
        }, 50);
    }

    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
            onDomChange();
        }
    });

    function init() {
        updateTitle();
        applyMarketplaceFilters();
        applyFilters();
        applyPrices();
        ensureUI();
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
        getSettings: () => ({ ...settings }),
    };

    boot();
})();
