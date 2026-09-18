# 工作区文件丢失问题（环境缺陷，非 git 行为）

状态：**根因已定位，已恢复，已加防线**。2026-09-18 记录。

## 症状

`git status` 显示一批**已跟踪文件在工作区消失**（` D`，未暂存），但：

- `git log --diff-filter=D` 为空 —— **从未被任何 commit 删除**；
- HEAD 与索引中都完整存在这些文件；
- 磁盘上任何位置都搜不到它们（不是被移动）。

首次于 CM-002/CM-004 时期报告「5 个 `docs/*.md` 丢失」，当时原因未查明。

## 复发时间线（四次）

| 时间 | 触发的 git 操作 | 被删文件 |
|---|---|---|
| 2026-09-17 16:51 | 合并窗口 | `tools/e2e.mjs`、`negative.mjs`、`server.mjs` |
| 2026-09-17 17:57 | 治理文档 PR #2 合并 | `docs/ARCHITECTURE.md`、`DATA_FLOW.md`、`PROJECT_ANALYSIS.md`、`ROADMAP.md`、`TECH_DEBT.md` |
| 2026-09-17 21:22 / 22:38 | CM-003 PR #3 / CM-004 合并 | `tools/storage-resilience.mjs`、`negative-storage.mjs`、`button-ids.mjs`、`negative-button-ids.mjs`、`e2e.mjs` |
| 2026-09-18 16:27 | CM-005 + GOV-001 快进合并 | **17 个**：10 个 `docs/*.md` + 7 个 `tools/*.mjs` |

## 根因

**不是 git 删除的。** 证据来自 Windows 回收站 `E:\$RECYCLE.BIN`：

1. 回收站 `$I*` 元数据中**完整记录了上述四次删除**，文件名与时间戳一一对应。
2. 记录里不仅有文件，还有**目录本身**：`docs`、`docs/handoff`、`docs/handoff/archive`、`tools`。
3. 记录里还有 **git 的内部锁文件**：`.git/index.lock`、`.git/HEAD.lock`、
   `.git/packed-refs.lock`、`.git/AUTO_MERGE.lock`、`.git/objects/maintenance.lock`。

**git 在 Windows 上不使用回收站** —— 只有显式请求「安全删除」（`SHFileOperation` +
`FOF_ALLOWUNDO` 这类）的工具才会把文件移入回收站。本机确实存在这样的 shim
（`safe-bin/rm` → `safe_delete_main`）。

因此结论是：**每次 git 合并/检出动作前后，都有一个带「安全删除」的外部工具在对
`docs/`、`tools/` 等目录执行删除到回收站的操作**；git 随后只重写了它本次需要写的文件，
**没被重写的文件就成了「丢失」**。

这解释了一个关键现象：2026-09-18 16:27 那次，丢失的 17 个文件恰好等于
「`docs/`、`tools/` 下**未被该次合并写入**的全部已跟踪文件」——
被合并写入的那些（`AGENTS.md`、`js/modules/*.js`、`tools/ACCEPTANCE.md`、
`docs/handoff/archive/*`）反而出现在回收站里，但随后被 git 重新写出，所以最终是「存在」的。

**未完全确定的部分**：具体是哪个进程触发的删除（已排除 OneDrive —— 该路径不是
OneDrive 托管目录，无 `.OneDrive` 标记与相关环境变量；`FileSyncHelper.exe` 的
可执行路径不可读，属受保护进程）。**根因层面已足够明确：外部「安全删除」工具 + 合并动作**，
不需要精确到进程也能防护。

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
2. **流程纪律**：在 git 合并/检出之后、**任何 commit 之前**跑一次该脚本。
3. **禁止 `git add -A` / `git add .`**：只按路径暂存你确实改过的文件。
   这是本仓库最容易踩的坑 —— 一次 `-A` 就会把工作区损坏变成仓库损坏。
4. 若发现 ` D` 条目：**先恢复，再继续**，不要带着缺失状态跑验证或提交。

## 备份价值说明

回收站中的 `$R*` 文件是这些删除内容的**副本**，但它们不是可靠备份：
回收站会被清空，且 `$R*` 的文件名已丢失。**权威来源始终是 HEAD**，
恢复一律走 `git restore`，不要依赖回收站。
