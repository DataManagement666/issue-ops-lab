#!/usr/bin/env node
// 文件职责：把 scripts/lib/samples.mjs 的演示 issue 写进当前仓库。
// 边界：只创建本脚本定义的样例；按标题幂等，已存在则跳过。
// 依赖：scripts/lib/github.mjs、scripts/lib/samples.mjs。

import {
  api,
  paginate,
  repo,
  requireEnv,
} from "./lib/github.mjs";
import { SAMPLES } from "./lib/samples.mjs";

requireEnv();

const existing = await paginate(`/repos/${repo}/issues?state=all`);
const byTitle = new Map(
  existing
    .filter((issue) => !issue.pull_request)
    .map((issue) => [issue.title, issue]),
);

let created = 0;
let skipped = 0;

for (const sample of SAMPLES) {
  const current = byTitle.get(sample.title);
  if (current) {
    skipped += 1;
    console.log(`skip     #${current.number} ${sample.title}`);
    continue;
  }

  const issue = await api(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: sample.title,
      body: sample.body,
      labels: sample.labels,
    }),
  });
  created += 1;
  console.log(`created  #${issue.number} ${sample.title}`);

  if (sample.comment) {
    await api(`/repos/${repo}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: sample.comment }),
    });
  }

  if (sample.close) {
    await api(`/repos/${repo}/issues/${issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
        state_reason: sample.close,
      }),
    });
    console.log(`closed   #${issue.number} (${sample.close})`);
  }
}

console.log(`\nseed: ${created} created, ${skipped} skipped`);
