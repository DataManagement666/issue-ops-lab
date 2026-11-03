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
| 按 Owner | Board | `-status:Closed` | 按 Next owner 分组 |
| 最近关闭 | Table | `status:Closed` | 按 Closed 降序 |

> Projects 的公开 API 能创建 view 的名称/布局/可见字段/筛选，但**不暴露分组与排序**；
> 这两个在 UI 里设置一次即可。

## 3. 内置 workflow

Project → 右上角 `...` → **Workflows**：

- **Auto-add to project**：`repo:DataManagement666/issue-ops-lab is:issue`
- **Item closed**：把 Status 设为 Closed（确认启用）
- **Item reopened**：如果可用，把 Status 设为 Open；不可用就手动
- **Pull request merged**：**不要启用**——合并不等于验收通过
- **Auto-archive**：按需

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
- **Not planned**：产品结论写在 issue 评论，然后关闭。

## 5. 迁移到另一个仓库 / org

1. 在目标 owner（个人或 org）下新建 Project；
2. 链接目标仓库（Project → Settings → Linked repositories）；
3. 按第 1 节建字段；
4. 把目标仓库的 issue 加进 Project（Add items → 按仓库搜索，或 `gh project item-add`）；
5. 开启第 3 节的 workflow；
6. 按第 2 节建视图，设置分组/排序；
7. 如果目标仓库仍保留 `status/*` 等标签，先删标签、把值写进 Project 字段；
   本 lab 的标签迁移脚本已跑完，不需要再保留状态标签。

## 6. 已知边界

- **Project 是个人所有**：当前 public，团队可以直接看；org 级看板需要 org 权限。lab 里全是合成数据。
- **内置 workflow 是 UI 配置**：不在 git 里，迁移时按第 3 节重配。
- **自定义自动化需要 PAT/GitHub App**：例如「标签变化 → 字段同步」「关闭 gate」；
  当前刻意不用，保持 Project 为唯一真值。
- **视图分组/排序不在 API**：迁移时在 UI 设置。
- **不要双写**：issue 上的 `status/*`、`priority/*`、`owner/*`、`scope/*` 标签已删除；
  再给 issue 加这些标签会重新制造两份状态。
