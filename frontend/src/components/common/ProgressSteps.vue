<template>
  <el-steps :active="activeIndex" :process-status="processStatus" finish-status="success" align-center>
    <el-step
      v-for="stage in stages"
      :key="stage.title"
      :title="stage.title"
      :description="`${formatCurrency(stage.amount)} · ${stage.dueDate}`"
      :status="stepStatus(stage.status)"
    ></el-step>
  </el-steps>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContractStage } from '@/types';
import { StageStatus } from '@/types/enums';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{ stages: ContractStage[] }>();

const activeIndex = computed(() => {
  const firstOpenIndex = props.stages.findIndex(stage => stage.status !== StageStatus.Approved);
  return firstOpenIndex === -1 ? props.stages.length : firstOpenIndex;
});
const processStatus = computed(() =>
  props.stages[activeIndex.value]?.status === StageStatus.Submitted ? 'finish' : 'process'
);

function stepStatus(status: StageStatus) {
  if (status === StageStatus.Approved) {
    return 'success';
  }
  if (status === StageStatus.Submitted) {
    return 'finish';
  }
  return 'wait';
}
</script>
