import { http } from './http';
import type { Contract, ContractStage } from '@/types';
import type { PaymentMode } from '@/types/enums';

export interface ContractStageInput {
  title: string;
  amount: number;
  dueDate: string;
}

export interface ContractPayload {
  requirementId: string;
  freelancerId: string;
  totalAmount: number;
  paymentMode: PaymentMode;
  stages: ContractStageInput[];
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
  submitStage(id: string, stageIndex: number, note: string) {
    return http.patch<unknown, Contract>(`/contracts/${id}/stages/${stageIndex}/submit`, { note });
  },
  approveStage(id: string, stageIndex: number) {
    return http.patch<unknown, Contract>(`/contracts/${id}/stages/${stageIndex}/approve`);
  },
  rejectStage(id: string, stageIndex: number, reason: string) {
    return http.patch<unknown, Contract>(`/contracts/${id}/stages/${stageIndex}/reject`, { reason });
  }
};
