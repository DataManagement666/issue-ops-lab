#!/usr/bin/env node
// 文件职责：把 .github/labels.json 同步到当前仓库。
// 边界：只创建/更新，不删除仓库里已有的其它标签（避免误删）。
// 依赖：scripts/lib/github.mjs；GITHUB_TOKEN / GITHUB_REPOSITORY。

import fs from "node:fs";
import path from "node:path";
import { api, paginate, repo, requireEnv } from "./lib/github.mjs";

requireEnv();

const manifestPath = path.resolve(".github/labels.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const existing = await paginate(`/repos/${repo}/labels`);
const byName = new Map(existing.map((label) => [label.name, label]));

let created = 0;
let updated = 0;
let unchanged = 0;

for (const label of manifest) {
  const current = byName.get(label.name);
  if (!current) {
    await api(`/repos/${repo}/labels`, {
      method: "POST",
      body: JSON.stringify({
        name: label.name,
        color: label.color,
        description: label.description ?? "",
      }),
    });
    created += 1;
    console.log(`created  ${label.name}`);
    continue;
  }

  const colorChanged =
    current.color.toLowerCase() !== label.color.toLowerCase();
  const descriptionChanged =
    (current.description ?? "") !== (label.description ?? "");
  if (!colorChanged && !descriptionChanged) {
    unchanged += 1;
    continue;
  }

  await api(`/repos/${repo}/labels/${encodeURIComponent(label.name)}`, {
    method: "PATCH",
    body: JSON.stringify({
      color: label.color,
      description: label.description ?? "",
    }),
  });
  updated += 1;
  console.log(`updated  ${label.name}`);
}

console.log(
  `\nlabels: ${created} created, ${updated} updated, ${unchanged} unchanged`,
);
