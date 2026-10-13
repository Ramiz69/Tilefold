export function initReveal() {
const items = document.querySelectorAll('[data-play]');
if (!items.length || !('IntersectionObserver' in window)) return;
const io = new IntersectionObserver(entries => {
for (const e of entries) e.target.classList.toggle('playing', e.isIntersecting);
}, { threshold: 0.4 });
items.forEach(el => io.observe(el));
}
