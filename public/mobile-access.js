(function () {
  const CURRENT_USER_KEY = "agro_current_user";
  const navs = Array.from(document.querySelectorAll(".mobile-nav"));

  if (!navs.length) {
    return;
  }

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const isAccessPage =
    path.endsWith("/login") ||
    path.endsWith("/login.html") ||
    path.endsWith("/cadastro") ||
    path.endsWith("/cadastro.html") ||
    ((path.endsWith("/rastreio") || path.endsWith("/rastreio.html")) && params.get("tab") === "profile");

  const getCurrentUser = () => {
    try {
      return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null");
    } catch (_error) {
      return null;
    }
  };

  const overlay = document.createElement("div");
  overlay.className = "mobile-access-sheet";
  overlay.innerHTML = `
    <div class="mobile-access-sheet__backdrop" data-mobile-access-close></div>
    <div class="mobile-access-sheet__panel" role="dialog" aria-modal="true" aria-label="Acessar conta">
      <div class="mobile-access-sheet__handle"></div>
      <div class="mobile-access-sheet__header">
        <strong>Acessar</strong>
        <button class="mobile-access-sheet__close" type="button" data-mobile-access-close aria-label="Fechar">×</button>
      </div>
      <div class="mobile-access-sheet__body" id="mobileAccessSheetBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const sheetBody = overlay.querySelector("#mobileAccessSheetBody");

  const closeSheet = () => {
    overlay.classList.remove("is-open");
    document.body.classList.remove("has-mobile-sheet-open");
  };

  const openSheet = () => {
    renderSheetActions();
    overlay.classList.add("is-open");
    document.body.classList.add("has-mobile-sheet-open");
  };

  const renderSheetActions = () => {
    const user = getCurrentUser();

    if (user) {
      sheetBody.innerHTML = `
        <a class="mobile-access-sheet__link" href="./rastreio.html?tab=overview">
          <span>Rastreio</span>
          <small>Acompanhar entrega</small>
        </a>
        <a class="mobile-access-sheet__link" href="./rastreio.html?tab=profile">
          <span>Meu Perfil</span>
          <small>Editar cadastro e foto</small>
        </a>
      `;
      return;
    }

    sheetBody.innerHTML = `
      <a class="mobile-access-sheet__link" href="./cadastro.html">
        <span>Cadastrar</span>
        <small>Criar nova conta</small>
      </a>
      <a class="mobile-access-sheet__link" href="./login.html">
        <span>Logar</span>
        <small>Entrar na sua conta</small>
      </a>
    `;
  };

  overlay.querySelectorAll("[data-mobile-access-close]").forEach((button) => {
    button.addEventListener("click", closeSheet);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSheet();
    }
  });

  navs.forEach((nav) => {
    const candidates = Array.from(nav.querySelectorAll(".mobile-nav-item"));
    const profileItem = candidates.find((item) => {
      const href = item.getAttribute("href") || "";
      return href.includes("login") || item.textContent.trim().toLowerCase() === "perfil";
    });

    if (!profileItem) {
      return;
    }

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = `mobile-nav-item mobile-nav-item--access${isAccessPage ? " active" : ""}`;
    trigger.textContent = "Acessar";
    trigger.addEventListener("click", openSheet);
    profileItem.replaceWith(trigger);
  });

  window.addEventListener("storage", renderSheetActions);
  renderSheetActions();
})();
