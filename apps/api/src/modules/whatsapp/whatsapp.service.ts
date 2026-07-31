import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WhatsAppCredentialsInput, WhatsAppStatusDto } from '@wa/shared';
export type { WhatsAppStatusDto };
import type {
  DownloadMediaResult,
  MediaInfo,
  MessageResponse,
  PhoneNumberInfo,
  SendMediaMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
} from './meta-api/meta-api.types';
import { MetaApiClient } from './meta-api/meta-api.client';
import { MetaApiError } from './meta-api/meta-api.errors';
import { ERROR_CODES } from '../../common/errors';
import { CryptoService } from '../../common/crypto/crypto.module';
import { WhatsAppAccountsDao } from './whatsapp-accounts.dao';
import { WhatsAppPhoneNumbersDao } from './whatsapp-phone-numbers.dao';
import { WhatsAppCredentialsService } from './whatsapp-credentials.service';
import { toWhatsAppAccountDto, toWhatsAppPhoneNumberDto } from './whatsapp.mapper';
import type { NewWhatsAppPhoneNumber, WhatsAppAccountRow } from '../../db/schema';

function tokenLastFour(token: string): string {
  const trimmed = token.trim();
  return trimmed.length === 0 ? '' : trimmed.slice(-4);
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly accountsDao: WhatsAppAccountsDao,
    private readonly phoneNumbersDao: WhatsAppPhoneNumbersDao,
    private readonly credentialsService: WhatsAppCredentialsService,
    private readonly cryptoService: CryptoService,
  ) {}

  async getStatus(): Promise<WhatsAppStatusDto> {
    const account = await this.accountsDao.getFirst();
    const phoneNumbers = account ? await this.phoneNumbersDao.listByAccount(account.id) : [];

    return {
      account: account ? toWhatsAppAccountDto(account) : null,
      phoneNumbers: phoneNumbers.map(toWhatsAppPhoneNumberDto),
      settings: await this.credentialsService.getSettingsSummary(),
    };
  }

  async saveCredentials(input: WhatsAppCredentialsInput): Promise<WhatsAppStatusDto> {
    let account = await this.accountsDao.getFirst();

    if (!account) {
      if (!input.wabaId || !input.accessToken) {
        throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
      }
      const encrypted = this.cryptoService.encrypt(input.accessToken);
      account = await this.accountsDao.insert({
        name: input.name ?? null,
        wabaId: input.wabaId,
        appId: input.appId ?? null,
        encryptedAccessToken: encrypted,
        accessTokenLastFour: tokenLastFour(input.accessToken),
        tokenUpdatedAt: new Date(),
        status: 'DISCONNECTED',
      });
      if (!account) {
        throw new BadRequestException(ERROR_CODES.INTERNAL);
      }
    } else {
      const patch: Partial<Parameters<typeof this.accountsDao.update>[1]> = {};
      if (input.name !== undefined) {
        patch.name = input.name;
      }
      if (input.appId !== undefined) {
        patch.appId = input.appId;
      }
      if (input.wabaId !== undefined) {
        patch.wabaId = input.wabaId;
      }
      if (input.accessToken !== undefined) {
        patch.encryptedAccessToken = this.cryptoService.encrypt(input.accessToken);
        patch.accessTokenLastFour = tokenLastFour(input.accessToken);
        patch.tokenUpdatedAt = new Date();
      }
      if (Object.keys(patch).length > 0) {
        const updated = await this.accountsDao.update(account.id, patch);
        if (updated) {
          account = updated;
        }
      }
    }

    if (input.appSecret !== undefined) {
      await this.credentialsService.setAppSecret(input.appSecret);
    }
    if (input.verifyToken !== undefined) {
      await this.credentialsService.setVerifyToken(input.verifyToken);
    }
    if (input.graphApiVersion !== undefined) {
      await this.credentialsService.setGraphApiVersion(input.graphApiVersion);
    }

    return this.getStatus();
  }

  async replaceToken(accessToken: string): Promise<WhatsAppStatusDto> {
    const account = await this.requireAccount();
    const encrypted = this.cryptoService.encrypt(accessToken);
    await this.accountsDao.setAccessToken(account.id, encrypted, tokenLastFour(accessToken));
    return this.getStatus();
  }

  async disconnect(): Promise<WhatsAppStatusDto> {
    const account = await this.requireAccount();
    await this.accountsDao.setStatus(account.id, 'DISCONNECTED');
    return this.getStatus();
  }

  async testConnection(): Promise<WhatsAppStatusDto> {
    const account = await this.requireAccount();
    const client = await this.buildClient();

    try {
      const result = await client.testConnection(account.wabaId ?? undefined);
      const patch: Partial<Parameters<typeof this.accountsDao.update>[1]> = {
        status: 'CONNECTED',
        lastConnectionTestAt: new Date(),
        lastConnectionError: null,
      };
      if (!account.wabaId && result.accountId) {
        patch.wabaId = result.accountId;
      }
      if (result.name) {
        patch.name = result.name;
      }
      await this.accountsDao.update(account.id, patch);
    } catch (error) {
      await this.accountsDao.recordConnectionTest(
        account.id,
        false,
        error instanceof Error ? this.describeError(error) : String(error),
      );
      throw error;
    }

    return this.getStatus();
  }

  async syncAccountInfo(): Promise<WhatsAppStatusDto> {
    const account = await this.requireAccount();
    if (!account.wabaId) {
      throw new BadRequestException(ERROR_CODES.WHATSAPP_NOT_CONFIGURED);
    }
    const client = await this.buildClient();
    const info = await client.getBusinessAccount(account.wabaId);

    await this.accountsDao.update(account.id, {
      metaBusinessAccountId: info.id ?? account.metaBusinessAccountId,
      name: info.name ?? info.display_name ?? info.verified_name ?? account.name,
      status: 'CONNECTED',
    });

    return this.getStatus();
  }

  async syncPhoneNumbers(): Promise<WhatsAppStatusDto> {
    const account = await this.requireAccount();
    if (!account.wabaId) {
      throw new BadRequestException(ERROR_CODES.WHATSAPP_NOT_CONFIGURED);
    }
    const client = await this.buildClient();
    const numbers = await client.getPhoneNumbers(account.wabaId);

    const now = new Date();
    const rows: NewWhatsAppPhoneNumber[] = numbers.map((number: PhoneNumberInfo, index: number) => ({
      whatsappAccountId: account.id,
      phoneNumberId: number.id,
      displayPhoneNumber: number.display_phone_number ?? null,
      verifiedName: number.verified_name ?? null,
      qualityRating: number.quality_rating ?? null,
      messagingLimitTier: number.messaging_limit_tier ?? null,
      status: number.status ?? null,
      isDefault: index === 0,
      lastSyncedAt: now,
    }));

    await this.phoneNumbersDao.replaceAllForAccount(account.id, rows);
    await this.accountsDao.update(account.id, { status: 'CONNECTED', lastConnectionTestAt: now });

    return this.getStatus();
  }

  async sendTextMessage(input: Omit<SendTextMessageInput, 'phoneNumberId'>): Promise<MessageResponse> {
    const client = await this.buildClient();
    return client.sendTextMessage({ ...input, phoneNumberId: await this.requirePhoneNumberId() });
  }

  async sendTemplateMessage(input: Omit<SendTemplateMessageInput, 'phoneNumberId'>): Promise<MessageResponse> {
    const client = await this.buildClient();
    return client.sendTemplateMessage({ ...input, phoneNumberId: await this.requirePhoneNumberId() });
  }

  async sendImageMessage(input: Omit<SendMediaMessageInput, 'phoneNumberId'>): Promise<MessageResponse> {
    const client = await this.buildClient();
    return client.sendImageMessage({ ...input, phoneNumberId: await this.requirePhoneNumberId() });
  }

  async sendDocumentMessage(input: Omit<SendMediaMessageInput, 'phoneNumberId'>): Promise<MessageResponse> {
    const client = await this.buildClient();
    return client.sendDocumentMessage({ ...input, phoneNumberId: await this.requirePhoneNumberId() });
  }

  async markMessageAsRead(messageId: string): Promise<MessageResponse> {
    const client = await this.buildClient();
    return client.markMessageAsRead(messageId, await this.requirePhoneNumberId());
  }

  async getMediaInfo(mediaId: string): Promise<MediaInfo> {
    const client = await this.buildClient();
    return client.getMediaInfo(mediaId);
  }

  async downloadMedia(url: string): Promise<DownloadMediaResult> {
    const client = await this.buildClient();
    return client.downloadMedia(url);
  }

  async buildClient(): Promise<MetaApiClient> {
    const accessToken = await this.resolveAccessToken();
    if (!accessToken) {
      throw new BadRequestException(ERROR_CODES.WHATSAPP_NOT_CONFIGURED);
    }
    return new MetaApiClient({
      accessToken,
      graphApiVersion: await this.credentialsService.getGraphApiVersion(),
    });
  }

  private async resolveAccessToken(): Promise<string | undefined> {
    const account = await this.accountsDao.getFirst();
    if (account?.encryptedAccessToken) {
      return this.cryptoService.decrypt(account.encryptedAccessToken);
    }
    return undefined;
  }

  private async requirePhoneNumberId(): Promise<string> {
    const account = await this.requireAccount();
    const phoneNumber = await this.phoneNumbersDao.findDefault(account.id);
    return phoneNumber?.phoneNumberId ?? account.wabaId ?? '';
  }

  async requireAccount(): Promise<WhatsAppAccountRow> {
    const account = await this.accountsDao.getFirst();
    if (!account) {
      throw new NotFoundException(ERROR_CODES.WHATSAPP_NOT_CONFIGURED);
    }
    return account;
  }

  private describeError(error: unknown): string {
    if (error instanceof MetaApiError) {
      const { normalized } = error;
      return [normalized.title, normalized.message].filter(Boolean).join(': ');
    }
    return error instanceof Error ? error.message : String(error);
  }
}
