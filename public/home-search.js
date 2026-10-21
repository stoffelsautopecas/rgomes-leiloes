(() => {
  const category = document.getElementById('homeCategory');
  const query = document.getElementById('homeQuery');
  const count = document.getElementById('homeSearchCount');
  let items = null;
  const update = () => {
    if (items) count.textContent = `(${items.filter((item) => window.rgomesCatalogMatches(item, category.value, query.value)).length})`;
  };
  const buttons = [...document.querySelectorAll('.home-search__category')];
  const syncCategory = () => {
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.category === category.value)));
    update();
  };
  buttons.forEach((button) => button.addEventListener('click', () => {
    category.value = button.dataset.category;
    syncCategory();
  }));
  category.addEventListener('change', syncCategory);
  query.addEventListener('input', update);
  fetch('/api/catalog/items?section=catalogo')
    .then((response) => { if (!response.ok) throw new Error('Catalog unavailable'); return response.json(); })
    .then((data) => { if (Array.isArray(data.items)) { items = data.items; update(); } })
    .catch(() => { count.textContent = ''; });
})();
