export class VestingScheduleEntity {
  id:          string;
  beneficiary: string;
  token:       string;
  totalAmount: bigint;
  startTime:   number;
  cliffTime:   number;
  endTime:     number;
  claimed:     bigint;
  revoked:     boolean;
  createdAt:   Date;
  updatedAt:   Date;
}
