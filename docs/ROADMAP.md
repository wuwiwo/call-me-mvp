# Call Me MVP 路线图与 Execution Task List

本文件是 Phase A 审计后的建议顺序，不代表已授权执行。Phase B 前应由 Human 选择任务。

## CM-002 验收记录

状态：PASS（2026-09-17）

- 代码修复：`0b14d70`，移除已有自定义按钮编辑路径中错误的 `.icon-selector` 访问。
- 独立验证：Chrome 152，`29 passed / 0 failed`。
- 反向验证：回退到缺陷版本后，步骤 4 按预期失败；恢复校验通过。
- 语法、lint、提交空白检查：通过。
- Prettier：失败，但修改前版本同样失败；属于既有格式基线问题，不计入 CM-002 缺陷修复失败。
- 可复核资产：`.cm002_tools/e2e.mjs`、`.cm002_tools/server.mjs`、`.cm002_tools/ACCEPTANCE.md` 及运行日志。

证据保留决定：验证脚本和报告应纳入版本控制；`server.log`、临时备份文件不应提交；会改写业务源码的 `negative.mjs` 只能在加强异常清理或改为临时副本方案后纳入长期工具集。

流程纠正：之前的“证据不存在”只能描述证据当时未在仓库中，不能归因于测试从未执行。之前的“31 项”更正为脚本实际运行时断言“29 项”。

## 建议改造顺序

```text
P1 可用性与数据可靠性
  -> P1 按钮编辑崩溃
  -> P1 LocalStorage 解析/回退
  -> P1 按钮 ID 兼容模型
  -> P1 动态 HTML 输入安全
P2 统一行为
  -> 冷却状态责任
  -> 历史页语言
  -> 回执生命周期
P2/P3 工程化
  -> 最小自动化测试
  -> format 基线
  -> CI
```

## 第一批任务卡

### TASK CM-002 — 修复已有自定义按钮编辑路径

PHASE: BugFix  
PRIORITY: P1

OBJECTIVE:
使包含已有自定义按钮和非 random 图标的按钮编辑模态框可以打开、修改、保存。

CONTEXT:
`buttonManager.addCustomButtonForm()` 生成 `.icon-picker`，但后续访问 `.icon-selector`。

SCOPE:

- `js/modules/buttonManager.js`
- 允许新增针对该模块的最小测试文件（若测试方案先获批准）

NON-GOALS:

- 不改变按钮上限、排序、默认文案或显示模式产品行为。
- 不重做按钮数据模型。

ACCEPTANCE CRITERIA:

- [ ] 已有自定义按钮可打开编辑。
- [ ] 非 random 与 random 图标都能正确回显并保存。
- [ ] 删除/新增按钮行为不回归。

VERIFICATION:

- `npm run lint`
- 手工：创建自定义按钮 -> 保存 -> 再次打开 -> 修改文字/图标 -> 保存 -> 刷新。

STATUS:

- [x] 代码修复完成
- [x] 29 项浏览器断言通过
- [x] 缺陷版本反向验证失败，证明测试具备区分力
- [x] Codex 独立复跑通过

### TASK CM-003 — 建立 LocalStorage 最小容错基线

PHASE: Engineering / BugFix  
PRIORITY: P1

OBJECTIVE:
让损坏的 `userProfile`、`buttonConfig`、`notificationHistory` 不阻断首页或历史页启动，并记录明确回退行为。

CONTEXT:
`state.js` 和 `history.js` 直接 JSON.parse；按钮配置已有局部 catch。

SCOPE:

- `js/modules/state.js`
- `js/modules/history.js`
- 必要时 `js/modules/buttonManager.js`
- 对应测试/测试说明

NON-GOALS:

- 不引入大型 Storage Layer。
- 不改变合法数据格式，不做无迁移的数据重写。

ACCEPTANCE CRITERIA:

- [ ] 非法 JSON 不阻止模块加载。
- [ ] 合法旧数据行为不变。
- [ ] 回退/清理策略有测试或可复现说明。

### TASK CM-004 — 固化按钮 ID 兼容规则

PHASE: Engineering  
PRIORITY: P1

OBJECTIVE:
定义并实现默认按钮稳定 ID、自定义按钮持久 ID 与旧 `default_N/custom_timestamp` 数据的兼容策略。

CONTEXT:
配置声明了 `quick_online`/`emergency`，保存逻辑却按数组位置生成默认 ID。

SCOPE:

- `js/modules/config.js`
- `js/modules/buttonManager.js`
- 相关测试/迁移说明

NON-GOALS:

- 不增加拖拽排序、导入导出或新按钮功能。

ACCEPTANCE CRITERIA:

- [ ] 默认按钮 ID 与配置稳定 ID 一致。
- [ ] 旧本地配置可读取且不会静默丢按钮。
- [ ] 重复保存同一自定义按钮不会无理由改变其 ID。

### TASK CM-005 — 消除动态用户输入 HTML 注入

PHASE: BugFix / Security  
PRIORITY: P1

OBJECTIVE:
确保昵称、按钮文字和历史字段以文本安全渲染，不执行用户输入中的 HTML。

SCOPE:

- `js/modules/buttonManager.js`
- `js/modules/history.js`
- 必要的测试

NON-GOALS:

- 不改变页面视觉结构或引入后端。

ACCEPTANCE CRITERIA:

- [ ] 用户输入 `<script>`/HTML 后以文本显示。
- [ ] 图标值仍受配置列表约束。
- [ ] 历史旧记录也安全显示。

## 后续候选任务

- CM-006：以测试覆盖的方式收敛 cooldown 单一责任。
- CM-007：补历史页语言初始化与多语言清除反馈。
- CM-008：定义 receipt 并发/取消语义并实现。
- CM-009：补最小测试脚本与 CI lint/test/format-check。
- CM-010：在 Human 明确威胁模型后决定 password/access gate 的保留与文案。

CM-009 还应包含测试资产治理：为长期保留的 E2E 脚本提供稳定命令、CI 可运行入口、跨机器 Chrome/浏览器配置，以及证据删除和日志脱敏规则。

## Go / No-Go

- Phase A：GO，审计文档与基线已生成。
- Phase B：GO for CM-003，CM-002 已通过代码和独立 E2E 验收；开始前仍应先规范化提交验证资产。
- Phase D 功能拓展：NO-GO，当前仍有 P1 核心问题、无自动化测试基线，暂不推进新功能。
