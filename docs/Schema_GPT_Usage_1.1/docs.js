// KR Database Schema 8.0 - shared browser helpers. Plain JavaScript, no dependencies.
(function () {
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var current = location.pathname.split('/').pop() || 'index.html';
    var active = null;
    document.querySelectorAll('.sidebar-link').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('#')[0].split('/').pop();
      if (href === current) { a.classList.add('active'); active = a; }
    });
    if (active) {
      var d = active.closest('details'); if (d) d.open = true;
      try { active.scrollIntoView({ block: 'center' }); } catch (e) {}
    }

    // Sidebar filter
    var sb = document.getElementById('sidebarSearch');
    if (sb) sb.addEventListener('input', function () {
      var q = sb.value.trim().toLowerCase();
      document.querySelectorAll('.sidebar details').forEach(function (d) {
        var any = false;
        d.querySelectorAll('.table-link').forEach(function (a) {
          var show = !q || a.textContent.toLowerCase().indexOf(q) >= 0;
          a.style.display = show ? '' : 'none'; if (show) any = true;
        });
        d.style.display = any || !q ? '' : 'none';
        if (q && any) d.open = true;
      });
    });

    // Generic filter: <input data-filter=".selector" data-count="#id">
    document.querySelectorAll('input[data-filter]').forEach(function (input) {
      var sel = input.getAttribute('data-filter');
      var countEl = document.querySelector(input.getAttribute('data-count') || '#none');
      var update = function () {
        var q = input.value.trim().toLowerCase(), shown = 0;
        document.querySelectorAll(sel).forEach(function (el) {
          var show = !q || (el.getAttribute('data-search') || el.textContent).toLowerCase().indexOf(q) >= 0;
          el.hidden = !show; if (show) shown++;
        });
        document.querySelectorAll('.group-block').forEach(function (g) {
          g.hidden = !!q && !g.querySelector(sel + ':not([hidden])');
        });
        if (countEl) countEl.textContent = shown + ' shown';
      };
      input.addEventListener('input', update); update();
    });

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pre = btn.parentElement.querySelector('pre'); if (!pre) return;
        var text = pre.innerText;
        var done = function () { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1200); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
        else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(ta); }
      });
    });

    // "/" focuses the first search box
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) {
        var i = document.querySelector('input[data-filter]') || document.getElementById('sidebarSearch');
        if (i) { e.preventDefault(); i.focus(); }
      }
    });
  });
})();
