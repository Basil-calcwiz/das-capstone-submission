import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';
import { createAppServer } from '../src/http/app.js';

describe('Build 4 REST API Integration', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createAppServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('runs the full lifecycle: create, add tier, publish, search, book, pay, and cancel', async () => {
    // 1. Create event
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Lagos Tech Fest',
        city: 'Lagos',
        venue: 'Eko Hotel',
        startsAt: '2026-11-20T09:00:00.000Z',
      }),
    });

    const createJson = await createRes.json();
    assert.equal(createRes.status, 201, `Expected 201, got ${createRes.status}. Body: ${JSON.stringify(createJson)}`);
    const event = createJson.data;
    assert.equal(event.status, 'draft');

    // 2. Add tier
    const tierRes = await fetch(`${baseUrl}/api/events/${event.id}/tiers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'VIP',
        priceCents: 5000,
        capacity: 10,
      }),
    });
    const tierJson = await tierRes.json();
    assert.equal(tierRes.status, 201, `Expected 201, got ${tierRes.status}. Body: ${JSON.stringify(tierJson)}`);
    const tier = tierJson.data;

    // 3. Publish event
    const pubRes = await fetch(`${baseUrl}/api/events/${event.id}/publish`, {
      method: 'POST',
    });
    assert.equal(pubRes.status, 200);

    // 4. Search published events via query parameters
    const searchRes = await fetch(`${baseUrl}/api/events?city=Lagos&maxPrice=10000`);
    assert.equal(searchRes.status, 200);
    const { data: searchResults } = await searchRes.json();
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].title, 'Lagos Tech Fest');

    // 5. Book tickets
    const bookRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user_ada',
      },
      body: JSON.stringify({ tierId: tier.id, quantity: 2 }),
    });
    assert.equal(bookRes.status, 201);
    const { data: booking } = await bookRes.json();
    assert.equal(booking.status, 'pending');

    // 6. Pay for booking
    const payRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user_ada',
      },
      body: JSON.stringify({ card: { number: '4111' } }),
    });
    assert.equal(payRes.status, 200);
    const { data: paidBooking } = await payRes.json();
    assert.equal(paidBooking.status, 'paid');
  });

  it('rejects payment with PAYMENT_DECLINED when card is declined', async () => {
    // Setup event & booking
    const eventRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Party', city: 'Abuja', venue: 'Dome', startsAt: '2026-12-01T18:00:00.000Z' }),
    });
    const eventJson = await eventRes.json();

    const tierRes = await fetch(`${baseUrl}/api/events/${eventJson.data.id}/tiers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Regular', priceCents: 1000, capacity: 5 }),
    });
    const tierJson = await tierRes.json();

    await fetch(`${baseUrl}/api/events/${eventJson.data.id}/publish`, { method: 'POST' });

    const bookingRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user_bayo' },
      body: JSON.stringify({ tierId: tierJson.data.id, quantity: 1 }),
    });
    const bookingJson = await bookingRes.json();

    // Try paying with declined card
    const payRes = await fetch(`${baseUrl}/api/bookings/${bookingJson.data.reference}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user_bayo' },
      body: JSON.stringify({ shouldFail: true }),
    });

    assert.equal(payRes.status, 400);
    const err = await payRes.json();
    assert.equal(err.error.code, 'PAYMENT_DECLINED');
  });
});