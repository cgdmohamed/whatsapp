import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { parseApiEnv } from '@wa/config';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HealthModule } from './modules/health/health.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { IntegrationLogsModule } from './modules/integration-logs/integration-logs.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ImportsModule } from './modules/imports/imports.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { OperationsModule } from './modules/operations/operations.module';
import { HelpModule } from './modules/help/help.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QueueModule } from './common/queue/queue.module';
import { RequestContextModule } from './common/context/request-context.module';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { CommonAuthModule } from './common/auth/auth.module';
import { AuditModule } from './common/audit/audit.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config) => parseApiEnv(config),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL'),
          genReqId: (req, res) => {
            const existing = req.headers['x-request-id'];
            if (typeof existing === 'string' && existing.length > 0) {
              res.setHeader('X-Request-Id', existing);
              return existing;
            }
            const id = randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: {
            paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            censor: '[REDACTED]',
          },
          transport: config.get<boolean>('LOG_PRETTY')
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
          serializers: {
            req: (req) => ({ id: req.id, method: req.method, url: req.url }),
            res: (res) => ({ statusCode: res.statusCode }),
          },
        },
      }),
    }),
    RequestContextModule,
    DatabaseModule,
    RedisModule,
    CryptoModule,
    CommonAuthModule,
    AuditModule,
    QueueModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    HealthModule,
    WhatsAppModule,
    IntegrationLogsModule,
    ContactsModule,
    ImportsModule,
    CampaignsModule,
    InboxModule,
    ReportsModule,
    AuditLogsModule,
    OperationsModule,
    HelpModule,
    MailModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
