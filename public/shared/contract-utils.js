export const formatBRL = value => Number(value || 0).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
export function parseBRL(value) {
 if (typeof value === 'number') return value;
 let s = String(value || '').replace('R$', '').trim();
 if (s.includes(',')) s = s.split('.').join('').replace(',', '.');
 else if (s.split('.').slice(1).every(p => p.length === 3)) s = s.split('.').join('');
 return Number(s);
}
export const fullAddress = u => u ? [u.address, u.number, u.complement, u.district, u.city, u.state, u.cep].filter(Boolean).join(", ") : "";
export function buildPaymentSummary({mode, downPayment, downPaymentDate, installmentCount, installmentValue, installmentDay}) {
 if (mode === 'cash') return 'Pagamento à vista.';
 const entry = parseBRL(downPayment), count = Number(installmentCount), each = parseBRL(installmentValue);
 if (!Number.isFinite(entry) || entry <= 0 || !Number.isInteger(count) || count < 1 || count > 600 || !Number.isFinite(each) || each <= 0) throw new Error('Informe entrada, quantidade de parcelas e valor de cada parcela válidos.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(String(downPaymentDate || ''))) throw new Error('Informe a data do pagamento da entrada.');
 const entryDate = String(downPaymentDate).split('-').reverse().join('/');
 if (mode === 'annual') return `Plano Safra - Parcelamento Anual. Entrada de ${formatBRL(entry)}, com pagamento em ${entryDate}, e saldo em ${count} ${count === 1 ? 'parcela anual' : 'parcelas anuais'} de ${formatBRL(each)} cada, sendo uma parcela por ano, durante ${count} ${count === 1 ? 'ano' : 'anos'}.`;
 const day = Number(installmentDay);
 if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Informe o dia de vencimento das parcelas (1 a 31).');
 return `Entrada de ${formatBRL(entry)}, com pagamento em ${entryDate}, e saldo em ${count} parcelas de ${formatBRL(each)} cada, com vencimento no dia ${day} de cada mês.`;
}
const small = ['dezenove','dezoito','dezessete','dezesseis','quinze','catorze','treze','doze','onze','dez','nove','oito','sete','seis','cinco','quatro','três','dois','um','zero'].reverse();
const tens = ['noventa','oitenta','setenta','sessenta','cinquenta','quarenta','trinta','vinte','',''].reverse();
const hundreds = ['novecentos','oitocentos','setecentos','seiscentos','quinhentos','quatrocentos','trezentos','duzentos','cento',''].reverse();
function integerWords(n) {
 if (n < 20) return small[n];
 if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' e '+small[n%10] : '');
 if (n === 100) return 'cem';
 if (n < 1000) return hundreds[Math.floor(n/100)] + (n%100 ? ' e '+integerWords(n%100) : '');
 const scale = n >= 1000000000 ? 1000000000 : n >= 1000000 ? 1000000 : 1000;
 const head = Math.floor(n/scale), rest = n%scale;
 const label = scale === 1000 ? (head===1 ? 'mil' : integerWords(head)+' mil') : integerWords(head)+(scale===1000000 ? (head===1?' milhão':' milhões') : (head===1?' bilhão':' bilhões'));
 return label + (rest ? (rest < 100 || rest%100===0 ? ' e ' : ', ')+integerWords(rest) : '');
}
export function amountWords(value) {
 const cents = Math.round(parseBRL(value)*100);
 if (!Number.isSafeInteger(cents) || cents < 0 || cents >= 100000000000000) return '';
 const reais = Math.floor(cents/100), fraction = cents%100;
 const main = reais ? integerWords(reais)+(reais%1000000===0?' de reais':reais===1?' real':' reais') : '';
 return main + (fraction ? (main?' e ':'')+integerWords(fraction)+(fraction===1?' centavo':' centavos') : main?'':'zero reais');
}
