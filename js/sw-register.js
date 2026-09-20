/* S5 PWA：Service Worker 注册。
 *
 * - 本文件放 <head> 末尾（module 脚本自带 defer，不阻塞解析），但真正的注册
 *   等到 window 的 load 事件之后 —— 首屏资源优先，注册不与首屏抢路（任务卡要求）。
 * - register 用**相对路径** './sw.js'：线上是 GitHub Pages 的子路径部署
 *   （https://wuwiwo.github.io/call-me-mvp/），写死 '/sw.js' 会 404；
 *   相对路径在本地根路径服务器与线上子路径下都指向同一个文件。
 * - 注册失败只 console.warn：PWA 是增强能力，不是功能依赖，绝不能影响产品。
 *   （file:// 协议下没有 serviceWorker，特性检测已兜住。）
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('[pwa] service worker 注册失败（不影响使用）:', err);
        });
    });
}
