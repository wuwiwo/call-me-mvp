# Call Me MVP — AGENTS.md

## 适用范围

本文件适用于仓库根目录及其所有子目录。它描述当前项目的真实约束和 Execution Agent 的工作方式；若用户给出更具体、更新的任务要求，以用户要求为准。

## 项目概览

Call Me MVP 是一个纯前端静态通知工具：用户设置昵称和 Emoji，点击首页按钮后通过 Fetch GET 请求向 MacroDroid webhook 发送通知。项目使用原生 JavaScript ES Modules、HTML、CSS 和 LocalStorage，无前端框架、无构建步骤、无后端。

主要入口与模块：

- `index.html`：主页面，加载 `js/main.js`。
- `history.html`：历史页面，直接初始化 `js/modules/history.js`。
- `js/main.js`：创建 `CallMeApp`，收集 DOM 并初始化模块。
- `js/modules/config.js`：webhook、JSONBin、冷却、按钮、音效及功能配置。
- `js/modules/state.js`：运行时资料、语言、点击权限和请求状态；模块导入时会立即初始化。
- `js/modules/buttonManager.js`：按钮配置、首页按钮渲染、按钮编辑和点击入口。
- `js/modules/notification.js`：webhook、toast、历史记录和已读回执轮询。
- `js/modules/countdown.js`：冷却倒计时。
- `js/modules/profile.js`、`language.js`、`password.js`、`onboarding.js`、`sounds.js`：资料、语言、访问提示、新手引导和音效。

详细审计基线见：

- `docs/PROJECT_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_FLOW.md`
- `docs/TECH_DEBT.md`
- `docs/ROADMAP.md`

## 工作原则

1. 先阅读和验证，再修改。
2. 一个任务只处理一个主要逻辑主题，保持文件范围小、可验证、可回滚。
3. 不根据其他 AI 的判断直接修改；必须用源码、配置、测试或 Git diff 验证。
4. 不擅自扩大范围，不顺手修复未纳入任务的问题。发现范围外问题时记录并报告。
5. 保持现有产品行为，除非任务明确要求改变；任何行为变化都要说明兼容性和回滚风险。
6. 不引入大型抽象或依赖，除非能说明它解决的具体问题、复用场景和复杂度收益。
7. 不修改、提交或删除用户已有的无关改动。

## 主 AI 与执行 AI 协作流程

本项目采用主 AI 调度、执行 AI 实施、主 AI 验收的闭环。Human 不需要在主 AI 与执行 AI 之间复制粘贴消息。

```text
Human 确认任务范围
       ↓
主 AI 编写任务卡并派发执行 AI
       ↓（内部消息）
执行 AI 阅读规则、修改代码、运行验证
       ↓（内部消息 + 修改结果）
主 AI 检查 diff、源码、副作用和测试
       ├─ 不通过 → 发回执行 AI 定向返工
       └─ 通过   → 记录验收结果，等待下一个任务
```

### 主 AI 的职责

- 判断当前任务是否已经具备明确范围和验收标准。
- 创建并派发一张独立任务卡，不把多个主题混在一起。
- 通过内部 Agent 通道向执行 AI 传递任务和补充信息。
- 收到结果后重新检查实际修改，不仅依据执行 AI 的文字报告。
- 决定 PASS、Conditional PASS 或退回返工，并向 Human 汇报。

### 执行 AI 的职责

- 先阅读 `AGENTS.md` 和任务指定的源码/文档。
- 只修改任务卡 Scope 内的文件和行为。
- 自己运行任务要求的验证，并返回准确命令、输出、退出码和剩余问题。
- 完成后报告修改文件、实现摘要、测试结果、已知问题和 commit。
- 发现范围外问题只报告，不擅自修复或改变架构。

### 状态与返工

任务状态按以下顺序推进：

```text
DISPATCHED → IN_PROGRESS → READY_FOR_REVIEW
                              ↓
                    PASS / CONDITIONAL_PASS
                              ↓
                       NEXT_TASK

READY_FOR_REVIEW → NEEDS_REWORK → IN_PROGRESS
```

- 执行 AI 报告“完成”不等于任务通过；只有主 AI 完成 Review 后才算验收。
- 如果测试失败、范围越界、证据不足或发现回归，主 AI 直接通过内部消息退回具体问题。
- Human 只需要确认任务范围、冲突决策或高风险变更；不承担消息中转工作。
- 没有明确任务卡时，主 AI 不应为了“让其他 AI 工作”而随意创建执行代理。

## 外部软件 AI 的协作方式

如果执行 AI 运行在另一个软件中，它不是当前 Codex 会话的内部子代理，不能直接通过本项目的内部 Agent 通道收发消息。除非该软件提供已连接的 API、插件或共享通信通道，否则不能承诺两个 AI 之间存在实时直接对话。

本项目默认使用共享工作区、Git 和唯一通信文档作为无复制粘贴的交接机制：

```text
主 AI
  -> 写入 docs/AI_HANDOFF.md 的 CURRENT TASK
  -> 创建 codex/cm-xxx-* 分支或指定执行分支

外部 AI
  -> 读取 docs/AI_HANDOFF.md 和 AGENTS.md
  -> 在指定分支修改代码
  -> 更新 docs/AI_HANDOFF.md 的 EXECUTION STATUS / EXECUTION REPORT
  -> 提交 commit

主 AI
  -> 读取同一文档和 Git diff
  -> 运行独立验证
  -> 更新 REVIEW RESULT / NEXT ACTION
```

### 唯一通信文档

主 AI 与外部软件 AI 统一使用 `docs/AI_HANDOFF.md` 进行任务交接和状态交流。该文件是唯一通信文档，Human 不需要在两个 AI 之间复制粘贴长消息。

通信文档必须包含以下部分：

```text
CURRENT TASK
EXECUTION STATUS
EXECUTION REPORT
REVIEW RESULT
NEXT ACTION
```

规则：

- 主 AI 在 `CURRENT TASK` 写入任务目标、Scope、Non-Goals 和验收标准。
- 外部 AI 在 `EXECUTION STATUS` 更新接受、进行中、阻塞或待验收状态。
- 外部 AI 在 `EXECUTION REPORT` 写入修改文件、测试结果、退出码、已知问题和 commit。
- 主 AI 在 `REVIEW RESULT` 写入 PASS、CONDITIONAL PASS 或 NEEDS REWORK 及具体意见。
- 主 AI 在 `NEXT ACTION` 写入下一步；外部 AI 只执行明确写出的动作。
- 新任务开始时，主 AI 更新同一个 `docs/AI_HANDOFF.md`，不再为同一轮任务要求 Human 转发独立长报告。
- 历史任务的完整验收证据可以保留在 `tools/` 或其他归档文档，但当前协作状态只以 `docs/AI_HANDOFF.md` 为准。
- 如果该文件没有待执行任务，外部 AI 必须保持待命，不得自行修改代码。

### 外部 AI 任务交接协议

主 AI 派发任务时必须：

1. 将完整任务卡写入 `docs/AI_HANDOFF.md` 的 `CURRENT TASK`。
2. 在该区域写明分支、Scope、Non-Goals、Acceptance Criteria 和 Verification。
3. 告诉 Human 只需让外部 AI“读取并执行 `docs/AI_HANDOFF.md`”，不需要复制任务正文。

外部 AI 完成任务时必须：

1. 读取 `AGENTS.md` 和任务文件。
2. 不直接修改 `main`，除非 Human 明确授权。
3. 将结果写入 `docs/AI_HANDOFF.md` 的 `EXECUTION REPORT`，包括修改文件、测试命令、完整结果、退出码、已知问题和 commit。
4. 保留长期有价值的测试脚本；删除证据或复现脚本前必须先报告。

主 AI 验收时必须：

1. 读取任务报告，但不把报告视为自动通过。
2. 检查分支和 diff，重新阅读关键源码。
3. 独立运行关键验证；对于只在外部软件中运行过、没有落盘证据的测试，标记为不可复核。
4. 将 PASS、CONDITIONAL PASS 或 NEEDS REWORK 写回 `docs/AI_HANDOFF.md` 的 `REVIEW RESULT`。

### 不能共享工作区时

如果外部 AI 既没有当前仓库访问权限，也没有 Git 远端/API/插件通信能力，则无法做到真正的无中转协作。此时只能使用用户转发消息、补丁、commit 或报告；主 AI 不应假装已经收到外部 AI 的结果。

### Human 短指令协议

Human 不需要复制任务正文或执行 AI 报告。只需向主 AI 发送以下短指令之一：

```text
查看当前状态
继续当前任务
开始 CM-XXX
验收当前分支
退回返工
暂停任务
```

主 AI 收到短指令后负责读取工作区、`docs/AI_HANDOFF.md`、分支和 Git 状态，并执行相应动作。需要唤醒外部 AI 时，Human 只需向外部 AI 发送固定激活语句：

```text
请读取仓库中的 AGENTS.md 和 docs/AI_HANDOFF.md，按 CURRENT TASK 执行；完成后更新同一文档的 EXECUTION STATUS 和 EXECUTION REPORT，并等待主 AI 验收。不要直接修改或合并 main。
```

任务切换时，主 AI 直接更新 `docs/AI_HANDOFF.md` 的 `CURRENT TASK`；外部 AI 不应要求 Human 再次转发任务正文。外部 AI 的长报告只需更新同一文档，主 AI 通过文件和 Git diff 读取，不依赖 Human 转发。

### PR 门禁

- 外部 AI 完成代码、验证、证据和提交后，可以创建 PR，但必须停在“待主 AI Review”状态。
- 主 AI 负责 Review、独立验证、记录 PASS/NEEDS REWORK，并向 Human 报告是否建议合并。
- PR 合并属于 Human 的明确门禁；在 Human 明确授权前，主 AI 和外部 AI 都不自动 merge。
- 新任务原则上从已验收并合并的基线开始；若必须基于未合并 PR 开工，任务报告必须明确依赖关系和合并顺序。

## 明确禁止的未经授权操作

- 不迁移框架、语言、部署方式或引入后端。
- 不重写全部代码、不删除现有功能、不改变 webhook 协议。
- 不改变已有 LocalStorage 数据格式而不提供兼容策略或迁移说明。
- 不把纯前端密码、编码值或 hash 描述成真正的 Secret Protection。
- 不运行批量格式化、依赖安装、部署、推送或其他会产生明显外部/大范围变更的操作，除非任务明确要求。

## 当前数据与安全边界

LocalStorage key：

- `userProfile`：`{ nickname, emoji }`
- `buttonConfig`：按钮数组和 `activeGroup`
- `appLanguage`：语言代码
- `lastClickTime`：冷却起始时间戳
- `notificationHistory`：历史数组，最多由 `CONFIG.maxHistoryRecords` 限制为 100 条
- `buttonDisplayMode`：`default` 或 `minimal`
- `accessPassword`、`passwordSetTime`：前端密码和时间戳
- `onboardingCompleted`：引导完成标记

重要约束：

- 读取 JSON 必须考虑非法或损坏数据；不要假设 LocalStorage 永远有效。
- 用户昵称、按钮文字、历史字段属于可控输入。通过 DOM 写入时不得未经转义地进入 `innerHTML`。
- webhook URL 和前端密码对访问页面的用户可见。密码模块只能是 UI 级个人工具访问提示，不是服务端授权。
- 已读回执读取 JSONBin 公开 endpoint；不要在前端加入 Master Key 或其他秘密凭据。

## 已知高风险区域

修改以下区域时必须先阅读对应审计文档并补回归验证：

- `buttonManager.js`：已有自定义按钮编辑路径曾访问不存在的 `.icon-selector`；实际控件是 `.icon-picker`。
- `buttonManager.js`：保存时默认按钮 ID 会被按位置生成 `default_1` 等，自定义 ID 会按时间生成；不要无迁移地改变旧配置语义。
- `state.js`、`history.js`、`buttonManager.js`：LocalStorage JSON 解析容错不一致。
- `buttonManager.js`、`history.js`：动态 HTML 可能承载用户输入。
- `state.js`、`main.js`、`buttonManager.js`、`notification.js`、`countdown.js`：冷却状态和时间戳由多个模块共同维护。
- `history.html`：当前只加载 `history.js`，没有初始化首页的 `language.js`。
- `notification.js`：所有已读回执轮询共享 `#receiptStatus`，轮询 timer 当前不可取消。
- `config.js` 与 `password.js`：密码配置存在重复定义；音效配置没有明确的 error 音效资源。

## 修改流程

### 开始前

- 阅读相关源码、调用方、页面 DOM、配置和现有文档。
- 查看 `git status`，确认工作区已有改动并避开无关文件。
- 明确任务的 Objective、Scope、Non-Goals 和 Acceptance Criteria。
- 若需求与当前行为冲突，先记录现有行为、目标行为、冲突点和风险，不要猜测。

### 分支与提交

- 默认从 `main` 创建任务分支，例如 `codex/cm002-evidence` 或 `codex/cm003-storage-safety`。
- Execution Agent 不应直接把任务提交到 `main` 或推送到远端主分支；应先完成本地验证并交给 Review。
- 任务范围外的修改必须单独报告、单独提交，不能因为本地工具或会话目录产生未跟踪文件就顺手修改 `.gitignore`。
- 推荐使用表达范围的原子提交，例如 `fix: ...`、`test: ...`、`chore: ...`；不要把业务修复、测试工具、格式化和无关配置混成一个提交。

### 修改中

- 优先使用现有模块和配置，不重复创建状态或 LocalStorage key。
- 保持稳定 ID、数据兼容和错误处理。
- 事件监听必须避免重复绑定；动态 DOM 必须在实际创建后获取。
- 不把调试日志、临时代码或未使用配置留在生产路径。
- 只修改任务允许的文件。

### 修改后

- 查看完整 diff 和实际代码，不只依赖“测试通过”的口头结果。
- 检查副作用、重复逻辑、数据兼容、错误路径和任务范围。
- 运行与改动风险匹配的检查，并报告未能执行的验证。
- 若任务要求提交，使用能表达范围的原子提交信息，例如 `fix: ...`、`test: ...`、`docs: ...`；不要使用 `misc`、`update project` 或 `fix everything`。

### 验证证据保留规则

- “仓库当前没有证据”只能说明当前工作区没有证据，不能推断测试从未存在；报告必须区分“未落盘”“已删除”和“从未执行”。
- 删除测试脚本、日志或报告前，必须先明确说明这会移除可复核能力，并获得确认；可以删除报告，不应未经确认一并删除复现脚本。
- 自动化测试报告必须以脚本实际输出为准，记录准确断言数、环境、URL、命令、退出码、失败项和剩余风险；不能使用未经核对的口头概数。
- 一次性反向验证若会临时改写业务源码，必须标记为手工工具，不纳入普通 CI；应保证异常中断时不会留下源码修改，或仅在临时副本/临时工作树中运行。
- 长期有价值的验证能力应提交脚本和复现说明；运行时日志、临时备份和本机路径应脱敏或加入忽略规则。

## 质量命令

当前 `package.json` 提供：

```text
npm run lint
npm run format:check
npm run format
```

当前事实：

- `npm run lint` 已有基线并应在代码任务中运行。
- `npm run format:check` 当前未通过；它报告多个既有文件格式问题。不要把批量格式化混入业务修复。
- 没有 `npm test`、单元测试、集成测试、E2E 测试或 GitHub Actions。`TESTING.md` 是手工检查清单，不是自动化测试。
- 项目无构建步骤，静态文件可由任意静态服务器提供。

## 任务卡模板

执行具体任务时，任务描述应至少包含：

```text
TASK-ID:
TASK-NAME:
PHASE:
PRIORITY:

OBJECTIVE:

CONTEXT:

SCOPE:
-

NON-GOALS:
-

IMPLEMENTATION:
1.

ACCEPTANCE CRITERIA:
- [ ]

VERIFICATION:
1.

REPORT:
- Files changed
- Summary
- Tests
- Known issues
- Commit
```

## Review 清单

- 实现是否满足 Objective 和每一条 Acceptance Criteria？
- 是否修改了 Scope 之外的文件或产品行为？
- 是否覆盖成功、失败、空值、损坏数据、重复点击和刷新恢复路径？
- 是否引入新的状态副本、重复事件监听或不稳定 ID？
- 用户输入是否安全渲染？LocalStorage 是否兼容旧数据？
- 测试是否真的触及改动路径？哪些结论只是未验证推测？
- `npm run lint` 与相关手工验证结果是什么？

## 当前推进边界

Phase A 审计已完成。优先候选任务见 `docs/ROADMAP.md`，包括自定义按钮编辑崩溃、LocalStorage 容错、按钮 ID 兼容模型和动态输入安全。未收到明确任务选择前，不自动进入 Phase B 工程化、BugFix 或功能拓展。
