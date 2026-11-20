const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Offline navigation can use a fallback cached through a host redirect', async () => {
  const listeners = {};
  const cached = new Response('<a href="tel:997">Offline: call 997</a>', { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(cached, 'redirected', { value: true });
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { registration: { scope: 'https://beacon.example/' }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    URL, Response,
    fetch: async () => { throw new TypeError('Connection lost'); },
    caches: { open: async () => ({ match: async url => url.endsWith('/offline.html') ? cached : undefined }) },
  });
  let pending;
  listeners.fetch({ request: { method: 'GET', url: 'https://beacon.example/sos', mode: 'navigate' }, respondWith: promise => { pending = promise; } });
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get('Content-Type'), 'text/html');
  assert((await response.text()).includes('tel:997'));
});
