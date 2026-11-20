const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/security-headers.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exported });

test('Private signed voice playback is allowed without allowing arbitrary media hosts', () => {
  const csp = exported.contentSecurityPolicy(false);
  const media = csp.split('; ').find(d => d.startsWith('media-src ')).split(' ').slice(1);
  assert(media.includes('https://jcqmgwvshbctlokhmras.supabase.co'));
  assert(media.includes('blob:')); // Local microphone recording previews.
  assert(!media.includes('*') && !media.includes('https:'));
  assert(csp.includes("object-src 'none'"));
  assert(csp.includes("frame-ancestors 'self'"));
  assert(!csp.includes("'unsafe-eval'"));
});

test('Device permissions needed by SOS and voice remain scoped to this site', () => {
  const headers = exported.securityHeaders(false);
  assert(headers['Permissions-Policy'].includes('geolocation=(self)'));
  assert(headers['Permissions-Policy'].includes('microphone=(self)'));
  assert(headers['Strict-Transport-Security'].includes('max-age='));
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});
