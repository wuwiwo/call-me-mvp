# 工作区文件丢失问题（环境缺陷，非 git 单独所致）

状态：**根因已定位（机制级），已恢复，已加防线**。2026-09-18 记录，
同日晚经第三方会话**独立复核并修正结论**（见文末「根因（修正版）」）。

> ⚠️ **本文档的「根因」一节曾被改写一次。** 下方保留原始记录以便追溯，
> 但**以文末「根因（修正版）」为准**。完整推导与实验证据见
> `.workbuddy/worktree-file-loss-bugreport.md` 的 §13 / §14 / **§15（第三方独立复核）**。

## 症状

`git status` 显示一批**已跟踪文件在工作区消失**（` D`，未暂存），但：

- `git log --diff-filter=D` 为空 —— **从未被任何 commit 删除**；
- HEAD 与索引中都完整存在这些文件；
- 磁盘上任何位置都搜不到它们（不是被移动）。

首次于 CM-002/CM-004 时期报告「5 个 `docs/*.md` 丢失」，当时原因未查明。

**第 5 次在现场复现（2026-09-18 16:53）**：合并 `codex/wt-file-loss-guard` 之后立刻复检，
一次丢 **26 个**文件 —— 是此前最严重的一次。这次留下了干净的对照证据：

```text
被删除（26）＝ docs/ 与 tools/ 下「本次合并未写入」的全部已跟踪文件
存活  （5）＝ 本次合并写入的：docs/AI_HANDOFF.md、docs/handoff/archive/{INDEX,WORKTREE-FILE-LOSS}.md、
                              tools/README.md、tools/check-worktree.mjs
```

「丢的恰是没被重写的」这一规律**再次精确成立**，且新加的 `check-worktree.mjs`
第一时间检出并一键恢复，未造成任何验证中断。

## 复发时间线（四次）

| 时间 | 触发的 git 操作 | 被删文件 |
|---|---|---|
| 2026-09-17 16:51 | 合并窗口 | `tools/e2e.mjs`、`negative.mjs`、`server.mjs` |
| 2026-09-17 17:57 | 治理文档 PR #2 合并 | `docs/ARCHITECTURE.md`、`DATA_FLOW.md`、`PROJECT_ANALYSIS.md`、`ROADMAP.md`、`TECH_DEBT.md` |
| 2026-09-17 21:22 / 22:38 | CM-003 PR #3 / CM-004 合并 | `tools/storage-resilience.mjs`、`negative-storage.mjs`、`button-ids.mjs`、`negative-button-ids.mjs`、`e2e.mjs` |
| 2026-09-18 16:27 | CM-005 + GOV-001 快进合并 | **17 个**：10 个 `docs/*.md` + 7 个 `tools/*.mjs` |
| 2026-09-18 16:53 | 合并 `codex/wt-file-loss-guard` | **26 个**：10 个 `docs/*.md` + 6 个 `docs/handoff/archive/*.md` + 10 个 `tools/*` |

## 根因（**初版记录，已被修正 —— 请勿据此排查**）

> 保留原文以便追溯。**正确结论见下方「根因（修正版）」。**

**当时结论：不是 git 删除的。** 证据来自 Windows 回收站 `E:\$RECYCLE.BIN`：

1. 回收站 `$I*` 元数据中**完整记录了上述四次删除**，文件名与时间戳一一对应。
2. 记录里不仅有文件，还有**目录本身**：`docs`、`docs/handoff`、`docs/handoff/archive`、`tools`。
3. 记录里还有 **git 的内部锁文件**：`.git/index.lock`、`.git/HEAD.lock`、
   `.git/packed-refs.lock`、`.git/AUTO_MERGE.lock`、`.git/objects/maintenance.lock`。

**git 在 Windows 上不使用回收站** —— 只有显式请求「安全删除」（`SHFileOperation` +
`FOF_ALLOWUNDO` 这类）的工具才会把文件移入回收站。本机确实存在这样的 shim
（`safe-bin/rm` → `safe_delete_main`）。

因此当时结论是：**每次 git 合并/检出动作前后，都有一个带「安全删除」的外部工具在对
`docs/`、`tools/` 等目录执行删除到回收站的操作**；git 随后只重写了它本次需要写的文件，
**没被重写的文件就成了「丢失」**。

**未完全确定的部分**：具体是哪个进程触发的删除（已排除 OneDrive）。**当时认为根因层面已足够明确。**

### 这版结论错在哪里

「父目录被**顺带**搬走」「有一个**外部**工具在删」——**因果说反了**。
父目录不是被谁顺带搬走的，**是 git 自己主动删的**；沙箱的错误只是让本该失败的 `rmdir` 成功了。
详见下节。

## 根因（修正版，2026-09-18 晚，经独立复核确证）

### 一句话

> git 删除一个工作区文件后，会沿路径**逐级 `rmdir` 祖先目录**
> （`entry.c` 的 `remove_empty_directories()`），并靠「目录非空 → `rmdir` 失败」来终止这个循环。
> 本机沙箱把删除改写为「移入回收站」，且**该改写不校验目录是否为空** → 每级 `rmdir` 都"成功"
> → 终止条件失效 → git 一路删到**工作树顶层目录**为止。
> 于是同目录内**未被 git 重写的已跟踪文件静默消失**，全程无报错，`git status` 只显示 ` D`。

### 完整因果链

1. 沙箱以 **DLL 注入**（`tsbx.dll` ← `D:\File\WorkBuddy\resources\app.asar.unpacked\cli\vendor\sandbox\5.5.5\`）
   进入 WorkBuddy 派生的**每个子进程**，hook 其文件删除 API。
   —— 这就是「为什么不经 shim、不经 broker 也能拦到 `os.remove` 和 `git.exe` 的删除」。
2. 配置 `recyclebin_backup: true` → 删除被改写为「移入回收站」。
3. 该改写对 `rmdir` **不校验目录是否为空** → 非空目录也被整体搬进回收站并返回成功。
4. git 的 `remove_empty_directories()` 上溯循环因此失去终止条件 → 删到路径中再无 `/` 为止。
5. git 只重写本次需要写的文件（并自动重建缺失目录）→ 其余文件表现为「静默消失」。

**因此受害范围是「被删文件的祖先目录链，直到工作树顶层」** —— 任何目录（含 `js/`、仓库根）
都可能中招，只是历史事故的差异恰好落在 `docs/`、`tools/`。
删除顶层文件（路径中无 `/`）则零级联，这也解释了为什么仓库根与其它顶层目录从未受损。

### ★ 关键判读判据：先看有没有 `⚠️ Sandbox bypassed (escalation-approved)`

| 进程状态 | `tsbx.dll` 注入 | `CODEBUDDY_SAFE_DELETE_*` 环境变量 | 删除行为 |
|---|---|---|---|
| 未提权（正常） | **是** | 齐全 | 改写为移入回收站 → **可能级联** |
| 提权后（带该标记） | **否** | **被剥离** | 原生语义 → **不可能级联** |

- **命令带该标记 = 未注入 = 级联不可能发生 = 复现实验结论无效。**
- 这**不是偶发噪音**：沙箱配置是 `default_action: "deny_write"`，**所有写操作都要过授权闸门**，
  授权通过即以无沙箱方式运行 —— 所以是**常态**。
- **豁免会向下继承**：提权进程 spawn 的子进程同样不被注入 → 脚本里的「对照组」也会一起失效，
  导致「对照组/实验组都没事」的假阴性。
- 自省方法（`.workbuddy/probe_self_inject2.py`）：用 `psapi.EnumProcessModules` 读本进程
  模块列表，查有无 `tsbx.dll`。

### 已排除的治本手段

**改 `tsbx_rules.json` 无效**（三组实测全部零效果）：
常驻 `sandbox-center.exe` **只在启动时读一次**该文件，之后不再读，且落盘时会把外部改动**覆盖回去**。
因此「关掉 `recyclebin_backup`」或「给代码目录加豁免规则」都**当前不可行**（详见报告 §14）。

### 其他取证要点

- **`$R` 才是内容副本**，`$I` 只是路径索引。要证明「目录被搬走时里面装着什么」必须读 `$R`。
- 回收站索引有延迟：1.2 秒快照可能得 0 条，**10 秒轮询**才拿得到 ——
  判据不要用短等待快照，否则会误判「没有级联」。
- 级联**与调用方无关**：git 触发还是 Python `os.remove`/`os.rmdir` 触发都一样，
  只看该进程是否被沙箱注入。

## 危害

危害**不在内容丢失**（内容始终完整保存在 HEAD，可 100% 恢复），而在两点：

1. **验证跑不起来**：`tools/*.mjs` 缺失导致 `MODULE_NOT_FOUND`，
   极易被误读成「代码回归」。2026-09-18 就发生过一次这样的误判风险。
2. **可能被固化进历史**：若此时顺手 `git add -A` 提交，**删除会被写进 commit**，
   从「工作区问题」升级为「仓库内容损坏」。

## 恢复

```text
node tools/check-worktree.mjs          # 只检查并报告（有缺失则退出码 1）
node tools/check-worktree.mjs --fix    # 从 HEAD 自动恢复
```

手工等价操作：

```text
git restore -- docs tools              # 从索引/HEAD 恢复工作区
git restore --staged -- <path>         # 仅当删除已被暂存时，先取消暂存
```

2026-09-18 16:40 已执行恢复，17 个文件全部回来；恢复后三套回归
（`button-ids` 52/52、`storage-resilience` 51/51、`e2e` 29/29）与
`input-safety` 97/97、ESLint 0 error / 0 warning 全部通过。

## 防线

1. **`tools/check-worktree.mjs`**（2026-09-18 新增）：检出「已跟踪文件被删除」，
   `--fix` 可从 HEAD 恢复；同时会提示**已暂存**的删除（更危险，会被 commit 固化）。
   **已实战验证**：2026-09-18 16:53 合并后立刻检出 26 个缺失并一键恢复（见上文第 5 次）。
2. **`tools/worktree-guard.mjs` + `.githooks/{post-checkout,post-merge,post-commit}`**
   （2026-09-18 晚新增，**自动防线**）：由 git 钩子驱动，在切换/合并/提交后**自动**识别并恢复
   级联误伤。判定：
   ```text
   intended   = git diff --diff-filter=D <prev> <new>   # 本次操作本来就要删的，不恢复
   missing    = 索引里已跟踪、但工作区已不存在的文件
   collateral = missing - intended                       # 级联误伤 → git restore
   ```
   启用方式：`git config core.hooksPath .githooks`（仓库本地生效；
   `git config --unset core.hooksPath` 可撤销）。
   日志 `.workbuddy/worktree-guard.log` —— **注意：只有在真的恢复过文件时才会写**，
   所以「没有日志」不代表防线失效。
3. **流程纪律**：在 git 合并/检出之后、**任何 commit 之前**跑一次 `check-worktree`。
4. **禁止 `git add -A` / `git add .`**：只按路径暂存你确实改过的文件。
   这是本仓库最容易踩的坑 —— 一次 `-A` 就会把工作区损坏变成仓库损坏。
5. 若发现 ` D` 条目：**先恢复，再继续**，不要带着缺失状态跑验证或提交。

## 备份价值说明

回收站中的 `$R*` 文件是这些删除内容的**副本**，但它们不是可靠备份：
回收站会被清空，且 `$R*` 的文件名已丢失。**权威来源始终是 HEAD**，
恢复一律走 `git restore`，不要依赖回收站。
