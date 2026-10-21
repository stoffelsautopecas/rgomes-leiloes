import assert from 'node:assert/strict';
import {amountWords, buildPaymentSummary, parseBRL} from '../public/shared/contract-utils.js';
import {renderAcquisitionContractHtml} from '../src/contracts/template.js';
assert.equal(parseBRL('28.000'),28000);
assert.equal(amountWords('28.000'),'vinte e oito mil reais');
const cash=buildPaymentSummary({mode:'cash'});
const monthly=buildPaymentSummary({mode:'installments',downPayment:'8.000',downPaymentDate:'2026-10-10',installmentCount:10,installmentValue:'2.000',installmentDay:10});
const annual=buildPaymentSummary({mode:'annual',downPayment:'28.000',downPaymentDate:'2026-10-10',installmentCount:10,installmentValue:'10.000'});
assert.equal(cash,'Pagamento à vista.');
assert.match(monthly,/10 parcelas de R\$\s?2\.000,00 cada, com vencimento no dia 10 de cada mês/);
assert.match(annual,/10 parcelas anuais de R\$\s?10\.000,00 cada, sendo uma parcela por ano, durante 10 anos/);
for(const paymentNotes of [cash,monthly,annual]){
 const html=renderAcquisitionContractHtml({sellerName:'RGOMES LEILÕES',clientName:'Cliente Teste',clientCpf:'000.000.000-00',clientAddress:'Rua Teste, 1',vehicleName:'Trator',vehicleModel:'Modelo',vehicleYear:'2026',vehicleDescription:'Cabine e implemento incluídos',amountValue:28000,amountText:amountWords(28000),paymentMethod:'Conforme condições',paymentNotes,deliveryDate:'2027-01-01',deliveryAddress:'Rua Entrega, 2'});
 assert.match(html,/41\.624\.184\/0001-48/); assert.match(html,/logorgomes\.jpeg/); assert.match(html,/RICARDO FERREIRA GOMES LEILOEIRO OFICIAL - ME/); assert.match(html,/Cabine e implemento incluídos/); assert.doesNotMatch(html,/Descrição opcional/i); assert.match(html,new RegExp(paymentNotes.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
}
console.log('PASS contratos à vista, mensal, anual, BRL, valor por extenso, identidade e descrição');
