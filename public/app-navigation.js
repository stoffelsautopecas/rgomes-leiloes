(() => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    catalog: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    tracking: '<path d="M3 6h11v12H3zM14 10h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    contract: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;
  document.querySelectorAll('.mobile-nav-item').forEach((item, index) => {
    const label = item.textContent.trim();
    item.innerHTML = icon(['home','catalog','about','tracking','profile'][index] || 'profile') + `<span>${label}</span>`;
    if (item.classList.contains('active')) item.setAttribute('aria-current','page');
  });
  const dashboard = document.getElementById('adminDashboard');
  if (!dashboard) return;
  const nav = document.createElement('nav');
  nav.className = 'admin-app-nav';
  nav.setAttribute('aria-label', 'Navegação rápida do painel');
  const tabs = [['overview','Painel','home'],['clients','Clientes','profile'],['trackings','Rastreios','tracking'],['contracts','Contratos','contract'],['menu','Menu','menu']];
  tabs.forEach(([target,label,key]) => {
    const button=document.createElement('button');button.type='button';button.dataset.appTab=target;
    button.innerHTML=icon(key)+`<span>${label}</span>`;
    button.addEventListener('click',()=>{
      document.querySelector(target==='menu'?'#adminMenuToggle':`.admin-sidebar [data-tab-target="${target}"]`)?.click();
      if(target!=='menu') window.scrollTo({top:0,behavior:'instant'});
    });
    nav.append(button);
  });
  dashboard.append(nav);
  const sync=()=>{
    const active=document.querySelector('.admin-sidebar .admin-tab.is-active')?.dataset.tabTarget;
    nav.querySelectorAll('button').forEach(button=>{
      const selected=button.dataset.appTab===active || (button.dataset.appTab==='menu' && !tabs.some(([target])=>target===active));
      button.classList.toggle('is-active',selected);
      if(selected) button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  };
  new MutationObserver(sync).observe(document.getElementById('adminSidebar'),{subtree:true,attributes:true,attributeFilter:['class']});
  sync();
})();
