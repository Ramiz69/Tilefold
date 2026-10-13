(function () {
var d = document.documentElement;
d.classList.remove('no-js');
d.classList.add('js');
try {
var t = localStorage.getItem('tf-theme');
if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
var p = localStorage.getItem('tf-palette');
if (p && /^[a-z]+$/.test(p)) d.setAttribute('data-palette', p);
} catch (e) { /* хранилище недоступно: системная тема и «Классика» */ }
if (/[?&]motion=reduced/.test(location.search) || matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('rm');
})();
