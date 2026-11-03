# GitHub Projects 原生看板

Project：https://github.com/users/DataManagement666/projects/1
（个人 Project，当前 **public**；lab 数据全是合成数据。要 org 级看板时再迁到 org。）

## 1. 字段

| 字段 | 类型 | 选项 / 说明 |
| --- | --- | --- |
| Status | single select | Open、Partial、Blocked、Verifying、Closed、Not planned |
| Priority | single select | P1、P2、P3 |
| Next owner | single select | Frontend、Backend、Product、Data、Tester |
| Waiting on | multi select | 同样五个角色；`Partial` 时指明另一端 |
| Scope | multi select | User API、Admin API、User UI、Admin UI、Docs、Data |
| Next step | text | 下一动作 |
| Evidence | text | 验收证据 |

内置字段里的 Title、Labels、Parent issue、Sub-issues progress、Updated、Closed 都可以直接在视图里展示。

## 2. 视图

在 Project 右上角 **New view** 里创建；分组/排序在视图设置里选：

| 视图 | 布局 | 筛选 | 分组 / 排序 |
| --- | --- | --- | --- |
| 当前状态 | Table | 无 | 按 Status 分组；Priority 升序 |
| 待验收 | Table | `status:Verifying` | 按 Updated 升序 |
| 阻塞 | Table 或 Board | `status:Blocked` | 按 Next owner 分组 |
| 状态板 | Board | `-status:Closed` | 按 Status 分组（默认）；需要 owner 列时 Group by Next owner |
| 最近关闭 | Table | `status:Closed` | 按 Closed 降序 |

快速按 owner 查看：

- 在任意视图的 filter bar 输入 `"Next owner":Frontend` / `"Next owner":Backend` /
  `"Next owner":Product` / `"Next owner":Data` / `"Next owner":Tester`；
- **状态板** 默认按 Status 分组；如果要 owner 列，在视图设置里把 **Group by** 设成
  `Next owner`，再按需把视图改名为「按 Owner」。
  字段名带空格，filter 里要用引号：`"Next owner":Frontend`。

> Projects 的公开 API 能创建 view 的名称/布局/可见字段/筛选，但**不暴露分组与排序**；
> 这两个在 UI 里设置一次即可。

## 3. 内置 workflow

Project → 右上角 `...` → **Workflows**：

- **Auto-add to project**：`repo:DataManagement666/issue-ops-lab is:issue`；
  当前已启用列表里没有这一项，需要在 UI 里添加并配置
- **Item closed**：已启用；测试通过（#11 关闭后 Status 自动变 Closed）
- **Item reopened**：没有这个内置 workflow；重新打开时手动改回 Open / Partial / Verifying
- **Pull request merged**：已通过 GraphQL 删除——合并不等于验收通过
- **Auto-close issue**：Status 变成配置的关闭值时自动关闭 issue（新 Project 默认启用）；
  本 Project 是否启用需在 UI 确认。启用后验收方把 Status 改为 Closed，issue 自动关闭
- **Auto-add sub-issues** / **Item added to project** / **Pull request linked to issue**：保留默认
- **Auto-archive**：按需
- **仓库级 PR 合并自动关闭**：Settings → General → Issues 的
  "Auto-close issues with merged linked pull requests" 保持关闭；PR 描述禁用 `closes`/`fixes` 关键词，
  否则合并会直接关闭 issue 并经 Item closed 把 Status 置为 Closed，绕过验收 gate

自定义 Action 需要 PAT / GitHub App；`GITHUB_TOKEN` 不能访问 Projects v2。

## 4. 状态流转

```
Open ──▶ Partial ──▶ Verifying ──▶ Closed
  │          │            │
  ├──▶ Blocked ───────────┘
  └──▶ Not planned（产品裁定 / 重复 / 无效）
```

- **Partial**：在 `Waiting on` 里选还缺的角色，`Next owner` 填下一动作；
- **Blocked**：`Next step` 写清被谁卡住；
- **Verifying**：在 issue 评论或 `Evidence` 字段留下可复核证据；
- **Closed**：测试/验收方移动；开发自测不算；
- **Not planned**：产品结论写在 issue 评论；**先关闭 issue，再把 Status 改为 Not planned**
  （先设 Not planned 再关闭，会被 Item closed 覆盖成 Closed）。

## 5. 迁移到另一个仓库 / org

> GitHub Projects 属于 **user / org**，不属于仓库；不能把 Project「放进」另一个仓库。
> 能迁移的是字段/视图/配置，以及把目标仓库的 issue 加进来。
> 目标 owner 是 org 时，需要 org 的 Project 权限；个人 Project 可以引用 org 仓库的 issue，
> 但团队可见性和交接不如 org Project。

### 仓库文件

复制：

```
.github/ISSUE_TEMPLATE/
.github/labels.json
.github/workflows/sync-labels.yml
scripts/sync-labels.mjs
scripts/lib/github.mjs
docs/PROJECT.md
```

复制后把 `.github/ISSUE_TEMPLATE/bug.yml` 和 `config.yml` 里硬编码的 Project URL
（`https://github.com/users/DataManagement666/projects/1`）替换成新 Project 的地址。

不要在目标仓库恢复 `status/*`、`priority/*`、`owner/*`、`scope/*`、`verified` 标签；
状态/优先级/owner/scope 只放在 Project 字段里。

### Project

1. 在目标 owner（个人或 org）下新建 Project；
2. 链接目标仓库（Project → Settings → Linked repositories）；
3. 按第 1 节建字段；
4. 把目标仓库的 issue 加进 Project（Add items → 按仓库搜索，或 `gh project item-add`）；
5. 开启第 3 节的 workflow；
6. 按第 2 节建视图，设置分组/排序；
7. 如果目标仓库仍保留 `status/*` 等标签，先把值写进 Project 字段，再删标签；
8. 如果 GitHub 支持 transfer 且你有权限，也可以尝试转移现有 Project 再 link 目标仓库；
   否则按上面的步骤重建（字段/视图配置是显式的，重建成本不高）。

## 6. 已验证

- 2026-11-03：关闭 #11 → Project Status 自动从 Open 变 Closed（Item closed workflow）；
- 重新打开 #11 → Status 保持 Closed，手动改回 Open（没有 Item reopened workflow）；
- `Pull request merged` workflow 已删除，避免合并自动置 Closed；
- 5 个视图已通过 GraphQL 创建，filter 已设置；groupBy/sortBy 不在公开 API 里，需在 UI 设置；
- 6 个不在 manifest 的默认标签已删除，线上标签与 `labels.json` 一致；
- `Waiting on` / `Scope` 多选字段已在 Project 上，选项与文档一致
  （`gh project field-list` 不显示 multi-select 字段，查字段要用 GraphQL）。

## 7. 已知边界

- **Project 是个人所有**：当前 public，团队可以直接看；org 级看板需要 org 权限。lab 里全是合成数据。
- **内置 workflow 是 UI 配置**：不在 git 里，迁移时按第 3 节重配。
- **自定义自动化需要 PAT/GitHub App**：例如「标签变化 → 字段同步」「关闭 gate」；
  当前刻意不用，保持 Project 为唯一真值。
- **视图分组/排序不在 API**：迁移时在 UI 设置。
- **不要双写**：issue 上的 `status/*`、`priority/*`、`owner/*`、`scope/*` 标签已删除；
  再给 issue 加这些标签会重新制造两份状态。
