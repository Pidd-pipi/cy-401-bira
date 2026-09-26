import {
  BidStatus,
  ContractStatus,
  PaymentMode,
  RequirementStatus,
  StageStatus,
  UserRole
} from './enums';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  avatar?: string;
  skillTags?: string[];
  rating: number;
  bio?: string;
  contact?: string;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  deadline: string;
  skillTags?: string[];
  status: RequirementStatus;
  publisherId: string;
  publisher?: User;
  winnerId?: string | null;
  winner?: User;
  bids?: Bid[];
  createdAt?: string;
}

export interface Bid {
  id: string;
  amount: number;
  durationDays: number;
  proposal: string;
  attachments?: string[];
  status: BidStatus;
  requirementId: string;
  requirement?: Requirement;
  bidderId: string;
  bidder?: User;
  createdAt?: string;
}

export type StageHistoryAction = 'submit' | 'approve' | 'reject';

export interface StageHistoryEntry {
  action: StageHistoryAction;
  note?: string;
  reason?: string;
  operatorId: string;
  operatorName: string;
  at: string;
}

export interface ContractStage {
  title: string;
  amount: number;
  dueDate: string;
  completed: boolean;
  status: StageStatus;
  note?: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectReason?: string;
  history?: StageHistoryEntry[];
}

export interface Contract {
  id: string;
  contractNo: string;
  totalAmount: number;
  paymentMode: PaymentMode;
  stages: ContractStage[];
  status: ContractStatus;
  requirementId: string;
  requirement?: Requirement;
  buyerId: string;
  buyer?: User;
  freelancerId: string;
  freelancer?: User;
  createdAt?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  username: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: User;
}
