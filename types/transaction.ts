import { Timestamp } from "firebase/firestore";
import type { TransactionStatus } from "../constants/mindSpace";

export type Transaction = {
  id: string;
  spaceId: string;
  spaceTitle: string;
  spaceAddress?: string;
  spaceImages?: string[];
  ownerId: string;
  ownerName?: string;
  customerId: string;
  customerName?: string;
  chatId: string;
  status: TransactionStatus;
  requestMessageId?: string;
  agreedSchedule?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
  ownerEvaluatedCustomer?: boolean;
  customerEvaluatedOwner?: boolean;
  ownerEvaluation?: { schedule: number; manners: number };
  customerEvaluation?: { schedule: number; storageCondition: number; manners: number };
  disputed?: boolean;
};
