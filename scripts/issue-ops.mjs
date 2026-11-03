#!/usr/bin/env node
// 文件职责：在 issue 事件与每日定时任务上维护状态机。
// 规则：
//   1. 一个 issue 最多一个 status/* 标签；
//   2. completed 关闭必须有 verified（或 duplicate / invalid / wontfix）；
//   3. reopened 或重新进入 partial/blocked/verifying 时移除 verified；
//   4. 加 status/verifying 时贴验收清单；
//   5. 定时提醒超期 issue，不自动关闭。
// 边界：只改标签、评论、开关状态；不改 issue 正文，不碰 dashboard 生成物。
// 依赖：scripts/lib/github.mjs。

import fs from "node:fs";
import {
  api,
  hasLabel,
  labelsOf,
  paginate,
  repo,
  requireEnv,
} from "./lib/github.mjs";

requireEnv();

const eventName = process.env.GITHUB_EVENT_NAME ?? "";
const eventPath = process.env.GITHUB_EVENT_PATH;
const event =
  eventPath && fs.existsSync(eventPath)
    ? JSON.parse(fs.readFileSync(eventPath, "utf8"))
    : {};
const action = event.action ?? "";
const issue = event.issue;

const STATUS_LABELS = ["status/partial", "status/blocked", "status/verifying"];
const STATUS_RANK = {
  "status/partial": 1,
  "status/blocked": 2,
  "status/verifying": 3,
};
const CLOSE_OK = new Set([
  "verified",
  "duplicate",
  "invalid",
  "wontfix",
]);
const STALE_DAYS = {
  "status/verifying": 7,
  "status/blocked": 14,
  "status/partial": 14,
  open: 30,
};

const isStatusLabel = (name) => name.startsWith("status/");
const isBot = event.sender?.login === "github-actions[bot]";

function log(...args) {
  console.log(...args);
}

async function listComments(number) {
  return paginate(`/repos/${repo}/issues/${number}/comments`);
}

async function addComment(number, body) {
  await api(`/repos/${repo}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function setLabels(number, labels) {
  await api(`/repos/${repo}/issues/${number}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels }),
  });
}

async function removeLabel(number, name) {
  try {
    await api(
      `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    return true;
  } catch (error) {
    if (String(error.message).includes("404")) return false;
    throw error;
  }
}

async function reopen(number) {
  await api(`/repos/${repo}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "open" }),
  });
}

async function hasCommentMarker(number, marker) {
  const comments = await listComments(number);
  return comments.some((comment) => (comment.body ?? "").includes(marker));
}

// 只保留一个 status/*；优先保留本次事件新增的那个。
async function normalizeStatus(number, issueLabels, preferred) {
  const statuses = issueLabels.filter(isStatusLabel);
  if (statuses.length <= 1) return { keep: statuses[0] ?? null, removed: [] };

  const keep =
    preferred && statuses.includes(preferred)
      ? preferred
      : [...statuses].sort(
          (a, b) => (STATUS_RANK[b] ?? 0) - (STATUS_RANK[a] ?? 0),
        )[0];
  const removed = statuses.filter((name) => name !== keep);
  const nextLabels = [
    ...issueLabels.filter((name) => !isStatusLabel(name)),
    keep,
  ];
  await setLabels(number, nextLabels);

  const marker = "<!-- status-normalized -->";
  if (!(await hasCommentMarker(number, marker))) {
    await addComment(
      number,
      `${marker}\n检测到多个状态标签（${statuses
        .map((name) => `\`${name}\``)
        .join("、")}），已保留 \`${keep}\` 并移除 ${removed
        .map((name) => `\`${name}\``)
        .join("、")}。\n\n一个 issue 只能有一个 \`status/*\` 标签；改状态请先移除旧标签。`,
    );
  }
  log(`#${number} normalized: keep ${keep}, removed ${removed.join(", ")}`);
  return { keep, removed };
}

async function resetVerification(number, issueLabels, reason) {
  if (!issueLabels.includes("verified")) return false;
  await removeLabel(number, "verified");
  const marker = "<!-- reverify -->";
  if (!(await hasCommentMarker(number, marker))) {
    await addComment(
      number,
      `${marker}\n${reason}\n\n已移除 \`verified\`；请重新走验收，通过后再由测试/验收方添加。`,
    );
  }
  log(`#${number} removed verified (${reason})`);
  return true;
}

async function ensureVerifyingChecklist(number) {
  const marker = "<!-- verifying-checklist -->";
  if (await hasCommentMarker(number, marker)) return;
  await addComment(
    number,
    `${marker}\n### 验收清单\n\n- [ ] 环境 / 镜像：\n- [ ] 复现步骤：\n- [ ] 实际结果：\n- [ ] 期望结果：\n- [ ] 证据（命令 / 响应 / 截图 / 链接）：\n- [ ] 结论：通过 / 不通过\n\n通过后请由测试/验收方添加 \`verified\` 标签，再关闭；开发自测不算关闭依据。`,
  );
  log(`#${number} added verifying checklist`);
}

async function closeGate(number, currentIssue) {
  const reason = currentIssue.state_reason ?? "completed";
  if (reason !== "completed") return;
  const labels = labelsOf(currentIssue);
  if (labels.some((name) => CLOSE_OK.has(name))) return;

  await reopen(number);
  const marker = "<!-- close-gate -->";
  await addComment(
    number,
    `${marker}\n按本仓库规则，\`completed\` 关闭需要 \`verified\`（或 \`duplicate\` / \`invalid\` / \`wontfix\`）。\n\n该 issue 缺少验收标签，已自动重新打开。产品裁定不修复请用 \`not planned\` 关闭；验收未通过请回到 \`status/partial\` 并写清缺口。`,
  );
  log(`#${number} reopened: completed close without verified`);
}

async function handleIssueEvent() {
  if (isBot) {
    log("skip: bot actor");
    return;
  }
  if (!issue) {
    log("skip: no issue payload");
    return;
  }

  const number = issue.number;
  const labels = labelsOf(issue);

  if (action === "opened") {
    await normalizeStatus(number, labels, null);
    if (labels.includes("status/verifying")) {
      await ensureVerifyingChecklist(number);
    }
    return;
  }

  if (action === "labeled" || action === "unlabeled") {
    const preferred = action === "labeled" ? event.label?.name : null;
    const { keep } = await normalizeStatus(number, labels, preferred);

    if (preferred === "status/verifying" && keep === "status/verifying") {
      await resetVerification(
        number,
        labels,
        "进入新一轮验收（`status/verifying`）。",
      );
      await ensureVerifyingChecklist(number);
      return;
    }

    if (
      preferred &&
      isStatusLabel(preferred) &&
      preferred !== "status/verifying"
    ) {
      await resetVerification(
        number,
        labels,
        `状态回到 \`${preferred}\`，不再处于待验收。`,
      );
    }
    return;
  }

  if (action === "closed") {
    await closeGate(number, issue);
    return;
  }

  if (action === "reopened") {
    await resetVerification(number, labels, "issue 被重新打开。");
  }
}

async function runStaleReminders() {
  const openIssues = (await paginate(`/repos/${repo}/issues?state=open`)).filter(
    (item) => !item.pull_request && !hasLabel(item, "dashboard"),
  );
  const now = Date.now();
  let reminded = 0;

  for (const item of openIssues) {
    const labels = labelsOf(item);
    const status = [...labels].reverse().find(isStatusLabel) ?? "open";
    const thresholdDays = STALE_DAYS[status] ?? 30;
    const cutoff = now - thresholdDays * 24 * 60 * 60 * 1000;
    const updatedAt = Date.parse(item.updated_at);
    if (Number.isNaN(updatedAt) || updatedAt > cutoff) continue;

    const marker = `<!-- stale-reminder:${status} -->`;
    const comments = await listComments(item.number);
    const alreadyReminded = comments.some(
      (comment) =>
        (comment.body ?? "").includes(marker) &&
        Date.parse(comment.created_at) > cutoff,
    );
    if (alreadyReminded) continue;

    await addComment(
      item.number,
      `${marker}\n这个 issue 处于 \`${status}\` 已超过 ${thresholdDays} 天没有更新。\n\n请补一条可执行的下一步：验收方给结论并加 \`verified\`，或把缺口写回 \`status/partial\` + \`owner/*\`。`,
    );
    reminded += 1;
    if (reminded >= 20) {
      log("stale: reached 20 reminders, stopping this run");
      break;
    }
  }
  log(`stale reminders: ${reminded}`);
}

try {
  if (eventName === "issues") {
    await handleIssueEvent();
  } else {
    await runStaleReminders();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
