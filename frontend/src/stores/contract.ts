import { defineStore } from 'pinia';
import { ref } from 'vue';
import { contractApi, type ContractPayload } from '@/api/contract';
import type { Contract } from '@/types';

export const useContractStore = defineStore('contract', () => {
  const contracts = ref<Contract[]>([]);
  const myContracts = ref<Contract[]>([]);
  const currentContract = ref<Contract | null>(null);

  async function fetchContracts() {
    contracts.value = await contractApi.list();
  }

  async function fetchMine() {
    myContracts.value = await contractApi.mine();
  }

  async function fetchDetail(id: string) {
    currentContract.value = await contractApi.detail(id);
    return currentContract.value;
  }

  async function createContract(payload: ContractPayload) {
    const contract = await contractApi.create(payload);
    myContracts.value.unshift(contract);
    return contract;
  }

  /** 详情操作后同步工作台列表，保证进度为最新 */
  function syncToMyContracts(contract: Contract) {
    const index = myContracts.value.findIndex(item => item.id === contract.id);
    if (index >= 0) {
      myContracts.value[index] = contract;
    }
  }

  async function signContract(id: string) {
    currentContract.value = await contractApi.sign(id);
    syncToMyContracts(currentContract.value);
    return currentContract.value;
  }

  /** 自由职业者提交本阶段交付说明（退回后可重新提交） */
  async function submitStage(id: string, stageIndex: number, submissionNote: string) {
    currentContract.value = await contractApi.submitStage(id, stageIndex, submissionNote);
    syncToMyContracts(currentContract.value);
    return currentContract.value;
  }

  /** 需求方逐段验收：通过 / 退回并写明原因 */
  async function reviewStage(id: string, stageIndex: number, approved: boolean, rejectReason?: string) {
    currentContract.value = await contractApi.reviewStage(id, stageIndex, approved, rejectReason);
    syncToMyContracts(currentContract.value);
    return currentContract.value;
  }

  return {
    contracts,
    myContracts,
    currentContract,
    fetchContracts,
    fetchMine,
    fetchDetail,
    createContract,
    signContract,
    submitStage,
    reviewStage
  };
});
