/* Call Me MVP — Service Worker（S5 PWA 准备，经典脚本，不用 import）
 *
 * 缓存策略（为什么不是全量「缓存优先」，见 docs/AI_HANDOFF.md 的 S5 报告）：
 *   1. 应用代码（html / css / js / manifest）：**网络优先**，失败回退缓存。
 *      原因：本项目无构建步骤、资源 URL 没有内容哈希（只有手写的 ?3.3），
 *      缓存优先会让改版后的代码被旧缓存挡住，线上「改了不生效」；
 *      网络优先保证联网时永远最新，断网时仍可离线打开。
 *   2. 不可变资源（icons / sounds / 版本化的 CDN 字体与图标 CSS）：**缓存优先**。
 *      这些 URL 要么是静态文件、要么自带版本号（/font-awesome/6.4.0/），改动即换 URL。
 *   3. JSONBin 回执（api.jsonbin.io）：**只走网络**，绝不写缓存 —— 回执是实时数据，
 *      缓存会让用户看到过期的已读状态；离线时让它自然失败，由 notification.js 兜底。
 *   4. 其余跨域请求（MacroDroid webhook 等）：SW 不拦截，直接放行。
 *
 * 更新策略：install 里 skipWaiting() + activate 里 clients.claim()
 * （新 SW 立即接管，无需等用户关闭所有标签页）。
 */

const CACHE = 'call-me-mvp-v1';

/* 预缓存清单：必须是仓库里真实存在的文件（cache.addAll 任一失败会导致整个 install 失败）。
 * 新增 js 模块后如果忘了加进来也没关系 —— 运行时会按「网络优先 + 运行时缓存」兜底；
 * 这里列全只是为了**首次安装即可完全离线**。 */
const PRECACHE = [
    './',
    './index.html',
    './history.html',
    './index.css',
    './history.css',
    './manifest.json',
    './js/sw-register.js',
    './js/main.js',
    './js/components/component.js',
    './js/components/iconPicker.js',
    './js/components/modal.js',
    './js/components/popupMenu.js',
    './js/modules/buttonManager.js',
    './js/modules/config.js',
    './js/modules/countdown.js',
    './js/modules/history.js',
    './js/modules/homeHistory.js',
    './js/modules/language.js',
    './js/modules/notification.js',
    './js/modules/onboarding.js',
    './js/modules/password.js',
    './js/modules/profile.js',
    './js/modules/sounds.js',
    './js/modules/state.js',
    './js/modules/theme.js',
    './js/modules/translations.js',
    './js/modules/utils.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './sounds/cat-meow.mp3',
    './sounds/default-click.m4a',
    './sounds/dog-bark.mp3',
    './sounds/error-notification.wav',
    './sounds/lion-roaring.mp3',
    './sounds/monkey-sound.wav',
    './sounds/success-notification.wav',
    './sounds/tiger-roar.wav'
];

/* 版本化的 CDN（URL 带版本号 → 内容不可变）→ 缓存优先 */
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
            )
            .then(() => self.clients.claim())
    );
});

function isJsonBin(url) {
    return url.hostname === 'api.jsonbin.io';
}

function isCdn(url) {
    return CDN_HOSTS.includes(url.hostname);
}

function matchCached(cache, request) {
    // ignoreSearch：index.html 引用的是 index.css?3.3，预缓存键是 ./index.css
    return cache.match(request, { ignoreSearch: true });
}

/** 网络优先；失败回退缓存；导航请求再兜底到缓存的 index.html（离线首页）。 */
async function networkFirst(request, { allowCache = true } = {}) {
    const cache = await caches.open(CACHE);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok && allowCache) {
            // allowCache=false（JSONBin）：既不读缓存也不写缓存
            cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
    } catch (err) {
        if (!allowCache) throw err;
        const cached = await matchCached(cache, request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
            const home = await cache.match('./index.html', { ignoreSearch: true });
            if (home) return home;
        }
        throw err;
    }
}

/** 缓存优先（不可变资源）；未命中才去网络并写入运行时缓存。 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const cached = await matchCached(cache, request);
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return; // webhook 等非 GET 直接放行

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    if (isJsonBin(url)) {
        // 回执实时数据：网络优先但不写缓存；失败时原样抛给页面处理
        event.respondWith(
            networkFirst(request, { allowCache: false }).catch(() => Response.error())
        );
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (isCdn(url)) {
        event.respondWith(cacheFirst(request).catch(() => Response.error()));
        return;
    }

    // 其余跨域请求不拦截（不调用 respondWith，走浏览器默认行为）
});
