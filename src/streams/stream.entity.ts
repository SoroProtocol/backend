export enum StreamStatus {
  ACTIVE    = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export class StreamEntity {
  id:              string;
  contractStreamId: string;
  sender:          string;
  recipient:       string;
  token:           string;
  ratePerSecond:   bigint;
  startTime:       number;
  stopTime:        number;
  withdrawn:       bigint;
  status:          StreamStatus;
  txHash:          string;
  createdAt:       Date;
  updatedAt:       Date;
}
