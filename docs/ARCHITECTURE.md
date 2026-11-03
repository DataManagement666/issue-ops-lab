# 状态模型与自动化规则

## 1. 为什么用标签，而不是 Markdown 表格

GitHub 原生只有 `open / closed`。要表达「已修待验收」「一端完成、另一端还缺」
「被外部依赖卡住」，只有三个候选载体：

| 载体 | 优点 | 缺点 |
| --- | --- | --- |
| Markdown 表格 | 灵活、可叙事 | 两份真值，必然漂移；`gh` 搜不到 |
| Projects 自定义字段 | 交互式看板、跨仓库 | 需要 org/个人 Project 权限；字段改动不在 `gh issue list` 里 |
| **标签** | `gh issue list --label` 可查；Actions 可读写；仓库级即可 | 只能单值/多值，需要约定互斥 |

本仓库选标签作为**唯一可写真值**。看板和 `status.json` 都是派生视图，
不允许手改；这样不会回到「README 和 GitHub 两份状态」。

## 2. 两个轴，而不是一个状态字段

```
状态轴：Open → Partial / Blocked → Verifying → Closed / Not planned
缺口轴：owner/frontend | owner/backend | owner/product | owner/data | owner/tester
```

`PARTIAL` 和 `BLOCKED` 不是和 `OPEN` 互斥的「状态」，而是
「Open + 还剩谁 / 被谁卡住」。把它们拆成两个轴后：

- `#31 PARTIAL（前端 + 产品）` 可以同时带 `status/partial`、`owner/frontend`、`owner/product`；
- 看板可以按 owner 过滤，不需要解析自由文本；
- 状态互斥规则只需要守一个 `status/*`。

## 3. 状态机

```
                 ┌──────────────┐
                 │     Open     │
                 └──────┬───────┘
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   status/partial  status/blocked  status/verifying
        │               │                │
        └───────┬───────┘                │
                ▼                        │
        status/verifying ────────────────┤
                                         ▼
                                   verified + close
                                         │
                                         ▼
                                      Closed
```

规则：

1. **最多一个 `status/*`**。`issue-ops.mjs` 在 `labeled` / `unlabeled` / `opened`
   时归一化；冲突时保留本次新增的标签，移除其它，并评论说明。
2. **`completed` 关闭必须有 `verified`**，或 `duplicate` / `invalid` / `wontfix`。
   否则自动 reopen + 评论。
3. **`not planned` 关闭不需要 `verified`**：产品裁定不修复是合法终态。
4. **reopen** 自动移除 `verified`，要求重新验收。
5. **进入 `status/verifying`** 贴验收清单；如果之前有 `verified`，先移除。
6. **超期提醒**（只提醒不关闭）：
   - `status/verifying` > 7 天；
   - `status/partial` / `status/blocked` > 14 天；
   - 无状态（Open）> 30 天；
   - 同一状态标签 7 天内只提醒一次。

### 关闭 gate 的边界

- 开发自测不算关闭；`verified` 必须由测试/验收方添加。
- `duplicate` / `invalid` / `wontfix` 是允许的例外，但仍建议在评论里写依据。
- Bot 自己造成的 `closed` / `reopened` / `labeled` 事件不会再次触发（workflow 的
  `if: github.actor != 'github-actions[bot]'`），避免自激循环。

## 4. 看板数据流

```
GitHub Issues ──REST──▶ build-dashboard.mjs
                         │
                         ├─▶ dashboard/status.json   机器可读
                         ├─▶ dashboard/STATUS.md     GitHub 渲染
                         └─▶ dashboard/index.html    自包含静态看板
```

派生字段：

| 字段 | 来源 |
| --- | --- |
| `status` | closed → Closed / Not planned；open → `status/*`；多个 → Conflict；无 → Open |
| `priority` | `priority/P1..P3` |
| `owners` | `owner/*` |
| `scopes` | `scope/*` |
| `unowned` | open 且无 `owner/*` 且无 assignee |
| `stale` | open 且 `updated_at` 超过状态阈值 |
| `conflict` | open 且多个 `status/*` |
| `closedWithoutVerification` | closed completed 且无 `verified` / 例外标签 |

看板设计遵循 dataviz 参考调色板：

- 深/浅两套 surface；状态色固定，不跟随主题；
- 状态色只表达状态，且始终与图标 + 文字一起出现；
- 状态分布是 24px 高的堆叠条，段间 2px surface gap，外端 4px 圆角；
- 表格是图表的 table-view twin；每段有 hover/focus tooltip；
- 所有 issue 文本用 `textContent` 渲染；标题/标签按不可信数据处理。

## 5. 已知限制

- **标签是仓库级的**：跨仓库 issue 需要每个仓库各建一套标签，或把状态放到跨仓库 Project。
- **`GITHUB_TOKEN` 不能读写 Projects v2**：如果后续要用 Project 字段，需要 PAT / GitHub App。
- **自定义字段不是 git 配置**：Projects 的字段/视图要在 UI 里建；本仓库不依赖 Projects。
- **超期提醒不是自动关闭**：关闭必须有人给结论。
- **README 里的历史证据不会自动搬**：迁移时只搬 `.github/` 和 `scripts/`，issue 正文留在原仓库。

## 6. 迁移映射

| 旧状态（product-protype README） | 新标签 |
| --- | --- |
| `OPEN` | 无 `status/*` |
| `PARTIAL（前端）` | `status/partial` + `owner/frontend` |
| `PARTIAL（产品）` | `status/partial` + `owner/product` |
| `PARTIAL（后端）` | `status/partial` + `owner/backend` |
| `BLOCKED` | `status/blocked` |
| `VERIFYING` | `status/verifying` |
| `CLOSED`（验收通过） | `verified` + close completed |
| `CLOSED`（产品不修） | close not planned |

旧的 `Fixed` 标签建议重命名为 `status/verifying`，保留已有赋值，再逐条判断：
真正还缺一端的改成 `status/partial` + `owner/*`。
