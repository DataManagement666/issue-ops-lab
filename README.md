# issue-ops-lab

一个用 **GitHub Projects 原生看板** 管理 issue 状态的实验室。
状态、优先级、owner、scope 全部在 Project 字段里维护，**不再用 `status/*` 标签**。

- 仓库：https://github.com/DataManagement666/issue-ops-lab
- 原生看板：**https://github.com/users/DataManagement666/projects/1**
- 数据：全部是合成 issue，不含真实账号、订单号或接口响应
- 之前的 Pages / 生成式看板 / 标签状态机已退役，Project 是唯一真值

## 状态模型

| 状态 | 含义 | 退出条件 |
| --- | --- | --- |
| Open | 未完成，仍可复现 | 进入 Partial / Blocked / Verifying，或关闭 |
| Partial | 一端完成、另一端未完成 | 补齐缺口 → Verifying；或产品裁定 |
| Blocked | 外部依赖卡住 | 依赖解除 → 改回 Partial / Verifying |
| Verifying | 开发完成、自检通过，等待测试/验收 | 验收方把 Status 改为 Closed；不通过改回 Partial |
| Closed | 验收通过并关闭 | — |
| Not planned | 产品裁定不修复 / 重复 / 无效 | — |

## Project 字段

| 字段 | 类型 | 值 |
| --- | --- | --- |
| Status | single select | Open / Partial / Blocked / Verifying / Closed / Not planned |
| Priority | single select | P1 / P2 / P3 |
| Next owner | single select | Frontend / Backend / Product / Data / Tester |
| Waiting on | multi select | 同样五个角色；用于「一端完成、另一端还缺」 |
| Scope | multi select | User API / Admin API / User UI / Admin UI / Docs / Data |
| Next step | text | 下一动作的一句话 |
| Evidence | text | 验收证据链接或命令 |
| 原生字段 | — | Title、Labels、Parent issue、Sub-issues progress、Updated、Closed |

**Project 是唯一真值**：不要在 issue 上加 `status/*`、`priority/*`、`owner/*`、`scope/*` 标签。
标签只保留类型/领域（`bug`、`frontend`、`backend`、`admin`、`FCN`）。

## 怎么用

1. 新 issue 进入仓库后，由 Project 的 **Auto-add to project** 自动加入；
2. 在 Project 里设置 Status / Priority / Next owner，必要时补 Waiting on / Scope / Next step；
3. 验收通过：测试/验收方把 Status 改为 **Closed**，再关闭 issue；
4. 验收不通过：Status 改回 **Partial** 或 **Verifying**，在 issue 评论写清缺口；
5. 产品裁定不修复 / 重复 / 无效：Status 改为 **Not planned**，再关闭 issue；
6. issue 关闭后，Project 的 **Item closed** workflow 会把 Status 设为 Closed；
   issue 重新打开时，**没有 Item reopened workflow**，手动把 Status 改回 Open / Partial / Verifying。

## 视图

在 Project 里建这 5 个视图（分组/排序在 UI 里设置，API 不暴露）：

| 视图 | 布局 | 筛选 | 分组 / 排序 |
| --- | --- | --- | --- |
| 当前状态 | Table | 全部 | 按 Status 分组；Priority 升序 |
| 待验收 | Table | `status:Verifying` | 按 Updated 升序 |
| 阻塞 | Table / Board | `status:Blocked` | 按 Next owner 分组 |
| 按 Owner | Board | 排除 Closed | 按 Next owner 分组 |
| 前端 | Table | `"Next owner":Frontend` | 按 Updated 降序 |
| 最近关闭 | Table | `status:Closed` | 按 Closed 降序 |

快速按 owner 查看：

- 点顶部 **前端** tab（已建好，filter 是 `"Next owner":Frontend`）；
- 其它角色：在任意视图的 filter bar 输入
  `"Next owner":Backend` / `"Next owner":Product` / `"Next owner":Data` / `"Next owner":Tester`；
- **按 Owner** board 是用 API 建的，公开 API 不暴露 groupBy，所以默认按 Status 分组；
  在视图设置里把 **Group by** 设成 `Next owner` 一次，就会变成 owner 列。

> Projects 的公开 API 能建 view 的名称/布局/可见字段/筛选，但**不暴露分组与排序**；
> 这些在 UI 里设置一次即可。

## 自动化

- **Auto-add to project**：仓库 `DataManagement666/issue-ops-lab` + `is:issue`；
  当前已启用的内置列表里没有这一项，需要在 Project → Workflows 里添加并配置；
- **Item closed → Status Closed**：已启用，2026-11-03 用 #11 测试通过；
- **Item reopened**：没有这个内置 workflow；重新打开时手动改回 Open / Partial / Verifying；
- **Pull request merged**：已删除，避免合并自动把 Status 置为 Closed（合并 ≠ 验收通过）；
- 自定义 Action 需要 PAT / GitHub App：`GITHUB_TOKEN` 不能读写 Projects v2。
  当前只用 Projects 内置 workflow，不引入 PAT。

## 已验证（2026-11-03）

- 关闭 #11 → Project Status 自动从 Open 变 Closed；
- 重新打开 #11 → Status 保持 Closed，手动改回 Open（没有 Item reopened）；
- `Pull request merged` workflow 已删除；
- 5 个视图已通过 GraphQL 创建，筛选已设置；分组/排序需在 UI 里设置一次。

## 本地

```bash
export GITHUB_TOKEN="$(gh auth token)"
export GITHUB_REPOSITORY="DataManagement666/issue-ops-lab"
npm run labels   # 只同步类型/领域标签
```

## 迁移

字段、视图、内置 workflow 和迁移到另一个仓库/org Project 的步骤见
[docs/PROJECT.md](docs/PROJECT.md)。
