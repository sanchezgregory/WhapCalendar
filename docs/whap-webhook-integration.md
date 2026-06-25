# Whap Webhook Integration

Whap receives WhapCalendar booking webhooks at these endpoints:

- Development: `https://dev.whap.uy/api/webhooks/whapcalendar`
- Production: `https://whap.uy/api/webhooks/whapcalendar`

Use the existing WhapCalendar webhook system. Configure the same shared secret in WhapCalendar's webhook `secret` field and in Whap as `WHAPCALENDAR_WEBHOOK_SECRET`.

## Triggers

Configure these triggers:

- `BOOKING_CREATED`
- `BOOKING_RESCHEDULED`
- `BOOKING_CANCELLED`

## User Webhook

Create a user-level webhook with the API v2 endpoint:

```http
POST /v2/webhooks
Content-Type: application/json
```

Development body:

```json
{
  "subscriberUrl": "https://dev.whap.uy/api/webhooks/whapcalendar",
  "active": true,
  "triggers": ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
  "secret": "<WHAPCALENDAR_WEBHOOK_SECRET>"
}
```

Production body:

```json
{
  "subscriberUrl": "https://whap.uy/api/webhooks/whapcalendar",
  "active": true,
  "triggers": ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
  "secret": "<WHAPCALENDAR_WEBHOOK_SECRET>"
}
```

## Event Type Webhook

To scope delivery to one event type, use:

```http
POST /v2/event-types/:eventTypeId/webhooks
Content-Type: application/json
```

Use the same body shape as the user webhook.

## Signature Verification

WhapCalendar signs the exact request body with HMAC SHA-256 and sends the hex digest in:

```http
X-Cal-Signature-256: <signature>
```

Whap should validate this header using `WHAPCALENDAR_WEBHOOK_SECRET` before processing the payload.

## Passing Whap Context

Whap can open the WhapCalendar booking page or iframe with a signed opaque context token:

```text
?whap_context=<signed-token>
```

WhapCalendar stores this value as booking metadata:

```json
{
  "whap_context": "<signed-token>"
}
```

The existing metadata query parameter format also works:

```text
?metadata[whap_context]=<signed-token>
```

Booking webhooks include the context in `payload.metadata.whap_context`, for example:

```json
{
  "triggerEvent": "BOOKING_CREATED",
  "createdAt": "2026-06-16T00:00:00.000Z",
  "payload": {
    "uid": "booking_uid",
    "bookingId": 123,
    "metadata": {
      "whap_context": "<signed-token>"
    }
  }
}
```

Whap should decode the token after validating the WhapCalendar webhook signature and use it to associate the booking with Whap entities such as `mediator_id`, `case_id`, `request_id`, or `session_id`.
