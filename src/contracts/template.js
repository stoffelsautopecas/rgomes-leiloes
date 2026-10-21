const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const formatDateLong = (value) => {
  if (!value) {
    return "";
  }

  const stringValue = String(value).trim();
  const normalizedValue = /^\d{4}-\d{2}-\d{2}/.test(stringValue)
    ? `${stringValue.slice(0, 10)}T12:00:00`
    : value;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo"
  }).format(date);
};

const buildSignatureText = (fullName, style = "cursive") => {
  const name = String(fullName || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);

  if (style === "abbrev-cursive") {
    if (parts.length <= 1) {
      return name;
    }

    const [firstName, ...rest] = parts;
    const initials = rest.map((part) => `${part[0].toUpperCase()}.`).join(" ");
    return `${firstName} ${initials}`.trim();
  }

  return name;
};

const formatCompanySignatureText = (value) => String(value || "").trim();

const getSignatureClass = (style = "cursive") => {
  if (style === "hand") {
    return "signature-style-hand";
  }

  if (style === "abbrev-cursive") {
    return "signature-style-abbrev-cursive";
  }

  return "signature-style-cursive";
};

const formatSignatureHash = (value, fallback) => escapeHtml(String(value || fallback || "-"));

export const renderAcquisitionContractHtml = (contract) => {
  const brandName = "RGOMES LEILÕES";
  const sellerLegalName = "RICARDO FERREIRA GOMES LEILOEIRO OFICIAL - ME";
  const sellerCnpj = "41.624.184/0001-48";
  const sellerAddress = "Rua Figueira, nº 570, bairro Santa Rita I, Londrina - PR, CEP 86072-160";
  const sellerSignatureText = escapeHtml(
    formatCompanySignatureText(contract.sellerSignatureText || contract.sellerName)
  );
  const clientSignatureText = escapeHtml(
    contract.clientSignedAt
      ? contract.clientSignatureText ||
          buildSignatureText(contract.clientName, contract.clientSignatureStyle || "cursive")
      : "ASSINATURA DIGITAL DO CLIENTE"
  );
  const clientSignatureStyleClass = getSignatureClass(contract.clientSignatureStyle || "cursive");
  const sellerSignatureStyleClass = getSignatureClass("hand");
  const sellerSignatureHash = formatSignatureHash(contract.sellerSignatureHash, `sig_${String(contract.publicToken || "seller").slice(-8)}`);
  const clientSignatureHash = contract.clientSignedAt
    ? formatSignatureHash(contract.clientSignatureHash, `sig_${String(contract.publicToken || "client").slice(0, 8)}`)
    : "PENDENTE DE ASSINATURA";

  return `
    <article class="contract-document">
      <header class="contract-document__header">
        <div class="contract-document__brand">
          <img src="/logorgomes.jpeg" alt="${brandName}" />
          <div>
            <strong>${brandName}</strong>
            <span>LEILOEIRO OFICIAL</span>
          </div>
        </div>

        <div class="contract-document__meta">
          <p class="contract-eyebrow">DOCUMENTO PARTICULAR COM ASSINATURA ELETRÔNICA</p>
          <h1>CONTRATO DE AQUISIÇÃO DE VEÍCULOS E MAQUINÁRIOS</h1>
        </div>

        <p class="contract-lead">
          Pelo presente instrumento particular, de um lado <strong>${escapeHtml(sellerLegalName)}</strong>,
          inscrito no CNPJ sob o nº <strong>${sellerCnpj}</strong>, com endereço comercial em
          <strong>${sellerAddress}</strong>,
          doravante denominada VENDEDORA, e de outro lado <strong>${escapeHtml(contract.clientName || "CLIENTE")}</strong>,
          inscrito no CPF sob o nº <strong>${escapeHtml(contract.clientCpf || "-")}</strong>,
          residente e domiciliado em <strong>${escapeHtml(contract.clientAddress || "-")}</strong>,
          doravante denominado COMPRADOR.
        </p>
      </header>

      <section class="contract-section">
        <h2>CLÁUSULA PRIMEIRA - DO OBJETO</h2>
        <p>
          1. Constitui objeto do presente contrato a compra e venda do veículo abaixo identificado:
          <strong>${escapeHtml([contract.vehicleName, contract.vehicleModel, contract.vehicleYear].filter(Boolean).join(" / ") || "-")}</strong>.
        </p>
        ${contract.vehicleDescription ? `<p class="contract-vehicle-description">${escapeHtml(contract.vehicleDescription)}</p>` : ""}
        <p>1.1. O veículo acima descrito constitui o objeto específico da presente negociação, comprometendo-se o VENDEDOR a realizar sua entrega ao COMPRADOR nas condições estabelecidas neste instrumento.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA SEGUNDA - DO PREÇO E DA FORMA DE PAGAMENTO</h2>
        <p>
          2. O preço ajustado entre as partes para a presente compra e venda é de
          <strong>${formatCurrency(contract.amountValue)}</strong>
          <strong>(${escapeHtml(contract.amountText || "")})</strong>.
        </p>
        <p>
          2.1. O pagamento será realizado de forma <strong>${escapeHtml(contract.paymentMethod || "-")}</strong>,
          conforme condições ajustadas entre as partes, em <strong>${escapeHtml(contract.paymentNotes || "-")}</strong>.
        </p>
        <p>2.2. As partes declaram estar plenamente cientes e de acordo com a forma de pagamento estabelecida, comprometendo-se ao fiel cumprimento das obrigações financeiras assumidas.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA TERCEIRA - DA ENTREGA DO VEÍCULO</h2>
        <p>
          3. O VENDEDOR compromete-se a disponibilizar e entregar o veículo objeto deste contrato ao COMPRADOR até o dia
          <strong>${escapeHtml(formatDateLong(contract.deliveryDate) || "-")}</strong>
          e no endereço: <strong>${escapeHtml(contract.deliveryAddress || "-")}</strong>.
        </p>
        <p>3.1. No ato da entrega, deverão ser disponibilizados ao COMPRADOR o veículo, suas respectivas chaves, chave reserva, manual e demais documentos que tenham sido expressamente incluídos na presente negociação.</p>
        <p>3.2. A entrega deverá ocorrer de maneira que permita ao COMPRADOR receber o veículo nas condições declaradas neste instrumento.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA QUARTA - DAS DECLARAÇÕES E RESPONSABILIDADES DO VENDEDOR</h2>
        <p>4.1. O VENDEDOR declara, sob sua responsabilidade, que possui legitimidade para realizar a presente negociação e que o veículo objeto deste contrato será entregue livre e desembaraçado de ônus, restrições, gravames, débitos ou impedimentos legais não previamente informados ao COMPRADOR.</p>
        <p>4.2. Caso seja constatada a existência de débito, restrição ou impedimento anterior à entrega do veículo e que seja de responsabilidade do VENDEDOR, caberá a este providenciar sua regularização, ressalvadas as situações expressamente informadas e aceitas pelo COMPRADOR por escrito.</p>
        <p>4.3. O VENDEDOR responsabiliza-se pela veracidade das informações e declarações prestadas neste instrumento relativas ao veículo e à presente negociação.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA QUINTA - DAS DECLARAÇÕES E RESPONSABILIDADES DO COMPRADOR</h2>
        <p>5. O COMPRADOR declara ter conhecimento das características e do estado de conservação do veículo objeto da presente compra e venda, aceitando-o nas condições expressamente informadas neste contrato, sem prejuízo das responsabilidades legais aplicáveis.</p>
        <p>5.2. O COMPRADOR compromete-se a cumprir integralmente as obrigações de pagamento assumidas neste instrumento, nos valores, prazos e condições estabelecidos entre as partes.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA SEXTA - DA DOCUMENTAÇÃO E TRANSFERÊNCIA</h2>
        <p>6.1. As partes comprometem-se a fornecer e assinar os documentos necessários à regularização e transferência do veículo perante os órgãos competentes, observadas as exigências previstas na legislação aplicável.</p>
        <p>6.2. Eventuais multas, tributos, taxas, encargos ou débitos incidentes sobre o veículo deverão ser atribuídos à parte responsável de acordo com a data do fato gerador e com as disposições legais aplicáveis, salvo ajuste escrito em sentido diverso.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA SÉTIMA - DO INADIMPLEMENTO</h2>
        <p>7.1. O descumprimento de qualquer obrigação prevista neste contrato sujeitará a parte inadimplente às consequências previstas neste instrumento e na legislação aplicável.</p>
        <p>7.2. Eventual tolerância de uma das partes quanto ao descumprimento de qualquer obrigação pela outra não será considerada renúncia de direito, alteração contratual ou novação, permanecendo válidas e exigíveis as demais disposições deste instrumento.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA OITAVA - DA IRREVOGABILIDADE E DO COMPROMISSO ENTRE AS PARTES</h2>
        <p>8.1. O presente instrumento representa o acordo firmado entre as partes acerca da compra e venda aqui descrita, obrigando-as ao cumprimento das condições assumidas, ressalvadas as hipóteses de rescisão ou revisão admitidas pela legislação aplicável.</p>
        <p>8.2. Qualquer alteração das condições deste contrato deverá ser formalizada por escrito e aceita pelas partes.</p>
      </section>

      <section class="contract-section">
        <h2>CLÁUSULA NONA - DO FORO</h2>
        <p>9.1. Observadas as regras legais aplicáveis à competência territorial, fica eleito o Foro da Comarca de São Paulo/SP para dirimir eventuais controvérsias decorrentes deste contrato, ressalvadas as hipóteses em que a legislação determine foro diverso.</p>
      </section>

      <section class="contract-section contract-section--signatures">
        <p>E, por estarem justas e contratadas, as partes firmam o presente instrumento em 02 (DUAS) vias de igual teor e forma, juntamente com as testemunhas abaixo, para que produza seus jurídicos e legais efeitos.</p>
        <p class="contract-place">SÃO PAULO - SP, <strong>${escapeHtml(formatDateLong(contract.createdAt || new Date()))}</strong>.</p>

        <div class="contract-signature-grid">
          <div class="contract-signature">
            <div class="contract-signature__line ${sellerSignatureStyleClass}">
              ${sellerSignatureText}
            </div>
            <strong>${escapeHtml(contract.sellerName)}</strong>
            <span>VENDEDOR</span>
            <small class="contract-signature__hash">HASH DE SEGURANÇA: ${sellerSignatureHash}</small>
          </div>

          <div class="contract-signature">
            <div class="contract-signature__line ${clientSignatureStyleClass}">
              ${clientSignatureText}
            </div>
            <strong>${escapeHtml(contract.clientName || "CLIENTE")}</strong>
            <span>COMPRADOR</span>
            <small class="contract-signature__hash">HASH DE SEGURANÇA: ${clientSignatureHash}</small>
          </div>
        </div>
      </section>
    </article>
  `;
};
