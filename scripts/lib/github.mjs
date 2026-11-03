// 文件职责：issue-ops-lab 的 GitHub REST 小工具。
// 边界：只封装本仓库脚本需要的 REST 调用；不引入 octokit 等依赖。
// 依赖：GITHUB_TOKEN / GITHUB_REPOSITORY 环境变量（Actions 自动注入）。

const API = "https://api.github.com";

export const token = process.env.GITHUB_TOKEN;
export const repo = process.env.GITHUB_REPOSITORY;

export function requireEnv() {
  if (!token || !repo) {
    throw new Error("缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  }
}

function headers(extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "issue-ops-lab",
    ...extra,
  };
}

export async function api(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: headers(options.headers),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${options.method ?? "GET"} ${endpoint} -> ${response.status} ${text}`,
    );
  }
  return response.status === 204 ? null : response.json();
}

// 跟随 Link: rel="next" 翻页，直到没有下一页。
export async function paginate(endpoint) {
  const separator = endpoint.includes("?") ? "&" : "?";
  let url = `${API}${endpoint}${separator}per_page=100`;
  const items = [];
  while (url) {
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GET ${url} -> ${response.status} ${text}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`GET ${url} -> 预期数组，实际 ${typeof data}`);
    }
    items.push(...data);
    const link = response.headers.get("link") ?? "";
    url = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
  }
  return items;
}

export function labelsOf(issue) {
  return (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

export function hasLabel(issue, name) {
  return labelsOf(issue).includes(name);
}
