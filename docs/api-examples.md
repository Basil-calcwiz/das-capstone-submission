# API Examples (curl)

Examples for Build 4 REST API.

Assuming the server is running on `http://localhost:3000`.

### 1. Health check
```bash
curl -X GET http://localhost:3000/health
```

### 2. Create an event (Draft)
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lagos Tech Fest",
    "city": "Lagos",
    "venue": "Eko Hotel",
    "startsAt": "2026-11-20T09:00:00.000Z"
  }'
```

### 3. Add a ticket tier to the event
Replace `EVENT_ID` with the `id` returned from the event creation step.
```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VIP",
    "priceCents": 5000,
    "capacity": 100
  }'
```

### 4. Publish the event
```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish
```

### 5. Search published events
```bash
curl -X GET "http://localhost:3000/api/events?city=Lagos&maxPrice=10000"
```

### 6. Book tickets
Replace `TIER_ID` with the tier's `id`.
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: user_ada" \
  -d '{
    "tierId": "TIER_ID",
    "quantity": 2
  }'
```

### 7. Pay for the booking
Replace `REFERENCE` with the booking's `reference` code.
```bash
curl -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: user_ada" \
  -d '{
    "card": {
      "number": "4111"
    }
  }'
```

### 8. Cancel an unpaid booking
```bash
curl -X POST http://localhost:3000/api/bookings/REFERENCE/cancel \
  -H "Content-Type: application/json" \
  -H "x-user-id: user_ada"
```
