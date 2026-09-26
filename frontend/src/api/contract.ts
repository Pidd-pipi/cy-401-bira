import { http } from './http';
import type { Contract, ContractStage } from '@/types';
import type { PaymentMode } from '@/types/enums';

export interface ContractPayload {
  requirementId: string;
  freelancerId: string;
  totalAmount: number;
  paymentMode: PaymentMode;
  stages: Omit<ContractStage, 'completed'>[];
}

export const contractApi = {
  list() {
    return http.get<unknown, Contract[]>('/contracts');
  },
  mine() {
    return http.get<unknown, Contract[]>('/contracts/mine');
  },
  detail(id: string) {
    return http.get<unknown, Contract>(`/contracts/${id}`);
  },
  create(payload: ContractPayload) {
    return http.post<unknown, Contract>('/contracts', payload);
  },
  sign(id: string) {
    return http.patch<unknown, Contract>(`/contracts/${id}/sign`);
  },
  submitStage(id: string, stageIndex: number, submissionNote: string) {
    return http.patch<unknown, Contract>(`/contracts/${id}/stages/${stageIndex}/submit`, {
      submissionNote
    });
  },
  reviewStage(id: string, stageIndex: number, approved: boolean, rejectReason?: string) {
    return http.patch<unknown, Contract>(`/contracts/${id}/stages/${stageIndex}/review`, {
      approved,
      rejectReason
    });
  }
};
