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
      :status="contract.status === ContractStatus.Terminated ? 'exception' : undefined"
    />
    <div class="progress-label muted">
      阶段验收：{{ approvedCount }} / {{ contract.stages.length }}
    </div>
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
const progressPercent = computed(() =>
  props.contract.stages.length
    ? Math.round((approvedCount.value / props.contract.stages.length) * 100)
    : 0
);
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

.progress-label {
  margin: 6px 0 12px;
  font-size: 12px;
}
</style>
