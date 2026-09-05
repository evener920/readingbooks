/* booknav.js — 读书库「书页导航」极小脚本（无依赖、零样式冲突）
 * 用法：在任意 books/<id>.html 的 </body> 前加一行：
 *   <script src="../assets/booknav.js"></script>
 * 它会自动注入一个悬浮导航条：返回书架 / 上一本 / 下一本 / 明暗切换。
 * 上一本·下一本 从 ../data/books.csv 按时间倒序算出（与首页一致）。
 * 本地双击(file://)打开时拿不到 CSV，自动隐藏上/下本，返回书架链接仍可用。
 */
(function () {
  var STYLE_ID = "rlbn-style";
  var css =
    ".rlbn-pill{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
    "display:flex;align-items:center;gap:2px;z-index:9999;" +
    "padding:6px 8px;border-radius:999px;" +
    "background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(12px);" +
    "-webkit-backdrop-filter:saturate(180%) blur(12px);" +
    "box-shadow:0 6px 24px rgba(20,20,16,.18),0 1px 2px rgba(20,20,16,.1);" +
    "border:1px solid rgba(0,0,0,.06);" +
    "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;" +
    "font-size:13px;color:#23211c;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center}" +
    ".rlbn-pill a,.rlbn-pill button{font:inherit;color:inherit;text-decoration:none;" +
    "border:none;background:transparent;cursor:pointer;padding:8px 12px;border-radius:999px;" +
    "display:inline-flex;align-items:center;gap:5px;white-space:nowrap;" +
    "transition:background .15s,color .15s}" +
    ".rlbn-pill a:hover,.rlbn-pill button:hover{background:rgba(47,87,71,.1);color:#2f5747}" +
    ".rlbn-sep{width:1px;height:18px;background:rgba(0,0,0,.1);margin:0 2px}" +
    ".rlbn-dark .rlbn-pill{background:rgba(28,29,23,.92);color:#eae6da;" +
    "border-color:rgba(255,255,255,.1);box-shadow:0 6px 24px rgba(0,0,0,.5)}" +
    ".rlbn-dark .rlbn-pill a:hover,.rlbn-dark .rlbn-pill button:hover" +
    "{background:rgba(134,191,162,.18);color:#a3d0b8}" +
    ".rlbn-dark .rlbn-sep{background:rgba(255,255,255,.15)}";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID; s.textContent = css; document.head.appendChild(s);
  }
  function isDark() {
    var t = localStorage.getItem("rl-theme");
    if (t) return t === "dark";
    return !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var root = document.getElementById("rlbn-root");
    if (root) root.className = dark ? "rlbn-dark" : "";
  }
  function themeBtn() {
    var b = document.createElement("button");
    b.innerHTML = "◐"; b.title = "切换明暗"; b.setAttribute("aria-label", "切换明暗");
    b.onclick = function () {
      applyTheme(!isDark());
      localStorage.setItem("rl-theme", isDark() ? "dark" : "light");
    };
    return b;
  }
  function link(href, txt) {
    var a = document.createElement("a"); a.href = href; a.textContent = txt; return a;
  }
  function sep() { var s = document.createElement("span"); s.className = "rlbn-sep"; return s; }

  function build(prev, next) {
    injectStyle();
    var root = document.createElement("nav");
    root.id = "rlbn-root"; root.className = isDark() ? "rlbn-dark" : "";
    var pill = document.createElement("div"); pill.className = "rlbn-pill";
    pill.appendChild(link("../index.html", "← 书架"));
    if (prev) { pill.appendChild(sep()); pill.appendChild(link("books/" + prev.id + ".html", "‹ " + prev.title)); }
    if (next) { pill.appendChild(sep()); pill.appendChild(link("books/" + next.id + ".html", next.title + " ›")); }
    pill.appendChild(sep()); pill.appendChild(themeBtn());
    root.appendChild(pill); document.body.appendChild(root);
  }

  function parseCSV(text) {
    text = text.replace(/\r\n?/g, "\n");
    var rows = [], row = [], field = "", i = 0, n = text.length, q = false;
    while (i < n) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function booksFromCSV(text) {
    var rows = parseCSV(text).filter(function (r) {
      return r.length && !(r.length === 1 && r[0].trim() === "");
    });
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim(); }), out = [], i, j;
    for (i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r.length === 1 && r[0].trim() === "") continue;
      var o = {};
      for (j = 0; j < header.length; j++) o[header[j]] = (r[j] !== undefined) ? r[j] : "";
      o.id = (o.id || "").trim(); o.title = (o.title || "").trim();
      if (!o.title) continue;
      out.push(o);
    }
    return out;
  }
  function currentId() {
    var f = location.pathname.split("/").pop() || "";
    return f.replace(/\.html?$/i, "");
  }
  function order(books) {
    return books.slice().sort(function (a, b) {
      return (b.finishedAt || b.startedAt || "").localeCompare(a.finishedAt || a.startedAt || "");
    });
  }
  function init() {
    var id = currentId();
    fetch("../data/books.csv", { cache: "no-cache" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var books = order(booksFromCSV(t));
        var i = books.findIndex(function (b) { return b.id === id; });
        if (i < 0) { build(null, null); return; }
        build(i > 0 ? books[i - 1] : null, i < books.length - 1 ? books[i + 1] : null);
      })
      .catch(function () { build(null, null); });
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
