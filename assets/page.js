/* 书页用：主题切换（与首页共用 localStorage，切换后全站一致） */
(function () {
  "use strict";
  var KEY = "rl-theme";
  var btn = document.getElementById("themeBtn");
  if (!btn) return;

  function paint(t) {
    document.documentElement.setAttribute("data-theme", t);
    btn.innerHTML = t === "dark"
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }

  function current() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  paint(current());
  btn.onclick = function () { paint(current() === "dark" ? "light" : "dark"); };
})();
