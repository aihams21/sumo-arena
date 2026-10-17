/**
 * Neon Sumo Arena — internationalisation.
 *
 * The UI used to be a single hardcoded mix of English and Arabic, so a player
 * who wanted the other language simply could not have it. This module adds a
 * real string table plus a toggle.
 *
 * Design notes:
 * - Keys are dotted paths (`menu.title`) so a missing key is obvious in the
 *   console instead of silently rendering a blank element.
 * - `t()` returns the key itself when a string is missing. A visible key is
 *   better than a blank button: it says exactly what to fix.
 * - Translation is applied to text nodes and to a fixed set of attributes
 *   (`placeholder`, `title`, `aria-label`), so form fields and tooltips are
 *   covered too, not just headings.
 * - `data-i18n` is optional. A node with no marker keeps whatever text it was
 *   authored with, which is how the coin and score counters keep working.
 */
(() => {
    'use strict';

    const STORAGE_KEY = 'sumo_lang';
    const DEFAULT_LANG = 'en';

    const STRINGS = {
        en: {
            'menu.title': 'NEON SUMO ARENA',
            'menu.coins': 'COINS',
            'menu.streak': 'WIN STREAK',
            'menu.rank': 'RANK',
            'menu.dailyRush': '⚡ DAILY RUSH',
            'menu.stageMap': '🗺️ Stage Map (1000 Waves)',
            'menu.gameModes': 'NEON GAME MODES',
            'menu.skins': '🛍️ Skins & Shop',
            'menu.leaderboard': '🏆 Live Hall of Fame',
            'menu.install': '📲 Install App',
            'menu.multiplayer': '🎮 Multiplayer',
            'menu.exit': 'Exit',
            'mode.chaos': 'CHAOS ARENA',
            'mode.chaos.sub': '6 bots • 185 radius',
            'mode.time': 'TIME ATTACK',
            'mode.time.sub': '60 seconds • score rush',
            'mode.shrink': 'SHRINKING ARENA',
            'mode.shrink.sub': '250 → 125 • 2/sec',
            'common.close': 'Close',
            'common.cancel': 'Cancel',
            'common.coins': '🪙',
            'lang.toggle': '🌐 العربية',
            'lang.toggle.title': 'Switch language / تبديل اللغة'
        },
        ar: {
            'menu.title': 'سومو الدائرة النيونية',
            'menu.coins': 'العملات',
            'menu.streak': 'سلسلة الفوز',
            'menu.rank': 'الترتيب',
            'menu.dailyRush': '⚡ اندفاع اليوم',
            'menu.stageMap': '🗺️ خريطة المراحل (1000 مرحلة)',
            'menu.gameModes': 'أوضاع اللعب',
            'menu.skins': '🛍️ السكنات والمتجر',
            'menu.leaderboard': '🏆 لوحة الأبطال',
            'menu.install': '📲 تثبيت التطبيق',
            'menu.multiplayer': '🎮 لعب جماعي',
            'menu.exit': 'خروج',
            'mode.chaos': 'ساحة الفوضى',
            'mode.chaos.sub': '6 بوتات • نصف قطر 185',
            'mode.time': 'هجوم الوقت',
            'mode.time.sub': '60 ثانية • سباق النقاط',
            'mode.shrink': 'ساحة تتقلص',
            'mode.shrink.sub': '250 ← 125 • 2/ثانية',
            'common.close': 'إغلاق',
            'common.cancel': 'إلغاء',
            'common.coins': '🪙',
            'lang.toggle': '🌐 English',
            'lang.toggle.title': 'Switch language / تبديل اللغة'
        }
    };

    /** Attributes that may carry translatable text. */
    const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

    function normalise(lang) {
        return lang === 'ar' ? 'ar' : DEFAULT_LANG;
    }

    function current() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'ar' || saved === 'en') return saved;
        } catch (_error) {
            // Private mode / storage disabled: fall through to the browser.
        }
        const browser = (typeof navigator !== 'undefined' && navigator.language) || '';
        return normalise(browser.slice(0, 2).toLowerCase());
    }

    let active = current();

    function t(key) {
        const table = STRINGS[active] || STRINGS[DEFAULT_LANG];
        if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
        const fallback = STRINGS[DEFAULT_LANG];
        if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
        // A visible key beats a blank element — it names exactly what is missing.
        return key;
    }

    /**
     * Translate one element. Text nodes are replaced only when the element is
     * marked with `data-i18n`; attributes listed in ATTRIBUTES are translated
     * whenever a `data-i18n-<attr>` marker is present.
     */
    function applyTo(element) {
        if (!element || element.nodeType !== 1) return;

        const key = element.getAttribute('data-i18n');
        if (key) {
            element.textContent = t(key);
        }

        for (const attribute of ATTRIBUTES) {
            const attributeKey = element.getAttribute(`data-i18n-${attribute}`);
            if (attributeKey) element.setAttribute(attribute, t(attributeKey));
        }
    }

    /** Translate the whole document. Safe to call repeatedly. */
    function apply(root) {
        const scope = root || document;
        if (!scope || typeof scope.querySelectorAll !== 'function') return active;
        scope.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]')
            .forEach(applyTo);
        syncDocumentLanguage();
        return active;
    }

    /** Keep `<html lang>` and `dir` in step with the chosen language. */
    function syncDocumentLanguage() {
        if (typeof document === 'undefined' || !document.documentElement) return;
        const root = document.documentElement;
        root.setAttribute('lang', active);
        root.setAttribute('dir', active === 'ar' ? 'rtl' : 'ltr');
    }

    function setLanguage(lang) {
        active = normalise(lang);
        try {
            localStorage.setItem(STORAGE_KEY, active);
        } catch (_error) {
            // Storage is unavailable; the language still applies for this page.
        }
        apply();
        return active;
    }

    function toggle() {
        return setLanguage(active === 'ar' ? 'en' : 'ar');
    }

    /** Wire up every `[data-lang-toggle]` button on the page. */
    function bindToggleButtons() {
        document.querySelectorAll('[data-lang-toggle]').forEach(button => {
            button.addEventListener('click', event => {
                event.preventDefault();
                toggle();
            });
        });
    }

    /**
     * Keep toggle buttons in sync when a button is rendered after boot (the
     * shop, the stage map and the sidebar all rebuild their markup), and when
     * some other code calls setLanguage directly.
     */
    function keepToggleLabelsCurrent() {
        document.querySelectorAll('[data-lang-toggle]').forEach(button => {
            applyTo(button);
        });
    }

    window.NeonSystems = window.NeonSystems || {};
    window.NeonSystems.i18n = {
        STORAGE_KEY,
        DEFAULT_LANG,
        STRINGS,
        t,
        apply,
        applyTo,
        setLanguage,
        toggle,
        bindToggleButtons,
        keepToggleLabelsCurrent,
        current: () => active
    };
})();