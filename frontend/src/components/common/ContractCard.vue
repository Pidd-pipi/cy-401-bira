<template>
  <el-card class="contract-card" shadow="hover">
    <template #header>
      <div class="contract-head">
        <RouterLink :to="`/contracts/${contract.id}`">{{ contract.contractNo }}</RouterLink>
        <StatusBadge :status="contract.status" />
      </div>
    </template>
    <p>{{ contract.requirement?.title || '关联需求' }}</p>
    <div class="amount">{{ formatCurrency(contract.totalAmount) }}</div>
    <el-progress
      :percentage="progressPercent"
      :stroke-width="8"
      :status="contract.status === ContractStatus.Completed ? 'success' : undefined"
    />
    <div class="progress-text">{{ progressLabel }}</div>
    <div class="party">
      <UserAvatar :user="contract.buyer" :size="30" />
      <span>与</span>
      <UserAvatar :user="contract.freelancer" :size="30" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { Contract } from '@/types';
import { ContractStatus, StageStatus } from '@/types/enums';
import { formatCurrency } from '@/utils/format';
import StatusBadge from './StatusBadge.vue';
import UserAvatar from './UserAvatar.vue';

const props = defineProps<{ contract: Contract }>();

const approvedCount = computed(
  () => props.contract.stages.filter(stage => stage.status === StageStatus.Approved).length
);
const submittedCount = computed(
  () => props.contract.stages.filter(stage => stage.status === StageStatus.Submitted).length
);
const totalCount = computed(() => props.contract.stages.length);
const progressPercent = computed(() =>
  totalCount.value ? Math.round((approvedCount.value / totalCount.value) * 100) : 0
);
const progressLabel = computed(() => {
  if (props.contract.status === ContractStatus.PendingSign) {
    return `共 ${totalCount.value} 个阶段 · 待签署`;
  }
  if (props.contract.status === ContractStatus.Terminated) {
    return `已通过 ${approvedCount.value}/${totalCount.value} · 已终止`;
  }
  if (props.contract.status === ContractStatus.Completed) {
    return `全部 ${totalCount.value} 个阶段已通过`;
  }
  return `已通过 ${approvedCount.value}/${totalCount.value} 阶段` +
    (submittedCount.value ? ` · ${submittedCount.value} 段待验收` : '');
});
</script>

<style scoped>
.contract-head,
.party {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.contract-head a {
  font-weight: 700;
}

.amount {
  margin: 12px 0;
  color: #0f766e;
  font-weight: 800;
}

.progress-text {
  margin: 6px 0 12px;
  color: #6b7280;
  font-size: 12px;
}
</style>
