# 迁移到真实仓库

这个仓库是实验室。验证通过后，把下面这些东西复制到目标仓库即可，
**不需要改业务代码，也不需要搬 issue 数据**。

## 1. 复制文件

```
.github/
  ISSUE_TEMPLATE/
    bug.yml
    verification.yml
    config.yml
  workflows/
    sync-labels.yml
    issue-ops.yml
    issue-dashboard.yml
  labels.json
scripts/
  lib/github.mjs
  issue-ops.mjs
  build-dashboard.mjs
  sync-labels.mjs
  dashboard.css
  dashboard-client.js
package.json
```

`seed-issues.mjs` / `lib/samples.mjs` 是实验室用的合成数据，不需要复制。

## 2. 调整标签清单

`labels.json` 是唯一标签真值。把目标仓库已有的领域标签（`FCN`、`frontend`、`backend`、
`admin` 等）合并进来，保留各自的颜色和描述。同步脚本只创建/更新，不删除已有标签。

```bash
export GITHUB_TOKEN="$(gh auth token)"
export GITHUB_REPOSITORY="owner/target-repo"
node scripts/sync-labels.mjs
```

## 3. 一次性映射已有状态

按 `docs/ARCHITECTURE.md` 的映射表，把旧状态转成标签：

| 旧状态 | 新标签 |
| --- | --- |
| `OPEN` | 不加 `status/*` |
| `PARTIAL（前端）` | `status/partial` + `owner/frontend` |
| `PARTIAL（产品）` | `status/partial` + `owner/product` |
| `PARTIAL（后端）` | `status/partial` + `owner/backend` |
| `BLOCKED` | `status/blocked` |
| `VERIFYING` | `status/verifying` |
| `CLOSED` 验收通过 | `verified` |
| `CLOSED` 产品不修 | close `not planned` |

建议先在一个 fork / 测试仓库跑一遍，确认：

- 旧的 `Fixed` 标签已经重命名成 `status/verifying`（`gh label edit Fixed --name status/verifying`）；
- 仍缺一端的 issue 已从 `verifying` 改成 `partial` + `owner/*`；
- 已关闭但缺 `verified` 的历史 issue 不会被 close gate 误伤
  （关闭事件只处理新发生的关闭；历史关闭不会重新触发）。

## 4. 打开自动化

1. 推送 workflow 文件到默认分支；
2. 确认 Actions 已启用；
3. 跑一次 `Sync Labels`；
4. 跑一次 `Issue Dashboard`（`workflow_dispatch`）；
5. 关闭一个没有 `verified` 的测试 issue，确认它被 reopen + 评论；
6. 同时加两个 `status/*`，确认只保留一个；
7. 加 `verified` 再关闭，确认不再 reopen。

## 5. GitHub Pages（可选）

仓库 Settings → Pages → Source 选 **GitHub Actions**，然后：

```bash
gh variable set ENABLE_PAGES --body true --repo owner/target-repo
```

下次 dashboard workflow 会部署 `dashboard/`。
私有仓库的 Pages 可用性取决于账号/组织套餐；不可用时仍然可以看
`dashboard/STATUS.md`，或从 `Issue Dashboard` run 的 **Artifacts → issue-dashboard**
下载 `index.html` 本地打开。

## 6. 回滚

这套东西只新增标签、workflow 和 `dashboard/` 生成物：

- 删除 `.github/workflows/issue-ops.yml` / `issue-dashboard.yml` / `sync-labels.yml`；
- 删除 `scripts/`、`dashboard/`、`package.json`；
- 标签可以保留（不参与业务），也可以逐条删除；
- 不需要回滚 issue 内容——自动化只改标签、评论和开关状态。

## 7. 迁移后的第一周

- 看板「需要关注」里的「无人负责」优先清；
- 把长期 `status/verifying` 的 issue 逐条推给验收方；
- 观察 close gate 是否误伤：产品裁定不修的 issue 是否用 `not planned` 关闭；
- 如果 `status/*` 冲突频繁，说明写状态的人还没养成「先移除旧标签」的习惯，
  可以在团队约定里写一句：**改状态 = 先移除旧 `status/*`，再加新的**。
