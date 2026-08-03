export interface GraphApiErrorPayload {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  is_transient?: boolean;
  error_data?: { details?: string; message?: string; reason?: string; blame_field_specs?: unknown[] };
  error_user_title?: string;
  error_user_msg?: string;
}

export interface GraphApiErrorResponse {
  error?: GraphApiErrorPayload;
}

export interface WabaInfo {
  id: string;
  name?: string;
  display_name?: string;
  verified_name?: string;
  currency?: string;
  timezone_id?: string;
  account_review_status?: string;
  messaging_limit_tier?: string;
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  status?: string;
  code_verification_status?: string;
  platform_type?: string;
  throughput?: { level?: string };
  last_onboarded_time?: string;
}

export interface MessageContactsEntry {
  input: string;
  wa_id: string;
}

export interface MessageSentEntry {
  id: string;
}

export interface MessageResponse {
  messaging_product: 'whatsapp';
  contacts: MessageContactsEntry[];
  messages: MessageSentEntry[];
}

export interface MediaInfo {
  id: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  filename?: string;
}

export interface MediaDownloadInfo {
  id: string;
  url: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  filename?: string;
}

export interface UploadMediaInput {
  phoneNumberId: string;
  file: Buffer;
  mimeType: string;
  filename: string;
}

export interface UploadMediaResult {
  id: string;
}

export interface TestConnectionResult {
  wabaId?: string;
  accountId?: string;
  name?: string;
}

export interface DownloadMediaResult {
  data: Buffer;
  mimeType: string | null;
  size: number;
  filename: string | null;
}

export interface SendTextMessageInput {
  to: string;
  body: string;
  previewUrl?: boolean;
  phoneNumberId: string;
}

export interface SendTemplateMessageInput {
  to: string;
  templateName: string;
  languageCode: string;
  components?: Record<string, unknown>[];
  phoneNumberId: string;
}

export interface SendMediaMessageInput {
  to: string;
  link?: string;
  mediaId?: string;
  caption?: string;
  filename?: string;
  phoneNumberId: string;
}

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[] | string[][];
    header_handle?: string[];
  };
  buttons?: Array<{
    type?: string;
    text?: string;
    url?: string;
    phone_number?: string;
    example?: string[];
  }>;
}

export interface MetaMessageTemplate {
  id: string;
  name: string;
  status?: string;
  category?: string;
  language?: string;
  components?: MetaTemplateComponent[];
  quality_score?: string;
  rejected_reason?: string;
  previous_category?: string;
  created_time?: string;
  updated_time?: string;
  message_send_ttl_seconds?: number;
}

export interface CreateTemplateButtonInput {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface CreateTemplateComponentInput {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  example?: { header_text?: string[]; body_text?: string[] | string[][] };
  buttons?: CreateTemplateButtonInput[];
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: string;
  components: CreateTemplateComponentInput[];
}

export interface CreateTemplateResult {
  id: string;
  status?: string;
  category?: string;
}
