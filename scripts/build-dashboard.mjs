#!/usr/bin/env node
// 文件职责：从 GitHub Issues 生成 issue-ops-lab 的看板。
// 产物：
//   dashboard/index.html  —— 自包含静态看板（内联 CSS/JS，可直接打开）
//   dashboard/status.json —— 机器可读数据
//   dashboard/STATUS.md   —— GitHub 里可直接看的 Markdown 版本
// 边界：只读 issue；不修改 issue。看板 issue（label=dashboard）会被排除。
// 依赖：scripts/lib/github.mjs；scripts/dashboard.css；scripts/dashboard-client.js。

import fs from "node:fs";
import path from "node:path";
import { paginate, repo, requireEnv } from "./lib/github.mjs";

const DAY = 24 * 60 * 60 * 1000;
const fixture = process.env.ISSUES_FIXTURE;
const title = process.env.DASHBOARD_TITLE || "Issue Ops — 状态看板";
const server = (process.env.GITHUB_SERVER_URL || "https://github.com").replace(
  /\/$/,
  "",
);

let repository = repo;
let rawIssues;
if (fixture) {
  rawIssues = JSON.parse(fs.readFileSync(fixture, "utf8"));
  repository = process.env.GITHUB_REPOSITORY || "owner/repo";
} else {
  requireEnv();
  rawIssues = await paginate(`/repos/${repo}/issues?state=all`);
}

const BAR_ORDER = ["Open", "Partial", "Blocked", "Verifying", "Closed", "Not planned"];
const STATUS_ORDER = [
  "Verifying",
  "Blocked",
  "Partial",
  "Open",
  "Conflict",
  "Closed",
  "Not planned",
];
const STATUS_META = {
  Open: { label: "Open", glyph: "○", tone: "open" },
  Partial: { label: "Partial", glyph: "◐", tone: "partial" },
  Blocked: { label: "Blocked", glyph: "■", tone: "blocked" },
  Verifying: { label: "Verifying", glyph: "◷", tone: "verifying" },
  Closed: { label: "Closed", glyph: "✓", tone: "closed" },
  "Not planned": { label: "Not planned", glyph: "–", tone: "notplanned" },
  Conflict: { label: "Conflict", glyph: "!", tone: "conflict" },
};
const PRIORITY_META = {
  P1: { glyph: "▲", tone: "p1" },
  P2: { glyph: "▲", tone: "p2" },
  P3: { glyph: "▲", tone: "p3" },
};
const OWNER_NAMES = {
  frontend: "Frontend",
  backend: "Backend",
  product: "Product",
  data: "Data",
  tester: "Tester",
};
const SCOPE_NAMES = {
  "user-api": "User API",
  "admin-api": "Admin API",
  "user-ui": "User UI",
  "admin-ui": "Admin UI",
  docs: "Docs",
  data: "Data",
};
const HIDDEN_LABEL_PREFIXES = [
  "status/",
  "priority/",
  "owner/",
  "scope/",
];
const HIDDEN_LABELS = new Set(["verified", "dashboard", "verification"]);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function mdCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

function prettify(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function labelsOf(issue) {
  return (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

function statusName(suffix) {
  if (suffix === "partial") return "Partial";
  if (suffix === "blocked") return "Blocked";
  if (suffix === "verifying") return "Verifying";
  return prettify(suffix);
}

function deriveIssue(issue) {
  const labels = labelsOf(issue);
  const statusLabels = labels.filter((label) => label.startsWith("status/"));
  let status;
  if (issue.state === "closed") {
    status = issue.state_reason === "not_planned" ? "Not planned" : "Closed";
  } else if (statusLabels.length > 1) {
    status = "Conflict";
  } else if (statusLabels.length === 1) {
    status = statusName(statusLabels[0].slice("status/".length));
  } else {
    status = "Open";
  }

  const priorityLabel = labels.find((label) => /^priority\/P[123]$/.test(label));
  const owners = labels
    .filter((label) => label.startsWith("owner/"))
    .map((label) => OWNER_NAMES[label.slice("owner/".length)] ?? prettify(label.slice("owner/".length)))
    .sort();
  const scopes = labels
    .filter((label) => label.startsWith("scope/"))
    .map((label) => SCOPE_NAMES[label.slice("scope/".length)] ?? prettify(label.slice("scope/".length)))
    .sort();

  const closeOk = labels.some((label) =>
    ["verified", "duplicate", "invalid", "wontfix"].includes(label),
  );
  const closedWithoutVerification =
    issue.state === "closed" &&
    issue.state_reason === "completed" &&
    !closeOk;
  const assignees = (issue.assignees ?? []).map((assignee) => assignee.login);
  const unowned =
    issue.state === "open" && owners.length === 0 && assignees.length === 0;
  const updatedAt = issue.updated_at;
  const updatedDate = String(updatedAt).slice(0, 10);
  const endMs =
    issue.state === "closed"
      ? Date.parse(issue.closed_at ?? updatedAt)
      : Date.now();
  const ageDays = Math.max(
    0,
    Math.floor((endMs - Date.parse(issue.created_at)) / DAY),
  );
  const staleDays =
    status === "Verifying"
      ? 7
      : status === "Partial" || status === "Blocked" || status === "Conflict"
        ? 14
        : 30;
  const stale =
    issue.state === "open" &&
    Date.now() - Date.parse(updatedAt) > staleDays * DAY;

  const displayLabels = labels
    .filter(
      (label) =>
        !HIDDEN_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix)) &&
        !HIDDEN_LABELS.has(label),
    )
    .slice(0, 4);

  return {
    number: issue.number,
    title: issue.title,
    url: safeUrl(issue.html_url),
    state: issue.state,
    stateReason: issue.state_reason ?? null,
    status,
    priority: priorityLabel ? priorityLabel.slice("priority/".length) : null,
    owners,
    scopes,
    labels,
    displayLabels,
    assignees,
    verified: labels.includes("verified"),
    closedWithoutVerification,
    unowned,
    conflict: status === "Conflict",
    updatedAt,
    updatedDate,
    ageDays,
    stale,
    staleDays,
    search: [
      String(issue.number),
      issue.title,
      labels.join(" "),
      owners.join(" "),
      scopes.join(" "),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function summarize(issues) {
  const counts = Object.fromEntries(
    [...BAR_ORDER, "Conflict"].map((status) => [status, 0]),
  );
  let open = 0;
  let closed = 0;
  const needsAttention = new Set();
  let unowned = 0;
  let stale = 0;
  let conflicts = 0;
  let closedWithout = 0;
  let verifiedClosed = 0;

  for (const issue of issues) {
    counts[issue.status] = (counts[issue.status] ?? 0) + 1;
    if (issue.state === "open") open += 1;
    else closed += 1;
    if (issue.unowned) {
      unowned += 1;
      needsAttention.add(issue.number);
    }
    if (issue.stale) {
      stale += 1;
      needsAttention.add(issue.number);
    }
    if (issue.conflict) {
      conflicts += 1;
      needsAttention.add(issue.number);
    }
    if (issue.closedWithoutVerification) {
      closedWithout += 1;
      needsAttention.add(issue.number);
    }
    if (issue.state === "closed" && issue.verified) verifiedClosed += 1;
  }

  return {
    counts,
    total: issues.length,
    open,
    closed,
    unowned,
    stale,
    conflicts,
    closedWithout,
    verifiedClosed,
    needsAttention: needsAttention.size,
  };
}

function statusRank(status) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? 99 : index;
}

function priorityRank(priority) {
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  return 9;
}

function defaultSort(issues) {
  return [...issues].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      priorityRank(a.priority) - priorityRank(b.priority) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function statusBadgeHtml(status) {
  const meta = STATUS_META[status] ?? STATUS_META.Open;
  return `<span class="badge badge--${meta.tone}"><span class="glyph" aria-hidden="true">${meta.glyph}</span><span>${esc(meta.label)}</span></span>`;
}

function priorityBadgeHtml(priority) {
  if (!priority) return `<span class="muted">—</span>`;
  const meta = PRIORITY_META[priority];
  return `<span class="badge badge--${meta.tone}"><span class="glyph" aria-hidden="true">${meta.glyph}</span><span>${esc(priority)}</span></span>`;
}

function chipsHtml(values, emptyText = "—") {
  if (!values.length) return `<span class="muted">${esc(emptyText)}</span>`;
  return `<span class="chips">${values
    .map((value) => `<span class="chip">${esc(value)}</span>`)
    .join("")}</span>`;
}

function rowHtml(issue) {
  const sub = issue.displayLabels.length
    ? `<div class="row-sub">${esc(issue.displayLabels.join(" · "))}</div>`
    : "";
  return `<tr data-number="${issue.number}">
  <td class="num"><a href="${esc(issue.url)}" target="_blank" rel="noreferrer">#${issue.number}</a></td>
  <td class="title"><a href="${esc(issue.url)}" target="_blank" rel="noreferrer">${esc(issue.title)}</a>${sub}</td>
  <td>${statusBadgeHtml(issue.status)}</td>
  <td>${priorityBadgeHtml(issue.priority)}</td>
  <td>${chipsHtml(issue.owners, "未指定")}</td>
  <td class="col-scope">${chipsHtml(issue.scopes)}</td>
  <td class="num col-age">${issue.ageDays}d</td>
  <td class="num">${esc(issue.updatedDate)}</td>
</tr>`;
}

function chartHtml(summary) {
  if (summary.total === 0) {
    return `<span class="empty">没有匹配的 issue</span>`;
  }
  return BAR_ORDER.filter((status) => (summary.counts[status] ?? 0) > 0)
    .map((status) => {
      const meta = STATUS_META[status];
      const count = summary.counts[status];
      return `<button type="button" class="seg seg--${meta.tone}" data-status="${esc(status)}" style="flex-grow:${count}" aria-label="${esc(meta.label)} ${count} 个，占 ${pct(count, summary.total)}%"><span class="seg-fill"></span></button>`;
    })
    .join("");
}

function legendHtml(summary) {
  return BAR_ORDER.map((status) => {
    const meta = STATUS_META[status];
    const count = summary.counts[status] ?? 0;
    return `<span class="legend-item"><span class="dot dot--${meta.tone}"></span><span>${esc(meta.label)}</span><span class="legend-count">${count}</span><span class="legend-pct">${pct(count, summary.total)}%</span></span>`;
  }).join("");
}

function chartNoteHtml(summary) {
  const parts = [];
  parts.push("Open 表示还没有 status/* 标签");
  if (summary.counts["Not planned"]) {
    parts.push(`Not planned ${summary.counts["Not planned"]} 个（单独显示，不计入 Closed）`);
  }
  if (summary.counts.Conflict) {
    parts.push(`Conflict ${summary.counts.Conflict} 个（状态冲突，不计入条形图）`);
  }
  return `${parts.join("；")}；一个 issue 最多一个 status/*。`;
}

function attentionHtml(issues) {
  const groups = [
    {
      label: "无人负责",
      reason: () => "无人负责",
      items: issues.filter((issue) => issue.state === "open" && issue.unowned),
    },
    {
      label: "超期未更新",
      reason: (issue) => `${issue.staleDays}+ 天未更新`,
      items: issues.filter((issue) => issue.stale),
    },
    {
      label: "状态冲突",
      reason: () => "多个 status/*",
      items: issues.filter((issue) => issue.conflict),
    },
    {
      label: "关闭但缺 verified",
      reason: () => "缺验收标签",
      items: issues.filter((issue) => issue.closedWithoutVerification),
    },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return `<div class="attention-card"><h3>没有需要关注的项目</h3><p class="muted">无人负责、超期、状态冲突、关闭缺验收均为 0。</p></div>`;
  }

  return groups
    .map((group) => {
      const items = group.items
        .slice(0, 8)
        .map(
          (issue) =>
            `<li><span class="reason">${esc(group.reason(issue))}</span><a href="${esc(issue.url)}" target="_blank" rel="noreferrer">#${issue.number} ${esc(issue.title)}</a></li>`,
        )
        .join("");
      const more =
        group.items.length > 8
          ? `<p class="muted">还有 ${group.items.length - 8} 个，见上方表格。</p>`
          : "";
      return `<div class="attention-card"><h3>${esc(group.label)} · ${group.items.length}</h3><ul class="attention-list">${items}</ul>${more}</div>`;
    })
    .join("");
}

function optionsHtml(entries) {
  return entries
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}">${esc(label)}</option>`,
    )
    .join("");
}

function dataAsOf(issues) {
  const timestamps = issues
    .map((issue) => Date.parse(issue.updatedAt))
    .filter((value) => !Number.isNaN(value));
  if (timestamps.length === 0) return "—";
  return `${new Date(Math.max(...timestamps)).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const issues = defaultSort(
  rawIssues
    .filter((issue) => !issue.pull_request)
    .filter((issue) => !labelsOf(issue).includes("dashboard"))
    .map(deriveIssue),
);
for (const issue of issues) {
  if (!STATUS_META[issue.status]) {
    STATUS_META[issue.status] = {
      label: issue.status,
      glyph: "?",
      tone: "unknown",
    };
  }
}

const summary = summarize(issues);
const asOf = dataAsOf(issues);
const repoUrl = `${server}/${repository}`;
const owners = [...new Set(issues.flatMap((issue) => issue.owners))].sort();
const extraStatuses = [...new Set(issues.map((issue) => issue.status))]
  .filter((status) => !BAR_ORDER.includes(status) && status !== "Conflict")
  .sort();
const statusOptions = optionsHtml([
  ["all", "全部状态"],
  ...BAR_ORDER.map((status) => [status, status]),
  ["Conflict", "Conflict"],
  ...extraStatuses.map((status) => [status, status]),
]);
const priorityOptions = optionsHtml([
  ["all", "全部优先级"],
  ["P1", "P1"],
  ["P2", "P2"],
  ["P3", "P3"],
]);
const ownerOptions = optionsHtml([
  ["all", "全部 owner"],
  ...owners.map((owner) => [owner, owner]),
  ["none", "无人负责"],
]);

const publicData = {
  title,
  repo: repository,
  repoUrl,
  dataAsOf: asOf,
  issues,
  statusMeta: STATUS_META,
  priorityMeta: PRIORITY_META,
  statusOrder: STATUS_ORDER,
  barOrder: BAR_ORDER,
};

const css = fs
  .readFileSync(path.resolve("scripts/dashboard.css"), "utf8")
  .replace(/<\/style/gi, "<\\/style");
const client = fs
  .readFileSync(path.resolve("scripts/dashboard-client.js"), "utf8")
  .replace(/<\/script/gi, "<\\/script");
const json = JSON.stringify(publicData)
  .replace(/</g, "\\u003c")
  .replace(new RegExp("\\u2028", "g"), "\\u2028")
  .replace(new RegExp("\\u2029", "g"), "\\u2029");

const html = `<!doctype html>
<html lang="zh-Hans" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(title)}：从 GitHub Issues 标签生成的自动化状态看板。">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<a class="skip" href="#main">跳到主要内容</a>
<div class="shell">
  <header class="topbar">
    <div>
      <h1>${esc(title)}</h1>
      <p>状态以标签为准 · 数据截至 ${esc(asOf)} · <a href="${esc(repoUrl)}/issues" target="_blank" rel="noreferrer">GitHub Issues</a> · <a href="${esc(repoUrl)}/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">状态模型</a></p>
    </div>
    <div class="top-actions">
      <button class="btn" id="theme-toggle" type="button" aria-label="切换主题">浅色模式</button>
    </div>
  </header>

  <div class="filters" role="search" aria-label="筛选 issue">
    <label class="field"><span>状态</span><select id="filter-status">${statusOptions}</select></label>
    <label class="field"><span>优先级</span><select id="filter-priority">${priorityOptions}</select></label>
    <label class="field"><span>Owner</span><select id="filter-owner">${ownerOptions}</select></label>
    <label class="field field--search"><span>搜索</span><input id="filter-query" type="search" placeholder="标题 / 编号 / 标签" autocomplete="off"></label>
    <button class="btn" id="reset" type="button">重置</button>
    <span class="result" id="result-count" aria-live="polite">显示 ${issues.length} / ${issues.length}</span>
  </div>

  <main id="main">
    <section class="summary" aria-label="概览">
      <div class="hero">
        <div class="hero-label">未关闭 issue</div>
        <div class="hero-value" id="hero-open">${summary.open}</div>
        <div class="hero-sub" id="hero-sub">共 ${summary.total} 个 issue · 数据截至 ${esc(asOf)}</div>
      </div>
      <div class="tiles">
        <div class="tile"><div class="tile-label"><span class="dot dot--partial"></span>Partial</div><div class="tile-value" id="tile-partial">${summary.counts.Partial ?? 0}</div><div class="tile-sub">一端完成、一端未完成</div></div>
        <div class="tile"><div class="tile-label"><span class="dot dot--blocked"></span>Blocked</div><div class="tile-value" id="tile-blocked">${summary.counts.Blocked ?? 0}</div><div class="tile-sub">外部依赖卡住</div></div>
        <div class="tile"><div class="tile-label"><span class="dot dot--verifying"></span>Verifying</div><div class="tile-value" id="tile-verifying">${summary.counts.Verifying ?? 0}</div><div class="tile-sub">已修待验收</div></div>
        <div class="tile"><div class="tile-label"><span class="dot dot--conflict"></span>需要关注</div><div class="tile-value" id="tile-attention">${summary.needsAttention}</div><div class="tile-sub" id="tile-attention-sub">${summary.unowned} 无人 · ${summary.stale} 超期 · ${summary.conflicts} 冲突 · ${summary.closedWithout} 缺验收</div></div>
      </div>
    </section>

    <section class="card" aria-label="状态分布">
      <div class="card-head"><h2>状态分布</h2><span class="meta" id="chart-meta">共 ${summary.total} 个 issue · ${summary.open} open</span></div>
      <div class="bar-wrap"><div class="bar" id="bar" role="group" aria-label="状态分布">${chartHtml(summary)}</div></div>
      <div class="legend" id="legend">${legendHtml(summary)}</div>
      <p class="chart-note" id="chart-note">${esc(chartNoteHtml(summary))}</p>
    </section>

    <section class="card table-card" aria-label="Issue 列表">
      <div class="table-head"><h2>Issue 列表</h2><span class="meta"><span class="table-hint">左右滑动查看完整列 · </span>点击表头排序</span></div>
      <div class="table-wrap">
        <table>
          <caption class="sr-only">Issue 列表；筛选在上方，点击表头排序。</caption>
          <thead>
            <tr>
              <th scope="col"><button type="button" data-sort="number">#</button></th>
              <th scope="col"><button type="button" data-sort="title">标题</button></th>
              <th scope="col"><button type="button" data-sort="status">状态</button></th>
              <th scope="col"><button type="button" data-sort="priority">优先级</button></th>
              <th scope="col"><button type="button" data-sort="owner">Owner</button></th>
              <th scope="col" class="col-scope"><button type="button" data-sort="scope">范围</button></th>
              <th scope="col" class="col-age"><button type="button" data-sort="age">年龄</button></th>
              <th scope="col"><button type="button" data-sort="updated">更新</button></th>
            </tr>
          </thead>
          <tbody id="tbody">${issues.map(rowHtml).join("")}</tbody>
        </table>
      </div>
      <div class="table-foot" id="table-count">共 ${issues.length} 个 issue</div>
    </section>

    <section class="attention" id="attention" aria-label="需要关注">
      <div class="card-head"><h2>需要关注</h2><span class="meta">无人负责 / 超期 / 状态冲突 / 关闭缺 verified</span></div>
      <div class="attention-grid" id="attention-grid">${attentionHtml(issues)}</div>
    </section>
  </main>

  <footer class="footer">
    状态以 GitHub 标签为准 · 由 <code>scripts/build-dashboard.mjs</code> 生成 · 数据来自 <a href="${esc(repoUrl)}/issues" target="_blank" rel="noreferrer">${esc(repository)}</a>
  </footer>
</div>
<div class="tooltip" id="tooltip" role="tooltip" hidden></div>
<noscript><p class="shell muted">筛选、排序和主题切换需要 JavaScript；下方表格已包含全部数据。</p></noscript>
<script>window.__DASHBOARD_DATA__ = ${json};</script>
<script>${client}</script>
</body>
</html>
`;

const markdown = `<!-- AUTO-GENERATED by scripts/build-dashboard.mjs; do not edit. -->
# ${title}

> 数据截至 ${asOf} · 状态以 GitHub 标签为准 · [打开 HTML 看板](./index.html)（GitHub 不渲染 HTML；启用 Pages 后可直接打开）

## 概览

| 指标 | 数量 |
| --- | ---: |
| 全部 | ${summary.total} |
| 未关闭 | ${summary.open} |
| 已关闭 | ${summary.closed} |
| Open（无状态） | ${summary.counts.Open ?? 0} |
| Partial | ${summary.counts.Partial ?? 0} |
| Blocked | ${summary.counts.Blocked ?? 0} |
| Verifying | ${summary.counts.Verifying ?? 0} |
| Closed | ${summary.counts.Closed ?? 0} |
| Not planned | ${summary.counts["Not planned"] ?? 0} |
| 无人负责 | ${summary.unowned} |
| 超期未更新 | ${summary.stale} |
| 状态冲突 | ${summary.conflicts} |
| 关闭缺 verified | ${summary.closedWithout} |

## 状态定义

| 状态 | 含义 |
| --- | --- |
| Open | 未完成，仍可复现 |
| Partial | 一端完成、另一端未完成；配合 \`owner/*\` 指明缺口 |
| Blocked | 外部依赖卡住；内部依赖优先用 blocked by 关系 |
| Verifying | 开发完成、自检通过，等待测试/验收 |
| Closed | 验收通过并关闭；产品裁定不修复用 Not planned |

## Open issues

| # | 标题 | 状态 | 优先级 | Owner | 更新 |
| ---: | --- | --- | --- | --- | --- |
${
  issues
    .filter((issue) => issue.state === "open")
    .map(
      (issue) =>
        `| #${issue.number} | [${mdCell(issue.title)}](${issue.url}) | ${mdCell(issue.status)} | ${mdCell(issue.priority ?? "—")} | ${mdCell(issue.owners.join(", ") || "未指定")} | ${issue.updatedDate} |`,
    )
    .join("\n") || "| — | 没有 open issue | — | — | — | — |"
}

## Closed issues

| # | 标题 | 状态 | 优先级 | 关闭 |
| ---: | --- | --- | --- | --- |
${
  issues
    .filter((issue) => issue.state === "closed")
    .map(
      (issue) =>
        `| #${issue.number} | [${mdCell(issue.title)}](${issue.url}) | ${mdCell(issue.status)} | ${mdCell(issue.priority ?? "—")} | ${mdCell(issue.updatedDate)} |`,
    )
    .join("\n") || "| — | 没有 closed issue | — | — | — |"
}

## 需要关注

${[
  summary.unowned ? `- **无人负责**：${summary.unowned} 个 open issue 没有 owner 标签，也没有 assignee。` : "",
  summary.stale ? `- **超期未更新**：${summary.stale} 个 issue 超过阈值没有更新（Verifying 7 天，Partial/Blocked 14 天，Open 30 天）。` : "",
  summary.conflicts ? `- **状态冲突**：${summary.conflicts} 个 issue 同时带多个 \`status/*\`。` : "",
  summary.closedWithout ? `- **关闭缺验收**：${summary.closedWithout} 个 issue 以 completed 关闭但没有 \`verified\`。` : "",
]
  .filter(Boolean)
  .join("\n") || "- 没有需要关注的项目。"}
`;

fs.mkdirSync("dashboard", { recursive: true });
fs.writeFileSync("dashboard/index.html", html);
fs.writeFileSync("dashboard/status.json", `${JSON.stringify(publicData, null, 2)}\n`);
fs.writeFileSync("dashboard/STATUS.md", markdown);

console.log(
  `dashboard: ${issues.length} issues -> dashboard/index.html, dashboard/status.json, dashboard/STATUS.md`,
);
