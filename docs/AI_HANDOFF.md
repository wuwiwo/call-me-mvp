# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

**无活动任务**。所有 P1-P3 技术债已清零（CM-002~010 + GOV-002 + CM-001-TD-08/09 + 文档 666888 清理）。

剩余路线图项目见 `docs/ROADMAP.md`（Phase D 功能拓展，原标记 NO-GO，待 Human 决定是否推进新功能）。

## EXECUTION STATUS

```text
状态：IDLE — 无活动任务（代码侧）
设计侧已交付「主题切换」设计定稿，等待主 AI 规划与派发任务卡（代码未动）
当前分支：main（HEAD: 14ad5ea）
工作区：干净；check-worktree 缺失 0
远端：origin/main 落后本地 2 个提交（格式化 + TECH_DEBT 同步），待 push

已完成任务清单：
  CM-002（PASS）— 自定义按钮编辑崩溃修复
  CM-003（PASS）— LocalStorage JSON 容错
  CM-004（PASS）— 按钮 ID 兼容规则
  CM-005（PASS）— XSS 消除
  CM-006（PASS）— cooldown 单一责任收敛
  CM-007（PASS）— 历史页语言初始化 + 多语言清除反馈
  CM-008（PASS）— 回执轮询可取消与单一所有权
  CM-009（PASS）— 统一测试入口 + CI + Chrome 路径统一
  CM-010（CONDITIONAL PASS）— 访问提示威胁模型 + 单一来源 + 诚实文案
  GOV-002（PASS）— 守卫移出 tools/ + selfInstall + 三级回退
  CM-001-TD-08（PASS）— error 通知音效静默失败修复
  CM-001-TD-09（PASS）— format 基线达标（56 文件格式化 + .prettierignore）
  文档 666888 清理（PASS）— 9 处文档明文密码改为指向 config.js

设计侧交付（2026-09-20）：主题切换设计定稿 → docs/DESIGN_THEME_SWITCH.md
  内容：Human 四条定调 / 7 项设计定稿 / 画布资产索引 / 6 条布局令牌轴 /
        DOM 契约硬约束 / S1-S3 实施路径 / 5 项待决策
  状态：Human 已逐条拍板，代码零改动，仅新增 1 个文档
```

## EXECUTION REPORT

**代码侧：无活动任务。** 完整协作记录见归档目录 `docs/handoff/archive/`。

**设计侧交付（2026-09-20）**：主题切换的对照稿与定稿，已由 Human 逐条确认。
详情见 [`docs/DESIGN_THEME_SWITCH.md`](DESIGN_THEME_SWITCH.md)。

| 交付项 | 内容 |
|---|---|
| 修改文件 | 仅新增 `docs/DESIGN_THEME_SWITCH.md`；`docs/AI_HANDOFF.md` 的 EXECUTION STATUS / REPORT 两区块（外部 AI 可写范围） |
| 画布资产 | Ardot `727742261679190`：新增/改版 `18:1`(06 按钮列表主题)、`18:67`(07 对照)、`18:141`(08 更多菜单·顶部展开)。导出 PNG 在 `.workbuddy/design-exports/` |
| 设计定稿 | 单列全宽按钮列表 / 底部独立呼叫卡 / ⋯ 菜单从顶栏下方展开（56px 大行）/ 顶栏白色实底 + 8% 分隔线 / 薄荷渐变标题左对齐 |
| 被否方案 | 磁贴网格（对自定义内容不鲁棒）、底部动作面板（拇指行程远）、窄下拉菜单（触控目标 36px） |
| 硬约束 | DOM 契约被 `tools/*.mjs` 钉死 20 处（`#editButtons` / `.bubble-btn` / `#languageToggle`），主题只能改 CSS 排布，不能删改结构与 id |
| 已知问题 | ① `index.css` 61 行 + `history.css` 21 行硬编码色；② 薄荷标题对比度 2.9:1 / 1.6:1 低于 WCAG 3:1，未处理；③ 「查看通知历史」是设计提案，待确认 |
| 退出码 | 不适用（设计任务，未跑测试；代码零改动，`npm test` 无需重跑） |

建议主 AI 下一步：读 `docs/DESIGN_THEME_SWITCH.md` 第 4/5/6 节（令牌轴 / 硬约束 / S1-S3），
据此拆任务卡。推荐 S1 令牌化单独成卡（视觉零变化，最易验收）。

## REVIEW RESULT

**设计侧交付：收到**（2026-09-20）。主题切换设计定稿 `docs/DESIGN_THEME_SWITCH.md` 已审阅：

- 7 项设计定稿清晰，画布资产索引完整（Ardot 727742261679190，06/07/08 三屏）
- 6 条布局令牌轴定义准确（排列/顶栏形态/主卡包裹/标题尺度/进行中位置/顶栏材质）
- DOM 契约硬约束（tools/\*.mjs 钉死 20 处）已确认 —— 主题只能改 CSS 排布，不能删改结构与 id
- 已知风险（硬编码色 61+21 行、标题对比度不足 2.9:1/1.6:1）记录在案
- 建议实施路径 S1→S2→S3 合理，S1 令牌化视觉零变化最易验收

**主 AI 对 5 项待决策的建议**（等 Human 确认）：

| # | 待决策 | 主 AI 建议 | 理由 |
|---|---|---|---|
| 1 | 历史入口「查看通知历史」是否纳入 | **纳入 S3** | history.html 真实存在，加一个链接不增加复杂度 |
| 2 | 薄荷标题对比度怎么修 | **方案① 同色相加深** `#0A7D5F→#0E9673` | 方案②深玻璃带引入深色背景，与「不做深色模式」矛盾；方案①保持浅色系且 ≥3.3:1 |
| 3 | 首发主题数量 | **先 2 个**（现状气泡列表 + 新按钮列表） | 验证令牌化 + 切换机制后再扩展，降低风险 |
| 4 | 是否跟随 prefers-color-scheme | **作废** | Human 已排除深色模式 |
| 5 | S1 是否独立任务卡 | **是** | 视觉零变化最易验收，是 S2/S3 的前提 |

---

**CM-001-TD-09：PASS**（2026-09-20）。56 文件格式化 + .prettierignore。

**CM-001-TD-08：PASS**。详见 [`docs/handoff/archive/CM-001-TD-08.md`](handoff/archive/CM-001-TD-08.md)。

**CM-010：CONDITIONAL PASS**。详见 [`docs/handoff/archive/CM-010.md`](handoff/archive/CM-010.md)。

**GOV-002：PASS**。详见 [`docs/handoff/archive/GOV-002.md`](handoff/archive/GOV-002.md)。

## NEXT ACTION

等 Human 对 5 项待决策拍板（主 AI 建议见上方表格）。拍板后：

1. 主 AI 提交设计文档 + AI_HANDOFF 更新到 main
2. 写 S1 任务卡（令牌化：index.css 61 行 + history.css 21 行硬编码色收敛为语义令牌，视觉零变化）
3. 派发外部 AI 执行 S1
4. 验收 S1 → 合并 → S2 → S3

**Phase D 原 NO-GO 的两个前提已满足**：P1-P3 技术债全清零（CM-002~010 + GOV-002 + TD-08/09）+ 自动化测试基线（10 套件 537 项断言 + CI）。Phase D 可以 GO。

**外部 AI 暂无任务**。等 Human 对 5 项待决策拍板后，主 AI 写 S1 任务卡并派发。

**网络提示**：github.com 直连 push 间歇性失败（`SSL_ERROR_SYSCALL`），带代理 `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main` 可用。
