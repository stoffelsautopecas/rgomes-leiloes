import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/rastreio.html', import.meta.url), 'utf8');
const timelineContext = vm.createContext({performance: {now: () => 1000}});
vm.runInContext(html.slice(html.indexOf('      const trackingTimeline ='), html.indexOf('      const stampTimelines =')), timelineContext);
const timeline = vm.runInContext('trackingTimeline', timelineContext);
const motion = {animation_progress: .6, animation_server_time: '2026-10-15T12:30:00Z', animation_running_since: '2026-10-15T12:00:00Z', animation_received_at: 1000};
assert.equal(timeline(motion), .725, 'Driver continues past halfway');
assert.equal(timeline({...motion, animation_paused: true}), .6, 'Pause freezes the stored position');
assert.equal(timeline({...motion, animation_progress: .99}), 1, 'Stop at the destination');
assert.equal(timeline({...motion, animation_progress: .73, animation_running_since: null}), .73, 'Paused or stopped tracking retains its position');
const cacheCode = html.slice(html.indexOf('      const mapCacheKey ='), html.indexOf('      const roadRouteCache ='));
const browserStorage = new Map();
const storage = {getItem: key => browserStorage.get(key) || null, setItem: (key, value) => browserStorage.set(key, value)};
const geocoding = html.slice(html.indexOf('      const geocodeCache ='), html.indexOf('      const ensureMap ='));
const feature = (city, street) => ({properties: {countrycode: 'BR', city, name: street, type: 'street'}, geometry: {coordinates: [-46.6, -23.5]}});
const postal = {logradouro: 'Rua Expedicionário Otacílio Souza', localidade: 'Cidade Teste', uf: 'SP', cep: '12345-678'};
const context = vm.createContext({Map, Set, AbortSignal, URLSearchParams, localStorage: storage, lookupCep: async () => postal,
  fetch: async () => ({ok: true, json: async () => ({features: [feature('Cidade Teste', 'Rua Expedicionário Otacilio de Souza')]})})});
vm.runInContext(cacheCode + geocoding, context);
assert.deepEqual(Array.from(await vm.runInContext('geocodeAddress("Rua Teste, 12345-678")', context)), [-23.5, -46.6]);
assert.equal(vm.runInContext('approximateMapAddresses.has("Rua Teste, 12345-678")', context), true);
context.fetch = async () => ({ok: true, json: async () => ({features: [feature('Outra Cidade', postal.logradouro)]})});
assert.equal(await vm.runInContext('geocodeAddress("Outro endereço, 12345-678")', context), null, 'Never accept a namesake street in another city');
context.fetch = async url => ({ok: true, json: async () => url.includes('photon') ? {features: []} : [{lat: '-23.5', lon: '-46.6', address: {country_code: 'br', city: 'Cidade Teste'}}]});
assert.deepEqual(Array.from(await vm.runInContext('geocodeAddress("Rua indisponível no Photon, 12345-678")', context)), [-23.5, -46.6]);

const reloaded = vm.createContext({Map, Set, AbortSignal, URLSearchParams, localStorage: storage,
  lookupCep: async () => {throw Error('Cached address should skip CEP lookup');},
  fetch: async () => {throw Error('Cached address should skip geocoding');}});
vm.runInContext(cacheCode + geocoding, reloaded);
assert.deepEqual(Array.from(await vm.runInContext('geocodeAddress("Rua Teste, 12345-678")', reloaded)), [-23.5, -46.6]);
assert.equal(vm.runInContext('approximateMapAddresses.has("Rua Teste, 12345-678")', reloaded), true);
const roadCode = html.slice(html.indexOf('      const roadRouteCache ='), html.indexOf('      const routeInterpolator ='));
const routeContext = vm.createContext({Map, AbortSignal, localStorage: storage, fetch: async () => ({ok: true, json: async () => ({code: 'Ok', routes: [{geometry: {coordinates: [[0,0], [8,5], [10,10]]}}]})})});
vm.runInContext(cacheCode + roadCode, routeContext);
await vm.runInContext('fetchRoadRoute([0,0], [10,10])', routeContext);
const cachedRoadContext = vm.createContext({Map, AbortSignal, localStorage: storage, fetch: async () => {throw Error('Cached road must skip external routing');}});
vm.runInContext(cacheCode + roadCode, cachedRoadContext);
assert.equal(JSON.stringify(await vm.runInContext('fetchRoadRoute([0,0], [10,10])', cachedRoadContext)), JSON.stringify([[0,0],[5,8],[10,10]]));
const blockedStorage = vm.createContext({Map, localStorage: {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}}});
vm.runInContext(cacheCode, blockedStorage);
vm.runInContext('saveMapData("test", [0,0])', blockedStorage);
assert.deepEqual(Array.from(vm.runInContext('savedMapData("test")', blockedStorage)), [0,0]);

// Road routing must not block the first line or the driver's animation.
let resolveRoad;
const road = new Promise(resolve => { resolveRoad = resolve; });
const layers = [], markers = [];
const marker = coords => {
  const result = {coords, addTo() {markers.push(this); return this;}, bindPopup() {return this;},
    setLatLng(coords) {this.coords = coords;}, getElement() {return null;}};
  return result;
};
const elements = new Map();
const element = id => {if (!elements.has(id)) elements.set(id, {textContent: '', hidden: true}); return elements.get(id);};
const mapping = vm.createContext({
  document: {createElement: () => ({}), getElementById: element, hidden: false},
  window: {matchMedia: () => ({matches: false})},
  L: {divIcon: value => value, marker, polyline: (coordinates, style) => ({coordinates, style}),
    layerGroup: lines => ({addTo() {layers.push(lines); return this;}, remove() {}}), latLngBounds: points => points},
  map: {fitBounds() {}, setView() {}}, ensureMap() {}, mapRequest: 0, mapMarkers: [], mapRoute: null,
  clearMapLayers() {vm.runInContext('mapRequest += 1', mapping);},
  approximateMapAddresses: new Set(), trackingMapMeta: element('meta'), animationNotice: element('notice'),
  yardAddress: () => 'origem', buildUserAddress: () => 'destino', reportedLocation: () => 'origem',
  geocodeAddress: async address => address === 'origem' ? [0, 0] : [10, 10],
  roadRouteCache: new Map(), savedMapData: () => null, validMapPoint: point => Array.isArray(point) && point.length === 2,
  fetchRoadRoute: () => road, trackingTimeline: tracking => tracking.animation_progress,
  routeInterpolator: points => progress => points[0].map((value, i) => value + (points.at(-1)[i] - value) * progress),
  applyTrackingMotion() {}, animationPaused: false, animationFrame: null,
  cancelAnimationFrame() {}, requestAnimationFrame: () => 1
});
vm.runInContext(html.slice(html.indexOf('      const renderMap ='), html.indexOf('      const renderOverview =')), mapping);
mapping.tracking = {id: 'test', driver_id: 'driver', status: 'Em andamento', animation_progress: .1, animation_running_since: '2026-10-14', updated_at: '2026-10-14'};
const rendering = vm.runInContext('renderMap(tracking, {})', mapping);
await new Promise(resolve => setImmediate(resolve));
assert.equal(layers.length, 1, 'Show the fallback line before routing responds');
assert.equal(layers[0][1].style.dashArray, '8 10');
assert.deepEqual(Array.from(markers[1].coords), [1, 1], 'Move the driver before routing responds');
vm.runInContext('applyTrackingMotion({...tracking, animation_progress: .2})', mapping);
assert.deepEqual(Array.from(markers[1].coords), [2, 2], 'Apply motion updates while routing is pending');
resolveRoad([[0, 0], [5, 8], [10, 10]]);
await rendering;
assert.equal(layers.length, 2);
assert.equal(layers[1][1].style.dashArray, undefined);
assert.equal(element('trackingRouteLabel').textContent, 'Trajeto sugerido pelas vias');
mapping.savedMapData = () => [[0,0], [5,8], [10,10]];
const cachedRendering = vm.runInContext('renderMap(tracking, {})', mapping);
await new Promise(resolve => setImmediate(resolve));
assert.equal(layers[2][1].style.dashArray, undefined, 'Cached road geometry is shown immediately');
await cachedRendering;
console.log('PASS cache após recarga e sem armazenamento disponível, percurso de 4 horas,  variação no nome da rua, cidade validada, geocodificação alternativa, linha e movimento antes do trajeto pelas vias');
