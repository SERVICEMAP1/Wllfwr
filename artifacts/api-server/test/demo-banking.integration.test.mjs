import assert from 'node:assert/strict';
import test from 'node:test';

const apiBase = process.env.DEMO_API_BASE_URL ?? 'http://localhost:80/api';

async function request(path, init) {
  const response = await fetch(`${apiBase}${path}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

test('health endpoint remains public', async () => {
  const { response, body } = await request('/healthz');
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.status, 'ok');
});

test('customer demo endpoints reject requests without a Clerk session', async () => {
  const cases = [
    ['/enrollment/me', { method: 'GET' }],
    ['/enrollment/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }],
    ['/enrollment/me/response', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }],
    ['/admin/enrollments', { method: 'GET' }],
    ['/admin/enrollments/00000000-0000-4000-8000-000000000001/review', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    }],
    ['/demo/overview', { method: 'GET' }],
    ['/demo/transfers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
    ['/demo/bill-payments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
    ['/demo/cards/00000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'frozen' }),
    }],
    ['/demo/deposits/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }],
    ['/demo/deposits', { method: 'GET' }],
    ['/demo/deposits/00000000-0000-4000-8000-000000000001/submit', { method: 'POST' }],
    ['/demo/deposits/00000000-0000-4000-8000-000000000001/images/front', { method: 'GET' }],
    ['/demo/deposits/00000000-0000-4000-8000-000000000001', { method: 'DELETE' }],
    ['/demo/admin/deposits', { method: 'GET' }],
    ['/demo/admin/deposits/00000000-0000-4000-8000-000000000001/review', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'reviewed' }),
    }],
  ];

  for (const [path, init] of cases) {
    const { response, body } = await request(path, init);
    assert.equal(response.status, 401, `${path}: ${JSON.stringify(body)}`);
    assert.equal(body.error, 'Authentication required.');
  }
});

test('customer data cannot be selected by supplying a demo space ID', async () => {
  const { response } = await request('/demo/00000000-0000-4000-8000-000000000001/overview');
  assert.equal(response.status, 404);
});
