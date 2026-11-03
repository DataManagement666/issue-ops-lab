/* 文件职责：看板的筛选、排序、图表重绘、tooltip 和主题切换。
   边界：数据由 window.__DASHBOARD_DATA__ 注入；所有 issue 文本用 textContent，
   不用 innerHTML 拼接，避免标题/标签注入。 */
(function () {
  "use strict";

  var DATA = window.__DASHBOARD_DATA__;
  if (!DATA || !Array.isArray(DATA.issues)) return;

  var state = {
    status: "all",
    priority: "all",
    owner: "all",
    query: "",
    sortKey: "default",
    sortDir: "asc",
  };
  var currentCounts = {};
  var currentTotal = 0;

  function $(selector) {
    return document.querySelector(selector);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeUrl(url) {
    try {
      var parsed = new URL(String(url));
      return parsed.protocol === "https:" ? parsed.href : "#";
    } catch (error) {
      return "#";
    }
  }

  function meta(status) {
    return DATA.statusMeta[status] || DATA.statusMeta.Open;
  }

  function pct(count, total) {
    return total > 0 ? Math.round((count / total) * 100) : 0;
  }

  function statusBadge(status) {
    var m = meta(status);
    var badge = el("span", "badge badge--" + m.tone);
    var glyph = el("span", "glyph", m.glyph);
    glyph.setAttribute("aria-hidden", "true");
    badge.append(glyph, el("span", "", m.label));
    return badge;
  }

  function priorityBadge(priority) {
    if (!priority) return el("span", "muted", "—");
    var badge = el("span", "badge badge--" + String(priority).toLowerCase());
    var glyph = el("span", "glyph", "▲");
    glyph.setAttribute("aria-hidden", "true");
    badge.append(glyph, el("span", "", priority));
    return badge;
  }

  function chips(values, emptyText) {
    if (!values || values.length === 0) {
      return el("span", "muted", emptyText || "—");
    }
    var wrap = el("span", "chips");
    values.forEach(function (value) {
      wrap.append(el("span", "chip", value));
    });
    return wrap;
  }

  function linkTo(issue, text, className) {
    var link = el("a", className || "", text);
    link.href = safeUrl(issue.url);
    link.target = "_blank";
    link.rel = "noreferrer";
    return link;
  }

  function issueRow(issue) {
    var row = el("tr");
    row.dataset.number = String(issue.number);

    var numberCell = el("td", "num");
    numberCell.append(linkTo(issue, "#" + issue.number));

    var titleCell = el("td", "title");
    titleCell.append(linkTo(issue, issue.title));
    if (issue.displayLabels && issue.displayLabels.length) {
      titleCell.append(
        el("div", "row-sub", issue.displayLabels.join(" · ")),
      );
    }

    var statusCell = el("td");
    statusCell.append(statusBadge(issue.status));

    var priorityCell = el("td");
    priorityCell.append(priorityBadge(issue.priority));

    var ownerCell = el("td");
    ownerCell.append(chips(issue.owners, "未指定"));

    var scopeCell = el("td", "col-scope");
    scopeCell.append(chips(issue.scopes));

    var ageCell = el("td", "num col-age", issue.ageDays + "d");
    var updatedCell = el("td", "num", issue.updatedDate);

    row.append(
      numberCell,
      titleCell,
      statusCell,
      priorityCell,
      ownerCell,
      scopeCell,
      ageCell,
      updatedCell,
    );
    return row;
  }

  function statusRank(status) {
    var index = DATA.statusOrder.indexOf(status);
    return index === -1 ? 99 : index;
  }

  function priorityRank(priority) {
    if (priority === "P1") return 1;
    if (priority === "P2") return 2;
    if (priority === "P3") return 3;
    return 9;
  }

  function compare(a, b, key) {
    if (key === "number") return a.number - b.number;
    if (key === "title") return a.title.localeCompare(b.title, "zh-Hans");
    if (key === "status") return statusRank(a.status) - statusRank(b.status);
    if (key === "priority") return priorityRank(a.priority) - priorityRank(b.priority);
    if (key === "owner") {
      return String(a.owners[0] || "~").localeCompare(String(b.owners[0] || "~"));
    }
    if (key === "scope") {
      return String(a.scopes[0] || "~").localeCompare(String(b.scopes[0] || "~"));
    }
    if (key === "age") return a.ageDays - b.ageDays;
    if (key === "updated") return a.updatedAt.localeCompare(b.updatedAt);
    return 0;
  }

  function sortList(list) {
    var copy = list.slice();
    if (state.sortKey === "default") {
      copy.sort(function (a, b) {
        return (
          statusRank(a.status) - statusRank(b.status) ||
          priorityRank(a.priority) - priorityRank(b.priority) ||
          b.updatedAt.localeCompare(a.updatedAt)
        );
      });
      return copy;
    }
    var direction = state.sortDir === "desc" ? -1 : 1;
    copy.sort(function (a, b) {
      return compare(a, b, state.sortKey) * direction;
    });
    return copy;
  }

  function filteredIssues() {
    var status = $("#filter-status").value;
    var priority = $("#filter-priority").value;
    var owner = $("#filter-owner").value;
    var query = $("#filter-query").value.trim().toLowerCase();

    return DATA.issues.filter(function (issue) {
      if (status !== "all" && issue.status !== status) return false;
      if (priority !== "all" && issue.priority !== priority) return false;
      if (owner === "none" && issue.owners.length !== 0) return false;
      if (owner !== "all" && owner !== "none" && issue.owners.indexOf(owner) === -1) {
        return false;
      }
      if (query && issue.search.indexOf(query) === -1) return false;
      return true;
    });
  }

  function summarize(list) {
    var counts = {};
    DATA.barOrder.forEach(function (status) {
      counts[status] = 0;
    });
    counts.Conflict = 0;

    var open = 0;
    var unowned = 0;
    var stale = 0;
    var conflicts = 0;
    var closedWithout = 0;
    var needsAttention = new Set();

    list.forEach(function (issue) {
      counts[issue.status] = (counts[issue.status] || 0) + 1;
      if (issue.state === "open") open += 1;
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
    });

    return {
      counts: counts,
      open: open,
      unowned: unowned,
      stale: stale,
      conflicts: conflicts,
      closedWithout: closedWithout,
      needsAttention: needsAttention.size,
    };
  }

  function renderSummary(list) {
    var summary = summarize(list);
    $("#hero-open").textContent = String(summary.open);
    $("#hero-sub").textContent =
      "共 " + list.length + " 个 issue · 数据截至 " + DATA.dataAsOf;
    $("#tile-partial").textContent = String(summary.counts.Partial || 0);
    $("#tile-blocked").textContent = String(summary.counts.Blocked || 0);
    $("#tile-verifying").textContent = String(summary.counts.Verifying || 0);
    $("#tile-attention").textContent = String(summary.needsAttention);
    $("#tile-attention-sub").textContent =
      summary.unowned +
      " 无人 · " +
      summary.stale +
      " 超期 · " +
      summary.conflicts +
      " 冲突 · " +
      summary.closedWithout +
      " 缺验收";
    $("#result-count").textContent =
      "显示 " + list.length + " / " + DATA.issues.length;
  }

  function renderChart(list) {
    var summary = summarize(list);
    currentCounts = summary.counts;
    currentTotal = list.length;

    var bar = $("#bar");
    bar.textContent = "";
    if (list.length === 0) {
      bar.append(el("span", "empty", "没有匹配的 issue"));
    } else {
      DATA.barOrder.forEach(function (status) {
        var count = summary.counts[status] || 0;
        if (count === 0) return;
        var m = meta(status);
        var button = el("button", "seg seg--" + m.tone);
        button.type = "button";
        button.dataset.status = status;
        button.style.flexGrow = String(count);
        button.setAttribute(
          "aria-label",
          m.label + " " + count + " 个，占 " + pct(count, list.length) + "%",
        );
        button.append(el("span", "seg-fill"));
        bar.append(button);
      });
    }

    var legend = $("#legend");
    legend.textContent = "";
    DATA.barOrder.forEach(function (status) {
      var count = summary.counts[status] || 0;
      var m = meta(status);
      var item = el("span", "legend-item");
      item.append(el("span", "dot dot--" + m.tone));
      item.append(el("span", "", m.label));
      item.append(el("span", "legend-count", String(count)));
      item.append(el("span", "legend-pct", pct(count, list.length) + "%"));
      legend.append(item);
    });

    $("#chart-meta").textContent =
      "共 " + list.length + " 个 issue · " + summary.open + " open";

    var noteParts = ["Open 表示还没有 status/* 标签"];
    if (summary.counts["Not planned"]) {
      noteParts.push(
        "Not planned " + summary.counts["Not planned"] + " 个（单独显示，不计入 Closed）",
      );
    }
    if (summary.counts.Conflict) {
      noteParts.push(
        "Conflict " + summary.counts.Conflict + " 个（状态冲突，不计入条形图）",
      );
    }
    $("#chart-note").textContent =
      noteParts.join("；") + "；一个 issue 最多一个 status/*。";
  }

  function updateSortHeader() {
    document.querySelectorAll("thead th").forEach(function (th) {
      var button = th.querySelector("[data-sort]");
      if (!button) return;
      if (button.dataset.sort === state.sortKey) {
        th.setAttribute(
          "aria-sort",
          state.sortDir === "desc" ? "descending" : "ascending",
        );
      } else {
        th.setAttribute("aria-sort", "none");
      }
    });
  }

  function renderTable(list) {
    var body = $("#tbody");
    body.textContent = "";
    var sorted = sortList(list);
    sorted.forEach(function (issue) {
      body.append(issueRow(issue));
    });
    $("#table-count").textContent = "共 " + list.length + " 个 issue";
    updateSortHeader();
  }

  function renderAttention(list) {
    var groups = [
      {
        label: "无人负责",
        reason: "无人负责",
        items: list.filter(function (issue) {
          return issue.state === "open" && issue.unowned;
        }),
      },
      {
        label: "超期未更新",
        reason: function (issue) {
          return issue.staleDays + "+ 天未更新";
        },
        items: list.filter(function (issue) {
          return issue.stale;
        }),
      },
      {
        label: "状态冲突",
        reason: "多个 status/*",
        items: list.filter(function (issue) {
          return issue.conflict;
        }),
      },
      {
        label: "关闭但缺 verified",
        reason: "缺验收标签",
        items: list.filter(function (issue) {
          return issue.closedWithoutVerification;
        }),
      },
    ];

    var grid = $("#attention-grid");
    grid.textContent = "";
    var visible = groups.filter(function (group) {
      return group.items.length > 0;
    });

    if (visible.length === 0) {
      var card = el("div", "attention-card");
      card.append(el("h3", "", "没有需要关注的项目"));
      card.append(el("p", "muted", "无人负责、超期、状态冲突、关闭缺验收均为 0。"));
      grid.append(card);
      return;
    }

    visible.forEach(function (group) {
      var card = el("div", "attention-card");
      card.append(el("h3", "", group.label + " · " + group.items.length));
      var listNode = el("ul", "attention-list");
      group.items.slice(0, 8).forEach(function (issue) {
        var item = el("li");
        var reason =
          typeof group.reason === "function"
            ? group.reason(issue)
            : group.reason;
        item.append(el("span", "reason", reason));
        item.append(linkTo(issue, "#" + issue.number + " " + issue.title));
        listNode.append(item);
      });
      card.append(listNode);
      if (group.items.length > 8) {
        card.append(
          el("p", "muted", "还有 " + (group.items.length - 8) + " 个，见上方表格。"),
        );
      }
      grid.append(card);
    });
  }

  function render() {
    var list = filteredIssues();
    renderSummary(list);
    renderChart(list);
    renderTable(list);
    renderAttention(list);
  }

  // Tooltip: 每个状态段是 24px 高的按钮；hover 与键盘 focus 显示同样信息。
  var tooltip = $("#tooltip");
  function showTooltip(segment) {
    var status = segment.dataset.status;
    var m = meta(status);
    var count = currentCounts[status] || 0;
    tooltip.textContent = "";
    var strong = el("strong", "", String(count));
    tooltip.append(strong, document.createTextNode(" · " + m.label));
    tooltip.append(
      document.createTextNode(" · " + pct(count, currentTotal) + "%"),
    );
    tooltip.hidden = false;

    var rect = segment.getBoundingClientRect();
    var left = rect.left + rect.width / 2 + window.scrollX;
    var top = rect.top + window.scrollY - 8;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    tooltip.style.transform = "translate(-50%, -100%)";

    var box = tooltip.getBoundingClientRect();
    var padding = 8;
    if (box.left < padding) {
      tooltip.style.left = left + (padding - box.left) + "px";
    } else if (box.right > window.innerWidth - padding) {
      tooltip.style.left =
        left - (box.right - (window.innerWidth - padding)) + "px";
    }
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function bindChartTooltip() {
    var bar = $("#bar");
    bar.addEventListener("pointermove", function (event) {
      var segment = event.target.closest(".seg");
      if (segment) showTooltip(segment);
      else hideTooltip();
    });
    bar.addEventListener("pointerleave", hideTooltip);
    bar.addEventListener("focusin", function (event) {
      var segment = event.target.closest(".seg");
      if (segment) showTooltip(segment);
    });
    bar.addEventListener("focusout", hideTooltip);
  }

  function bindSorting() {
    document.querySelectorAll("[data-sort]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir =
            key === "updated" || key === "age" ? "desc" : "asc";
        }
        renderTable(filteredIssues());
      });
    });
  }

  function bindFilters() {
    ["#filter-status", "#filter-priority", "#filter-owner"].forEach(function (
      selector,
    ) {
      $(selector).addEventListener("change", function () {
        state.status = $("#filter-status").value;
        state.priority = $("#filter-priority").value;
        state.owner = $("#filter-owner").value;
        render();
      });
    });
    $("#filter-query").addEventListener("input", function () {
      state.query = $("#filter-query").value;
      render();
    });
    $("#reset").addEventListener("click", function () {
      $("#filter-status").value = "all";
      $("#filter-priority").value = "all";
      $("#filter-owner").value = "all";
      $("#filter-query").value = "";
      state.status = "all";
      state.priority = "all";
      state.owner = "all";
      state.query = "";
      render();
    });
  }

  function bindTheme() {
    var root = document.documentElement;
    var button = $("#theme-toggle");

    function savedTheme() {
      try {
        return localStorage.getItem("issue-ops-theme");
      } catch (error) {
        return null;
      }
    }

    function updateButton() {
      var dark = root.dataset.theme !== "light";
      button.textContent = dark ? "浅色模式" : "深色模式";
      button.setAttribute(
        "aria-label",
        dark ? "切换到浅色模式" : "切换到深色模式",
      );
    }

    var saved = savedTheme();
    if (saved === "light" || saved === "dark") {
      root.dataset.theme = saved;
    }
    updateButton();

    button.addEventListener("click", function () {
      var next = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      try {
        localStorage.setItem("issue-ops-theme", next);
      } catch (error) {
        /* 隐私模式下忽略 */
      }
      updateButton();
    });
  }

  bindChartTooltip();
  bindSorting();
  bindFilters();
  bindTheme();
  render();
})();
