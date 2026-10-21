(() => {
  let lastTrigger;
  const modal = document.createElement("div");
  modal.className = "staff-contact-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="staff-contact-modal__backdrop" data-contact-close></div>
    <section class="staff-contact-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="staffContactTitle">
      <div class="staff-contact-modal__head">
        <div><h2 id="staffContactTitle">Fale com nossa equipe</h2><p>Escolha um funcionário para iniciar a conversa pelo WhatsApp.</p></div>
        <button class="staff-contact-modal__close" type="button" data-contact-close aria-label="Fechar">&times;</button>
      </div>
      <div class="staff-contact-list" aria-live="polite"></div>
    </section>`;
  document.body.append(modal);

  const list = modal.querySelector(".staff-contact-list");
  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("staff-contact-open");
    lastTrigger?.focus();
  };
  const normalizedNumber = value => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  };
  const decode = value => {
    try { return decodeURIComponent(value || ""); } catch { return value || ""; }
  };
  const messageFor = item => item.vehicle
    ? [
        "Olá, tenho interesse neste veículo da RGOMES LEILÕES:",
        `Veículo: ${item.vehicle}`,
        `Preço: ${item.price || "Sob consulta"}`,
        `Descrição: ${item.description || "Não informada"}`,
        item.image ? `Foto do veículo: ${item.image}` : ""
      ].filter(Boolean).join("\n")
    : "Olá, gostaria de falar com a equipe da RGOMES LEILÕES.";
  const render = (contacts, item) => {
    list.replaceChildren();
    if (!contacts.length) {
      const empty = document.createElement("p");
      empty.className = "staff-contact-message";
      empty.textContent = "Nenhum funcionário está disponível no WhatsApp neste momento.";
      list.append(empty);
      return;
    }
    contacts.forEach(contact => {
      const card = document.createElement("article");
      card.className = "staff-contact-card";
      const photo = contact.photo_url ? document.createElement("img") : document.createElement("div");
      photo.className = `staff-contact-card__photo${contact.photo_url ? "" : " staff-contact-card__photo--placeholder"}`;
      if (contact.photo_url) { photo.src = contact.photo_url; photo.alt = `Foto de ${contact.full_name}`; }
      else photo.textContent = String(contact.full_name || "V").trim().slice(0, 1).toUpperCase();
      const info = document.createElement("div");
      info.className = "staff-contact-card__info";
      const name = document.createElement("strong"); name.textContent = contact.full_name;
      const phone = document.createElement("span"); phone.textContent = contact.whatsapp;
      info.append(name, phone);
      const button = document.createElement("a");
      button.className = "staff-contact-card__button";
      button.textContent = "Conversar agora";
      button.href = `https://wa.me/${normalizedNumber(contact.whatsapp)}?text=${encodeURIComponent(messageFor(item))}`;
      button.target = "_blank";
      button.rel = "noopener noreferrer";
      card.append(photo, info, button);
      list.append(card);
    });
  };
  const loadContacts = () => fetch("/api/catalog/contacts", {headers:{accept:"application/json"}})
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível carregar os contatos.");
      return Array.isArray(data.contacts) ? data.contacts : [];
    });
  const open = async trigger => {
    lastTrigger = trigger;
    modal.hidden = false;
    document.body.classList.add("staff-contact-open");
    list.innerHTML = '<p class="staff-contact-message">Carregando equipe...</p>';
    modal.querySelector(".staff-contact-modal__close").focus();
    const item = {
      vehicle: decode(trigger.dataset.vehicle),
      price: decode(trigger.dataset.price),
      description: decode(trigger.dataset.description),
      image: decode(trigger.dataset.image)
    };
    try { render(await loadContacts(), item); }
    catch(error) {
      const message = document.createElement("p");
      message.className = "staff-contact-message";
      message.textContent = error.message;
      list.replaceChildren(message);
    }
  };

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-staff-contact]");
    if (trigger) { event.preventDefault(); open(trigger); return; }
    if (event.target.closest("[data-contact-close]")) close();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) close(); });
})();
