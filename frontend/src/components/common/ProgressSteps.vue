<template>
  <el-steps :active="activeIndex" :process-status="processStatus" finish-status="success" align-center>
    <el-step
      v-for="(stage, index) in stages"
      :key="`${stage.title}-${index}`"
      :title="stage.title"
      :description="`${formatCurrency(stage.amount)} · ${stage.dueDate}`"
      :status="stepStatus(index)"
    />
  </el-steps>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContractStage } from '@/types';
import { StageStatus } from '@/types/enums';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{ stages: ContractStage[] }>();

const approvedCount = computed(
  () => props.stages.filter(stage => stage.status === StageStatus.Approved).length
);
const activeIndex = computed(() => approvedCount.value);
const processStatus = computed(() => {
  return props.stages.some(stage => stage.status === StageStatus.Rejected) ? 'error' : 'process';
});

function stepStatus(index: number): 'wait' | 'process' | 'finish' | 'error' | 'success' {
  const stage = props.stages[index];
  switch (stage.status) {
    case StageStatus.Approved:
      return 'success';
    case StageStatus.Rejected:
      return 'error';
    case StageStatus.PendingReview:
      return 'process';
    default:
      // 前一阶段未通过时后面的阶段保持等待
      return index === activeIndex.value ? 'process' : 'wait';
  }
}
</script>
