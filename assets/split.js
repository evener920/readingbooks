/* split.js — 书页双栏对照（左正文 / 右笔记）
 * 职责：① 中缝可拖拽调宽（桌面）② 双栏同步滚动 ③ 加载笔记到右栏
 * 笔记来源：优先 ./<id>-notes.html（与书页同目录、同名）；
 *          缺失则回退到页面内 <script id="book-meta"> 的 notes/quotes；
 *          都没有则显示占位提示。
 * 由书页 </body> 前引入。 */
(function () {
  "use strict";
  var split = document.querySelector(".reader-split");
  if (!split) return;
  var textPane = split.querySelector(".pane-text");
  var notesPane = split.querySelector(".pane-notes");
  var divider = split.querySelector(".divider");
  var isMobile = window.matchMedia && matchMedia("(max-width: 860px)").matches;

  /* ── 1) 中缝拖拽 ── */
  if (divider && !isMobile) {
    var dragging = false;
    divider.addEventListener("mousedown", function (e) { dragging = true; divider.classList.add("drag"); e.preventDefault(); });
    window.addEventListener("mouseup", function () { dragging = false; divider.classList.remove("drag"); });
    window.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var rect = split.getBoundingClientRect();
      var w = (e.clientX - rect.left) / rect.width * 100;
      w = Math.max(28, Math.min(72, w));
      split.style.setProperty("--text-w", w + "%");
    });
    // 触摸拖拽
    divider.addEventListener("touchstart", function () { dragging = true; }, { passive: true });
    window.addEventListener("touchend", function () { dragging = false; });
    window.addEventListener("touchmove", function (e) {
      if (!dragging || !e.touches[0]) return;
      var rect = split.getBoundingClientRect();
      var w = (e.touches[0].clientX - rect.left) / rect.width * 100;
      w = Math.max(28, Math.min(72, w));
      split.style.setProperty("--text-w", w + "%");
    }, { passive: true });
  }

  /* ── 2) 双栏同步滚动（桌面，按占比） ── */
  if (!isMobile && textPane && notesPane) {
    var lock = false;
    function sync(from, to) {
      if (lock) return;
      var max = from.scrollHeight - from.clientHeight;
      if (max <= 0) return;
      lock = true;
      to.scrollTop = from.scrollTop / max * (to.scrollHeight - to.clientHeight);
      requestAnimationFrame(function () { lock = false; });
    }
    textPane.addEventListener("scroll", function () { sync(textPane, notesPane); }, { passive: true });
    notesPane.addEventListener("scroll", function () { sync(notesPane, textPane); }, { passive: true });
  }

  /* ── 3) 加载笔记 ── */
  function currentId() {
    var f = location.pathname.split("/").pop() || "";
    return f.replace(/\.html?$/i, "");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderMeta(meta) {
    var notes = (meta && meta.notes) ? String(meta.notes).split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
    var quotes = (meta && meta.quotes) ? (Array.isArray(meta.quotes) ? meta.quotes : String(meta.quotes).split(/[;\n]+/)).map(function (x) { return String(x).trim(); }).filter(Boolean) : [];
    if (!notes.length && !quotes.length) return false;
    var html = '<div class="notes-data">';
    if (notes.length) {
      html += "<h2>读书笔记</h2>";
      notes.forEach(function (n) { html += '<div class="nd-note">' + esc(n) + "</div>"; });
    }
    if (quotes.length) {
      html += "<h2>摘句</h2>";
      quotes.forEach(function (q) { html += '<div class="nd-quote">' + esc(q) + "</div>"; });
    }
    html += "</div>";
    notesPane.innerHTML = html;
    return true;
  }

  function renderEmpty() {
    notesPane.innerHTML =
      '<div class="notes-empty"><div class="ne-ico">✎</div>' +
      "<div>这一本还没有笔记页</div>" +
      '<div class="ne-tip">用 add-book 脚本上传「笔记 HTML」即可在此对照阅读；' +
      "或把笔记/摘句填进 data/books.csv 的 notes / quotes 字段也会自动显示在这里。</div></div>";
  }

  function injectNotesDoc(htmlText) {
    var doc = new DOMParser().parseFromString(htmlText, "text/html");
    // 把笔记页自身的 <style>/<link> 并入当前 head（用户自管，避免全局冲突由作者负责）
    Array.prototype.forEach.call(doc.querySelectorAll("style,link[rel=stylesheet]"), function (n) {
      document.head.appendChild(n.cloneNode(true));
    });
    var body = doc.body ? doc.body.innerHTML : htmlText;
    notesPane.innerHTML = '<div class="notes-doc">' + body + "</div>";
  }

  function loadNotes() {
    if (!notesPane) return;
    // 先试同名笔记页
    fetch("./" + encodeURIComponent(currentId()) + "-notes.html", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("no notes"); return r.text(); })
      .then(function (t) { injectNotesDoc(t); })
      .catch(function () {
        // 回退到页面内 book-meta
        var m = document.getElementById("book-meta");
        var meta = null;
        if (m) { try { meta = JSON.parse(m.textContent); } catch (e) {} }
        if (!renderMeta(meta)) renderEmpty();
      });
  }

  // 等正文（含内部资源）大致就绪再加载笔记
  if (document.readyState === "complete") loadNotes();
  else window.addEventListener("load", loadNotes);
})();
