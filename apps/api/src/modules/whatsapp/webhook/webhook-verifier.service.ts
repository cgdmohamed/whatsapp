import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ERROR_CODES } from '../../../common/errors';
import { WhatsAppCredentialsService } from '../whatsapp-credentials.service';
import { timingSafeVerifyToken, verifyWebhookSignature } from './webhook-signature';

const MAX_CHALLENGE_LENGTH = 1024;

@Injectable()
export class WebhookVerifierService {
  constructor(private readonly credentialsService: WhatsAppCredentialsService) {}

  /**
   * Validates a Meta webhook verification GET request and returns the challenge
   * string to echo back when valid. Throws an HTTP error otherwise.
   */
  async verifyChallenge(mode: unknown, verifyToken: unknown, challenge: unknown): Promise<string> {
    if (mode !== 'subscribe') {
      throw new ForbiddenException('Invalid webhook verification mode');
    }

    const expected = await this.credentialsService.getVerifyToken();
    if (!expected) {
      throw new ServiceUnavailableException(ERROR_CODES.WEBHOOK_NOT_CONFIGURED);
    }
    if (typeof verifyToken !== 'string' || !timingSafeVerifyToken(verifyToken, expected)) {
      throw new ForbiddenException('Invalid webhook verify token');
    }
    if (typeof challenge !== 'string' || challenge.length === 0 || challenge.length > MAX_CHALLENGE_LENGTH) {
      throw new BadRequestException('Invalid webhook challenge');
    }

    return challenge;
  }

  /**
   * Verifies the X-Hub-Signature-256 header over the raw request body using
   * the configured Meta app secret. Returns false when the secret is not
   * configured, the header is missing/malformed, or the signature mismatches.
   */
  async isValidSignature(rawBody: Buffer | string, signatureHeader: unknown): Promise<boolean> {
    const appSecret = await this.credentialsService.getAppSecret();
    if (!appSecret) {
      return false;
    }
    return verifyWebhookSignature(appSecret, rawBody, signatureHeader);
  }
}
