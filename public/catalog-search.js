(() => {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  window.rgomesCatalogMatches = (item, category, query) => {
    const matchesCategory = category === 'all' || normalize(item.category) === normalize(category);
    const text = normalize([item.title, item.category, item.location].filter(Boolean).join(' '));
    return matchesCategory && normalize(query).split(/\s+/).every((word) => text.includes(word));
  };
})();
