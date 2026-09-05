/* ==========================================================================
 *  我的读书库 · 首页交互
 *  纯静态，无依赖。数据来自 data/books.csv（运行时读取）。
 *  点卡片会跳转到该书的独立页面 books/<id>.html
 *
 *  读取顺序：先尝试拉取 data/books.csv → 解析成书单；
 *            若拉取失败（如本地直接双击打开 file://），则回退到
 *            data/books.js 里的 window.BOOKS（兜底备份）。
 * ========================================================================== */
(function () {
  "use strict";

  var BOOKS = [];   // 由 loadData 填充
  var STATUS_LABEL = { wish: "想读", reading: "在读", done: "已读" };

  /* 自动生成书封用的配色（改这里，books/ 下页面的配色要同步改
     scripts/rl_data.py 上方 PALETTE 注释 / build_pages.py 里的 PALETTE，
     两处保持一致） */
  var PALETTE = [
    ["#3d6b58", "#1f3a30"], ["#8a5a3b", "#4a2f1c"], ["#3f5b7d", "#22354d"],
    ["#7a4b5e", "#43273a"], ["#6a6a3f", "#3b3b22"], ["#4a4a6b", "#262640"],
    ["#8c5a4a", "#4c2b20"], ["#2f6b6b", "#173a3a"], ["#6b5a8c", "#382e52"],
    ["#7d6a3f", "#463a1f"]
  ];

  var $ = function (s, r) { return (r || document).querySelector(s); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function hash(s) {
    var h = 0, str = String(s || "");
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return h;
  }

  function gradient(b) {
    var p = PALETTE[hash(b.id || b.title) % PALETTE.length];
    return "linear-gradient(150deg," + p[0] + " 0%," + p[1] + " 100%)";
  }

  /* 封面：有图用图，无图或加载失败则生成书封 */
  function coverHTML(b) {
    var inner = '<div class="ph" style="background:' + gradient(b) + '">' +
      '<div class="ph-title">' + esc(b.title) + "</div>" +
      '<div class="ph-author">' + esc(b.author || "") + "</div></div>";
    if (b.cover) {
      return inner + '<img src="' + esc(b.cover) + '" alt="' + esc(b.title) + '" loading="lazy" ' +
        'onerror="this.style.display=\'none\'">';
    }
    return inner;
  }

  function stars(n) {
    if (!n) return "";
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= n ? "★" : '<span class="off">★</span>';
    return '<span class="stars">' + s + "</span>";
  }

  function pageURL(b) {
    return "books/" + encodeURIComponent(b.id || "") + ".html";
  }

  /* -------------------------------------------------- CSV 解析（RFC4180） -- */
  function parseCSV(text) {
    text = String(text).replace(/\r\n?/g, "\n");
    var rows = [], row = [], field = "", i = 0, n = text.length, inQ = false;
    while (i < n) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(field); field = ""; i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function csvToBooks(text) {
    var rows = parseCSV(text).filter(function (r) {
      return r.length && !(r.length === 1 && r[0].trim() === "");
    });
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim(); });
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r.length === 1 && r[0].trim() === "") continue;
      var o = {}, j;
      for (j = 0; j < header.length; j++) o[header[j]] = (r[j] !== undefined) ? r[j] : "";
      o.id = (o.id || "").trim();
      o.title = (o.title || "").trim();
      if (!o.title) continue;   // 没书名的行跳过
      var splitList = function (s) {
        return s ? s.split(";").map(function (x) { return x.trim(); }).filter(Boolean) : [];
      };
      o.tags = splitList(o.tags);
      o.quotes = splitList(o.quotes);
      o.progress = o.progress ? (parseInt(o.progress, 10) || 0) : 0;
      o.rating = o.rating ? (parseInt(o.rating, 10) || 0) : 0;
      o.year = o.year ? parseInt(o.year, 10) : "";
      out.push(o);
    }
    return out;
  }

  /* ------------------------------------------------------------ 统计 -- */
  function renderStats() {
    var total = BOOKS.length;
    var done = BOOKS.filter(function (b) { return b.status === "done"; }).length;
    var reading = BOOKS.filter(function (b) { return b.status === "reading"; }).length;
    var notes = BOOKS.filter(function (b) {
      return (b.notes && String(b.notes).trim()) || (b.quotes && b.quotes.length);
    }).length;
    var data = [[total, "藏书"], [reading, "在读"], [done, "已读"], [notes, "有笔记"]];
    $("#stats").innerHTML = data.map(function (d) {
      return '<div class="stat"><div class="num">' + d[0] + '</div><div class="lbl">' + d[1] + "</div></div>";
    }).join("");
  }

  /* ------------------------------------------------------ 筛选 / 排序 -- */
  var state = { q: "", status: "all", cat: "all", sort: "recent" };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = BOOKS.filter(function (b) {
      if (state.status !== "all" && b.status !== state.status) return false;
      if (state.cat !== "all" && b.category !== state.cat) return false;
      if (!q) return true;
      var hay = [b.title, b.author, b.category, b.publisher, b.summary, (b.tags || []).join(" ")]
        .join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    var by = {
      recent: function (a, b) {
        return (b.finishedAt || b.startedAt || "").localeCompare(a.finishedAt || a.startedAt || "");
      },
      title: function (a, b) { return a.title.localeCompare(b.title, "zh-Hans-CN"); },
      rating: function (a, b) { return (b.rating || 0) - (a.rating || 0); },
      progress: function (a, b) { return (b.progress || 0) - (a.progress || 0); }
    };
    return out.sort(by[state.sort] || by.recent);
  }

  /* ------------------------------------------------------------ 渲染 -- */
  function render() {
    var list = filtered();
    var grid = $("#grid");

    if (!list.length) {
      grid.innerHTML = '<div class="empty"><div class="big">这里还空着</div>' +
        "<div>换个关键词，或者往 <code>data/books.csv</code> 里加一行</div></div>";
      return;
    }

    grid.innerHTML = list.map(function (b, i) {
      var p = Math.max(0, Math.min(100, Number(b.progress) || 0));
      return '<a class="card" href="' + esc(pageURL(b)) + '" title="查看《' + esc(b.title) + '》" ' +
        'style="animation-delay:' + Math.min(i * 22, 400) + 'ms">' +
        '<div class="cover">' + coverHTML(b) +
          (b.status !== "done" ? '<span class="badge ' + esc(b.status) + '">' +
            STATUS_LABEL[b.status] + "</span>" : "") +
          '<span class="enter">进入 &rarr;</span>' +
        "</div>" +
        '<div class="meta">' +
          '<div class="title">' + esc(b.title) + "</div>" +
          '<div class="author">' + esc(b.author || "") + "</div>" +
          '<div class="row">' + stars(b.rating) +
            (b.category ? '<span class="bar-txt" style="margin:0">' + esc(b.category) + "</span>" : "") +
          "</div>" +
          (b.status === "reading"
            ? '<div class="bar"><i style="width:' + p + '%"></i></div>' +
              '<div class="bar-txt">' + p + "%</div>"
            : "") +
        "</div></a>";
    }).join("");
  }

  /* ------------------------------------------------------------ 主题 -- */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("rl-theme", t); } catch (e) {}
    $("#themeBtn").innerHTML = t === "dark"
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
  }

  /* ------------------------------------------------------------ 启动 -- */
  function init() {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

    $("#themeBtn").onclick = function () {
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    };

    /* 分类下拉 */
    var cats = [];
    BOOKS.forEach(function (b) { if (b.category && cats.indexOf(b.category) < 0) cats.push(b.category); });
    $("#cat").innerHTML = '<option value="all">全部分类</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");

    var t;
    $("#q").addEventListener("input", function (e) {
      clearTimeout(t);
      var v = e.target.value;
      t = setTimeout(function () { state.q = v; render(); }, 140);
    });

    document.querySelectorAll(".chip").forEach(function (c) {
      c.onclick = function () {
        document.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        state.status = c.dataset.status;
        render();
      };
    });

    $("#cat").onchange = function () { state.cat = this.value; render(); };
    $("#sort").onchange = function () { state.sort = this.value; render(); };

    renderStats();
    render();
  }

  /* -------------------------------------------------- 加载数据（CSV 优先） -- */
  function loadData(done) {
    function fallback() {
      BOOKS = (window.BOOKS || []).slice();
      done();
    }
    if (typeof fetch !== "function") { fallback(); return; }
    fetch("data/books.csv", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
      .then(function (t) {
        try { BOOKS = csvToBooks(t); }
        catch (e) { BOOKS = (window.BOOKS || []).slice(); }
        done();
      })
      .catch(function () { fallback(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { loadData(init); });
  } else {
    loadData(init);
  }
})();
