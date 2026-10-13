// Палитры игры: выбор перекрашивает всю страницу. Цвета – в CSS (сборка делает их из
// src/data/palettes.json), здесь только атрибут на <html> и память о выборе.
const root = document.documentElement;
const group = document.querySelector('[data-palettes]');

if (group) {
  const current = root.getAttribute('data-palette') || 'classic';
  for (const input of group.querySelectorAll('input')) input.checked = input.value === current;
  group.addEventListener('change', e => {
    const id = e.target.value;
    root.setAttribute('data-palette', id);
    try { localStorage.setItem('tf-palette', id); } catch (err) { /* без памяти – до перезагрузки */ }
  });
}
