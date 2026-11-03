// 文件职责：seed-issues.mjs 使用的演示 issue 数据。
// 边界：全部是合成数据，不含真实账号、订单号或接口响应。
// 依赖：无。

function body({ environment, location, actual, expected, evidence }) {
  return `## 环境

${environment}

## 页面路径 / 接口

\`${location}\`

## 实际结果

${actual}

## 期望结果与验收标准

${expected}

## 证据

${evidence}
`;
}

export const SAMPLES = [
  {
    title: "[FCN][资产组合] Total Earnings 未包含 FCN 收益",
    labels: [
      "bug",
      "frontend",
      "backend",
      "FCN",
      "status/partial",
      "owner/frontend",
      "owner/product",
      "priority/P1",
      "scope/user-ui",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "策略 → 资产组合 → Estimated Total Assets 卡片",
      actual:
        "页面 `Total Earnings (USD) = +1.57`，只等于稳定币策略的 realizedPnl + unrealizedPnl；同期 FCN 确认净利息 `0.51` 没有进入指标。",
      expected:
        "若指标名为 Total Earnings，应包含稳定币策略和 FCN 的已实现、已确认收益；否则改名为 Stable Yield Earnings 并说明范围。",
      evidence:
        "- 合成页面截图 S1。\n- `GET /api/me/portfolio`：示例响应中 `fcnHoldings.confirmedNetInterestUsd` 存在。",
    }),
    comment: "缺口：前端尚未合计 `fcnHoldings.confirmedNetInterestUsd`；产品需确认指标口径。",
  },
  {
    title: "[FCN][资金流水] 部分历史 FCN 记录的变动后余额为空",
    labels: [
      "bug",
      "frontend",
      "backend",
      "FCN",
      "status/partial",
      "owner/frontend",
      "owner/backend",
      "priority/P2",
      "scope/user-ui",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "策略 → 资金流水 → 历史 FCN 记录",
      actual: "`HISTORY` 行返回 `balanceAfter=null`，页面显示空白而不是 `—`。",
      expected:
        "前端对 `balanceAfter=null` 显示 `—`；若要真实历史余额，另立基于账本时点的回填任务，禁止从当前列表倒推。",
      evidence: "- 合成接口响应：`{ \"balanceAfter\": null }`。",
    }),
    comment: "缺口：前端展示；后端回填属于另一个任务。",
  },
  {
    title: "[FCN][持仓] 已到期待兑付订单显示负数剩余天数",
    labels: [
      "bug",
      "frontend",
      "FCN",
      "status/verifying",
      "owner/tester",
      "priority/P2",
      "scope/user-ui",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "/strategy/fcn/balanced?tab=holdings",
      actual: "页面显示 `剩余时间：-1 天`，组件直接渲染 `termDays`。",
      expected:
        "`termDays < 0` 时显示「结算中 / 待兑付」；任何非持有中状态都不出现负天数。",
      evidence:
        "- 合成订单 `ORDER-DEMO-001`：`termDays=-1`、`displayStatus=SETTLING`。",
    }),
  },
  {
    title: "[FCN][路由] ?tab=holdings 深链接未选中持仓页",
    labels: [
      "bug",
      "frontend",
      "FCN",
      "status/verifying",
      "owner/tester",
      "priority/P2",
      "scope/user-ui",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "/strategy/fcn/balanced?tab=holdings",
      actual: "页面打开后仍停在申购页签，切换页签时 URL 也不更新。",
      expected: "初始化读取 `tab`；切换时同步 URL；非法 tab 回落到默认页签。",
      evidence: "- 合成浏览器记录：地址栏带 `?tab=holdings`，页签高亮在申购。",
    }),
  },
  {
    title: "[FCN][管理后台] 划转入口与 FCN 拨款不一致",
    labels: [
      "admin",
      "backend",
      "FCN",
      "status/blocked",
      "owner/product",
      "priority/P1",
      "scope/admin-api",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "管理后台 → 资金管理 → 资金划转",
      actual: "主列表展示 10 条划转流水，而不是 6 个 FCN 拨款批次。",
      expected:
        "产品先确认主对象是「拨款批次」还是「划转流水」，再决定页面主列表；后端接口已具备。",
      evidence: "- 合成列表截图 S2。",
    }),
    comment: "Blocked by: 产品需要裁定「批次 vs 流水」主对象。",
  },
  {
    title: "[FCN][资产组合] 30 天资产走势未计入 BTC 与 FCN",
    labels: [
      "bug",
      "frontend",
      "backend",
      "FCN",
      "verified",
      "priority/P1",
      "scope/user-ui",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "策略 → 资产组合 → 30 天走势",
      actual: "走势只含稳定币，BTC 与 FCN 持仓未计入。",
      expected: "直接使用服务端 `totalAssets`，覆盖建仓、赎回、到账迁移点。",
      evidence: "- 合成数据：跨周期资金守恒，`totalAssets` 已包含 BTC 与 FCN。",
    }),
    close: "completed",
  },
  {
    title: "[FCN][报价] 报价有效期口径冲突",
    labels: ["bug", "frontend", "FCN", "priority/P3", "scope/user-ui"],
    body: body({
      environment: "Staging（合成数据）",
      location: "FCN 申购确认页",
      actual: "页面倒计时与后端 quote 有效期口径不一致。",
      expected: "产品裁定不修复：以后端 quote 有效期为准，页面不展示倒计时。",
      evidence: "- 产品结论链接：合成示例。",
    }),
    close: "not_planned",
  },
  {
    title: "[FCN][钱包] 申购中钱包余额与分币种余额口径",
    labels: ["bug", "frontend", "FCN", "priority/P3", "scope/user-ui"],
    body: body({
      environment: "Staging（合成数据）",
      location: "策略 → 资产组合 → 钱包余额",
      actual: "Total Balance 与 Available Value 的口径未说明。",
      expected: "明确 Total Balance / Available Value 与可用余额的口径；页面文案与接口一致。",
      evidence: "- 合成页面截图 S3。",
    }),
    comment: "这个样例故意不设 owner，用来触发看板的「无人负责」。",
  },
  {
    title: "[FCN][对账] 兑付完成后无 reconcile run 记录",
    labels: [
      "admin",
      "backend",
      "FCN",
      "status/blocked",
      "owner/backend",
      "priority/P1",
      "scope/admin-api",
    ],
    body: body({
      environment: "Staging（合成数据）",
      location: "管理后台 → FCN → 对账",
      actual: "兑付完成后查不到 ORDER run 记录。",
      expected: "兑付终态后生成 reconcile run，并能在页面按订单下钻。",
      evidence: "- 合成 run 列表：`evaluated=0 / skipped=6`。",
    }),
    comment: "Blocked by: 需要后端先补齐兑付完成后的 run 触发。",
  },
  {
    title: "[Lab] 状态冲突样例",
    labels: [
      "bug",
      "frontend",
      "FCN",
      "status/partial",
      "status/verifying",
      "priority/P3",
      "scope/user-ui",
    ],
    body: body({
      environment: "Lab",
      location: "不适用",
      actual: "这个 issue 故意同时带 `status/partial` 和 `status/verifying`。",
      expected:
        "`issue-ops` 应自动保留一个状态标签并评论说明；看板不应出现两个状态。",
      evidence: "- 本 issue 自身就是证据。",
    }),
  },
];
