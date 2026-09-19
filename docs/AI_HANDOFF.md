# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-007 — 补历史页语言初始化与多语言清除反馈

PHASE: UX Consistency / BugFix
PRIORITY: P2

OBJECTIVE:

让 `history.html` 使用与首页相同的语言设置和翻译系统，历史页标题、返回/清除控件、空状态、错误 Webhook 文案和清除成功反馈随当前语言显示，并保持历史数据渲染与清除行为不变。

CONTEXT:

`history.html` 当前只直接初始化 `history.js`，没有初始化 `language.js`；页面标题、返回/清除按钮标题、顶部标题和 `history.clear()` 的 toast 仍写死为中文。`history.js` 已通过 `utils.getTranslation('history.empty')` 使用部分翻译，但历史页没有统一语言初始化入口。

SCOPE:

- `history.html`
- `js/modules/history.js`
- `js/modules/language.js`（如为安全复用语言初始化所必需）
- `js/modules/translations.js`
- 必要的历史页零依赖回归脚本、测试说明和本通信文档

NON-GOALS:

- 不改变历史记录 LocalStorage 格式、排序、状态 class、XSS 防护或清除数据语义。
- 不重做首页语言下拉菜单，不新增语言种类，不修改无关模块文案。
- 不引入框架、构建步骤或新的运行时依赖。
- 不顺手修复格式化基线、回执、cooldown 或其他路线图任务。

IMPLEMENTATION REQUIREMENTS:

1. 历史页加载时读取既有 `appLanguage`；缺失或不支持时沿用现有语言回退规则。
2. 复用现有 `TRANSLATIONS` / `utils.getTranslation` 体系，不建立第二份语言状态或重复翻译表。
3. 至少覆盖历史页文档标题、顶部标题、返回按钮 title、清除按钮 title、空状态、错误 Webhook 标签和清除成功 toast；翻译键命名保持可读且四种现有语言完整。
4. `history.html` 在有记录、无记录、清除后和非法/未知历史字段场景均不抛异常；清除后仍移除 `notificationHistory` 并重新渲染空状态。
5. 若 `language.init()` 需要扩展为支持历史页的部分 DOM，必须保持首页初始化行为不变，避免访问不存在的元素。
6. 用户可控历史字段继续通过安全 DOM API 渲染；不得恢复动态 HTML 注入路径。

ACCEPTANCE CRITERIA:

- [ ] `appLanguage=zh/en/ja/ko` 时历史页所有指定静态文案和反馈均显示对应语言。
- [ ] 未设置或非法语言时使用既有默认语言，不阻断历史页加载。
- [ ] 历史记录、空状态、错误 Webhook 行和清除动作在四种语言下均正常。
- [ ] 清除按钮只清除 `notificationHistory`，不会改动其他 LocalStorage 数据。
- [ ] CM-002/003/004/005/006 行为不回归，历史输入安全仍通过。
- [ ] 新增历史页语言回归脚本可复跑，记录准确断言数、环境、退出码和失败项。
- [ ] `node tools/check-worktree.mjs`、`npm run lint`、`git diff --check` 通过，且修改范围受控。

VERIFICATION:

1. 运行任务新增的历史页语言回归脚本，覆盖四种语言、默认回退、空状态、记录渲染、错误状态和清除 toast。
2. 运行 `node tools/check-worktree.mjs`，确认没有已跟踪文件缺失。
3. 运行已有 `tools/input-safety.mjs`、`tools/cooldown.mjs`、`tools/button-ids.mjs`、`tools/storage-resilience.mjs` 和 `tools/e2e.mjs`。
4. 运行 `npm run lint`、`git diff --check`，检查完整 diff 和实际修改范围。

BRANCH:

从当前本地 `main` 的稳定提交 `c9dce0e` 创建并使用：`codex/cm007-history-language`。外部 AI 开工前必须用 `git rev-parse --short HEAD` 确认实际稳定 HEAD；不要直接修改或合并 `main`。

## EXECUTION STATUS

```text
状态：DISPATCHED — 等待外部 Execution AI 接受并执行
任务分支：codex/cm007-history-language
任务基线：c9dce0e（CM-006 已合并并在 main 上独立复验通过）
当前工作分支：main
main 与 origin/main：本地包含已验收但尚未推送的文档/任务提交；工作区干净
已跟踪文件缺失数：0
CM-006：PASS，已合并到 main；合并后 cooldown 87/87，既有回归全部通过
```

## EXECUTION REPORT

等待外部 AI 按任务卡执行。外部 AI 完成后必须写入修改文件、实现摘要、测试命令、完整结果、退出码、已知问题和 commit；报告不等于主 AI 验收通过。

## REVIEW RESULT

CM-006：PASS，已合并并完成合并后复验。

CM-007：尚未验收。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，确认实际 `HEAD` 后创建 `codex/cm007-history-language`，按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。不要修改或合并 `main`。
