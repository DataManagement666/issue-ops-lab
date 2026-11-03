# issue-ops-lab

一个**独立于业务仓库**的 issue 状态管理实验室：用 GitHub 标签 + Actions + 静态看板，
把「Open / Partial / Blocked / Verifying / Closed」这套状态真正落到 GitHub 上。

> 这里是合成数据的实验场，不包含真实账号、订单号或接口响应。
> 在真实仓库验证通过后，按 [docs/MIGRATION.md](docs/MIGRATION.md) 迁移。

## 它解决什么问题

大多数仓库只有 `open / closed` 两态，于是「已修待验收」「一端完成、另一端还缺」
「被外部依赖卡住」只能写进 Markdown 表格或 issue 正文。结果是：

- 两份状态真值（GitHub vs 手写表）；
- `Fixed` 标签与 `open/closed` 打架；
- 关闭动作没有强制绑定验收证据；
- 没人能一眼看出「现在到底卡在谁」。

这个仓库把状态变成**机器可读的标签**，并让 Actions 维护状态机、生成看板。

## 状态模型

| 状态 | 标签 | 含义 | 退出条件 |
| --- | --- | --- | --- |
| Open | 无 `status/*` | 未完成，仍可复现 | 进入 Partial / Verifying / Blocked，或关闭 |
| Partial | `status/partial` | 一端完成、另一端未完成 | 补齐缺口 → Verifying；或产品裁定 |
| Blocked | `status/blocked` | 外部依赖卡住 | 依赖解除 → 改回 Partial / Verifying |
| Verifying | `status/verifying` | 开发完成、自检通过，等待测试/验收 | 验收方加 `verified` → 关闭；不通过 → Partial |
| Closed | issue 关闭 | 验收通过，或产品裁定不修复 | — |

补充标签：

- `priority/P1` / `P2` / `P3`
- `owner/frontend` / `owner/backend` / `owner/product` / `owner/data` / `owner/tester`
  —— **下一动作**的负责角色，可以多个（对应 README 里的「前端 + 产品」）
- `scope/user-api` / `scope/admin-api` / `scope/user-ui` / `scope/admin-ui` / `scope/docs`
- `verified` —— 测试/验收方确认通过；`completed` 关闭的前置条件
- `duplicate` / `invalid` / `wontfix` —— 允许不经 `verified` 关闭的例外
- `bug` / `feature` / `task` / `frontend` / `backend` / `admin` / `FCN` —— 类型与领域

> `PARTIAL` / `BLOCKED` 本质是「Open + 还剩谁 / 被谁卡住」。
> 状态标签负责状态，`owner/*` 负责缺口，二者拆开后
> `PARTIAL（前端 + 产品）` 不需要挤进一个标签。

## 自动化

`.github/workflows/issue-ops.yml`：

1. **状态互斥**：一个 issue 只能有一个 `status/*`；冲突时保留本次新增的，移除其它。
2. **关闭 gate**：`completed` 关闭必须带 `verified`（或 `duplicate` / `invalid` / `wontfix`）；
   否则自动 reopen + 评论。产品裁定不修复请用 `not planned` 关闭。
3. **重新打开**：自动移除 `verified`，要求重新验收。
4. **进入 Verifying**：自动贴验收清单（环境 / 步骤 / 实际 / 期望 / 证据 / 结论）。
5. **超期提醒**：Verifying 7 天、Partial/Blocked 14 天、Open 30 天没有更新时评论提醒；
   **不自动关闭**。

`.github/workflows/issue-dashboard.yml`：

- issue 事件 + 每小时定时触发；
- 生成 `dashboard/index.html`、`dashboard/status.json`、`dashboard/STATUS.md`；
- 内容没变不 commit；
- 设置仓库变量 `ENABLE_PAGES=true` 后自动部署 GitHub Pages。

## 看板

- **Markdown 版**：[dashboard/STATUS.md](dashboard/STATUS.md)（GitHub 直接渲染）
- **HTML 版**：`dashboard/index.html`（自包含，可直接用浏览器打开）
- **GitHub Pages**：仓库 Settings → Pages → Source 选 GitHub Actions，
  再设置变量 `ENABLE_PAGES=true`；之后每次看板更新会自动部署。

看板包含：Open 数、Partial/Blocked/Verifying 分桶、需要关注（无人负责 / 超期 / 状态冲突 /
关闭缺 `verified`）、状态分布条、可筛选可排序的 issue 表。
所有 issue 文本用 `textContent` 渲染，标题/标签不会被当成 HTML 注入。

## 本地运行

需要 `GITHUB_TOKEN`（`repo` scope 即可）和 `GITHUB_REPOSITORY`：

```bash
export GITHUB_TOKEN="$(gh auth token)"
export GITHUB_REPOSITORY="DataManagement666/issue-ops-lab"

npm run labels      # 同步 .github/labels.json
npm run seed        # 写入合成 issue（按标题幂等）
npm run dashboard   # 生成 dashboard/*
```

本地只读预览看板：

```bash
python3 -m http.server 8080 --directory dashboard
# 打开 http://127.0.0.1:8080/
```

`scripts/build-dashboard.mjs` 也支持 `ISSUES_FIXTURE=/path/to/issues.json`，
用本地 fixture 生成看板，不访问 GitHub。

## 目录

```
.github/
  ISSUE_TEMPLATE/      bug / verification 表单
  workflows/           sync-labels / issue-ops / issue-dashboard
  labels.json          标签清单（唯一真值）
scripts/
  lib/github.mjs       REST 小工具
  lib/samples.mjs      合成 issue 数据
  sync-labels.mjs      标签同步
  seed-issues.mjs      写入合成 issue
  issue-ops.mjs        状态机
  build-dashboard.mjs  看板生成
  dashboard.css        HTML 看板样式（构建时内联）
  dashboard-client.js  筛选/排序/主题（构建时内联）
dashboard/
  index.html           生成物，勿手改
  status.json          生成物，勿手改
  STATUS.md            生成物，勿手改
docs/
  ARCHITECTURE.md      状态模型与自动化规则
  MIGRATION.md         迁移到真实仓库
```

## 设计边界

- **不改业务仓库**：这个仓库只读写自己的 issue；迁移时才复制 `.github/` 与 `scripts/`。
- **不依赖 Projects**：标签是唯一可写真值；Projects 可以作为只读视图，但不是必需。
- **标签是仓库级的**：跨仓库状态要么每个仓库各建一套标签，要么用跨仓库 Project。
- **验收结论必须由人给出**：`verified` 不会被自动推断；这是设计，不是缺口。
- **不自动关闭超期 issue**：只提醒，不替人做结论。
