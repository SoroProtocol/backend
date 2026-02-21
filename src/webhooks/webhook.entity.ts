export enum WebhookEvent {
  STREAM_CREATED   = 'stream.created',
  STREAM_WITHDRAWN = 'stream.withdrawn',
  STREAM_CANCELLED = 'stream.cancelled',
  VESTING_CLAIMED  = 'vesting.claimed',
}

export class WebhookSubscription {
  id:        string;
  url:       string;
  events:    WebhookEvent[];
  secret:    string;
  address:   string;
  createdAt: Date;
}
