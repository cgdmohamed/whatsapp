import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';

import { AppModule } from '../src/app.module';
import { DATABASE, type DrizzleDB } from '../src/common/database/database.module';
import { webhookEvents } from '../src/db/schema';
import { WhatsAppCredentialsService } from '../src/modules/whatsapp/whatsapp-credentials.service';
import { computeWebhookSignature } from '../src/modules/whatsapp/webhook/webhook-signature';
import { WebhookEventsDao } from '../src/modules/whatsapp/webhook/webhook-events.dao';

const TEST_APP_SECRET = 'e2e_app_secret_2026';
const TEST_VERIFY_TOKEN = 'e2e_verify_token_2026';
const ADMIN_EMAIL = 'admin@whatsapp.local';
const ADMIN_PASSWORD = 'ChangeMeNow_2026!';

const VALID_PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'e2e-waba',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { display_phone_number: '15551234567', phone_number_id: 'e2e-phone-1' },
            messages: [
              {
                from: '15559876543',
                id: 'wamid.e2e-1',
                timestamp: '1720000000',
                type: 'text',
                text: { body: 'hello e2e' },
              },
            ],
          },
        },
      ],
    },
  ],
});

async function waitForStatus(
  eventsDao: WebhookEventsDao,
  id: string,
  status: string,
  attempts = 0,
): Promise<{ eventType: string; failureReason: string | null }> {
  if (attempts > 30) {
    throw new Error(`Timed out waiting for event ${id} to reach ${status}`);
  }
  const row = await eventsDao.findById(id);
  if (row && row.processingStatus === status) {
    return { eventType: row.eventType, failureReason: row.failureReason };
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return waitForStatus(eventsDao, id, status, attempts + 1);
}

describe('WhatsApp webhook (e2e)', () => {
  let app: INestApplication;
  let db: DrizzleDB;
  let eventsDao: WebhookEventsDao;
  let credentials: WhatsAppCredentialsService;
  let adminCookie: string[] | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useLogger(false);
    await app.init();

    db = app.get(DATABASE);
    eventsDao = app.get(WebhookEventsDao);
    credentials = app.get(WhatsAppCredentialsService);

    const previousSecret = await credentials.getAppSecret();
    const previousVerifyToken = await credentials.getVerifyToken();
    const previousVersion = await credentials.getGraphApiVersion();

    await credentials.setAppSecret(TEST_APP_SECRET);
    await credentials.setVerifyToken(TEST_VERIFY_TOKEN);

    await db.delete(webhookEvents);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    const setCookie = login.headers['set-cookie'];
    adminCookie = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : undefined;

    return async () => {
      await db.delete(webhookEvents);
      if (previousSecret) {
        await credentials.setAppSecret(previousSecret);
      }
      if (previousVerifyToken) {
        await credentials.setVerifyToken(previousVerifyToken);
      }
      if (previousVersion) {
        await credentials.setGraphApiVersion(previousVersion);
      }
      await app.close();
    };
  }, 60000);

  describe('verification (GET)', () => {
    it('echoes the challenge when the mode and verify token match', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': TEST_VERIFY_TOKEN, 'hub.challenge': 'challenge-e2e' });
      expect(res.status).toBe(200);
      expect(res.text).toBe('challenge-e2e');
    });

    it('rejects a wrong verify token with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'challenge-e2e' });
      expect(res.status).toBe(403);
    });

    it('rejects an invalid mode with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/webhooks/whatsapp')
        .query({ 'hub.mode': 'unsubscribe', 'hub.verify_token': TEST_VERIFY_TOKEN, 'hub.challenge': 'challenge-e2e' });
      expect(res.status).toBe(403);
    });
  });

  describe('signature validation (POST)', () => {
    it('rejects a missing signature with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .send(VALID_PAYLOAD);
      expect(res.status).toBe(401);
    });

    it('rejects an invalid signature with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
        .send(VALID_PAYLOAD);
      expect(res.status).toBe(401);
    });

    it('acknowledges a valid signature quickly', async () => {
      const signature = computeWebhookSignature(TEST_APP_SECRET, Buffer.from(VALID_PAYLOAD, 'utf8'));
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(VALID_PAYLOAD);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('storage, dedup and async processing', () => {
    it('stores exactly one event for duplicate deliveries and processes it', async () => {
      const signature = computeWebhookSignature(TEST_APP_SECRET, Buffer.from(VALID_PAYLOAD, 'utf8'));
      const send = () =>
        request(app.getHttpServer())
          .post('/api/webhooks/whatsapp')
          .set('Content-Type', 'application/json')
          .set('X-Hub-Signature-256', signature)
          .send(VALID_PAYLOAD);

      const first = await send();
      const duplicate = await send();
      expect(first.status).toBe(200);
      expect(duplicate.status).toBe(200);

      const events = await db.select().from(webhookEvents);
      expect(events).toHaveLength(1);
      // The async worker may already have processed the event by the time we
      // read the row; both QUEUED (pending) and PROCESSED (fast worker) are valid.
      expect(['QUEUED', 'PROCESSING', 'PROCESSED']).toContain(events[0]!.processingStatus);
      expect(events[0]!.signatureValid).toBe(true);

      const processed = await waitForStatus(eventsDao, events[0]!.id, 'PROCESSED');
      expect(processed.eventType).toBe('message.text');
    });

    it('marks events without recognizable content as IGNORED', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{ id: 'e2e-waba', changes: [{ field: 'unknown_field', value: { x: 1 } }] }],
      });
      const signature = computeWebhookSignature(TEST_APP_SECRET, Buffer.from(payload, 'utf8'));
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payload);
      expect(res.status).toBe(200);

      const listed = await eventsDao.list({ page: 1, pageSize: 1 });
      expect(listed.items).toHaveLength(1);
      const ignored = await waitForStatus(eventsDao, listed.items[0]!.id, 'IGNORED');
      expect(ignored.failureReason).toContain('unknown_field');
    });
  });

  describe('admin integration logs', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/integration-logs/webhooks');
      expect(res.status).toBe(401);
    });

    it('lists webhook events for an admin', async () => {
      expect(adminCookie).toBeDefined();
      const res = await request(app.getHttpServer())
        .get('/api/integration-logs/webhooks')
        .set('Cookie', adminCookie!);
      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.items[0]).toMatchObject({ provider: 'meta', signatureValid: true });
    });
  });
});
