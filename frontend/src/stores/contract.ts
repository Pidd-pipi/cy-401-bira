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

  async function signContract(id: string) {
    const contract = await contractApi.sign(id);
    currentContract.value = contract;
    upsertMine(contract);
    return contract;
  }

  async function submitStage(id: string, stageIndex: number, note: string) {
    const contract = await contractApi.submitStage(id, stageIndex, note);
    currentContract.value = contract;
    upsertMine(contract);
    return contract;
  }

  async function approveStage(id: string, stageIndex: number) {
    const contract = await contractApi.approveStage(id, stageIndex);
    currentContract.value = contract;
    upsertMine(contract);
    return contract;
  }

  async function rejectStage(id: string, stageIndex: number, reason: string) {
    const contract = await contractApi.rejectStage(id, stageIndex, reason);
    currentContract.value = contract;
    upsertMine(contract);
    return contract;
  }

  function upsertMine(contract: Contract) {
    const index = myContracts.value.findIndex(item => item.id === contract.id);
    if (index === -1) {
      myContracts.value.unshift(contract);
    } else {
      myContracts.value[index] = contract;
    }
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
    approveStage,
    rejectStage
  };
});
