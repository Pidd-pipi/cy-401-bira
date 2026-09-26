<template>
  <el-timeline>
    <el-timeline-item
      v-for="(stage, index) in stages"
      :key="stage.title"
      :type="dotType(stage.status)"
      :hollow="stage.status === StageStatus.Pending && !isCurrent(index)"
      :timestamp="stageTimestamp(stage)"
      placement="top"
    >
      <el-card shadow="never" class="stage-card">
        <div class="stage-head">
          <div>
            <span class="stage-title">第 {{ index + 1 }} 阶段 · {{ stage.title }}</span>
            <el-tag class="stage-tag" :type="tagType(stage.status)" size="small">
              {{ statusLabel(stage.status) }}
            </el-tag>
            <el-tag v-if="isCurrent(index) && !isLocked(index)" size="small" type="warning">当前阶段</el-tag>
            <el-tag v-if="isLocked(index)" size="small" type="info">待上一阶段通过</el-tag>
          </div>
          <span class="muted">{{ formatCurrency(stage.amount) }} · 截止 {{ stage.dueDate }}</span>
        </div>

        <div v-if="stage.note" class="stage-note">
          <span class="label">完成说明：</span>{{ stage.note }}
        </div>
        <el-alert
          v-if="stage.rejectReason"
          class="stage-alert"
          type="error"
          :closable="false"
          show-icon
          :title="`退回原因：${stage.rejectReason}`"
        />

        <!-- 自由职业者提交 / 补交说明 -->
        <div v-if="canFreelancerAct(stage, index)" class="stage-actions">
          <el-input
            v-model="drafts[index]"
            type="textarea"
            :rows="3"
            :placeholder="stage.rejectReason ? '请根据退回原因补交本阶段完成说明' : '请填写本阶段完成说明'"
          />
          <el-button type="primary" :loading="submitting" @click="onSubmit(index)">
            {{ stage.rejectReason ? '补交并重新提交' : '提交阶段说明' }}
          </el-button>
        </div>

        <!-- 需求方验收 -->
        <div v-if="canBuyerAct(stage, index)" class="stage-actions">
          <el-input
            v-model="rejectDrafts[index]"
            type="textarea"
            :rows="2"
            placeholder="退回时请填写原因"
          />
          <el-button type="success" :loading="approving" @click="onApprove(index)">确认通过</el-button>
          <el-button type="danger" plain :loading="rejecting" @click="onReject(index)">退回</el-button>
        </div>

        <el-collapse v-if="stage.history && stage.history.length" class="stage-history">
          <el-collapse-item :title="`验收记录（${stage.history.length}）`" :name="index">
            <div v-for="(entry, entryIndex) in stage.history" :key="entryIndex" class="history-entry">
              <el-tag :type="historyTagType(entry.action)" size="small">{{ historyLabel(entry.action) }}</el-tag>
              <span class="history-operator">{{ entry.operatorName }}</span>
              <span class="muted">{{ formatDateTime(entry.at) }}</span>
              <p v-if="entry.note" class="history-note">{{ entry.note }}</p>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </el-timeline-item>
  </el-timeline>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import type { ContractStage, StageHistoryAction } from '@/types';
import { ContractStatus, StageStatus } from '@/types/enums';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{
  stages: ContractStage[];
  contractStatus: ContractStatus;
  viewerRole: 'buyer' | 'freelancer' | 'outsider';
  submitting?: boolean;
  approving?: boolean;
  rejecting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'submit', index: number, note: string): void;
  (e: 'approve', index: number): void;
  (e: 'reject', index: number, reason: string): void;
}>();

const drafts = reactive<Record<number, string>>({});
const rejectDrafts = reactive<Record<number, string>>({});

const contractActive = () =>
  [ContractStatus.Active, ContractStatus.PendingReview].includes(props.contractStatus);

function isCurrent(index: number) {
  const previousApproved = index === 0 || props.stages[index - 1]?.status === StageStatus.Approved;
  return previousApproved && props.stages[index]?.status !== StageStatus.Approved;
}

function isLocked(index: number) {
  return index > 0 && props.stages[index - 1]?.status !== StageStatus.Approved;
}

function canFreelancerAct(stage: ContractStage, index: number) {
  return (
    props.viewerRole === 'freelancer' &&
    contractActive() &&
    stage.status === StageStatus.Pending &&
    !isLocked(index)
  );
}

function canBuyerAct(stage: ContractStage, index: number) {
  return (
    props.viewerRole === 'buyer' &&
    contractActive() &&
    stage.status === StageStatus.Submitted &&
    !isLocked(index)
  );
}

function onSubmit(index: number) {
  const note = (drafts[index] || '').trim();
  if (!note) {
    ElMessage.warning('请填写本阶段完成说明');
    return;
  }
  emit('submit', index, note);
}

function onApprove(index: number) {
  emit('approve', index);
}

function onReject(index: number) {
  const reason = (rejectDrafts[index] || '').trim();
  if (!reason) {
    ElMessage.warning('请填写退回原因');
    return;
  }
  emit('reject', index, reason);
}

function statusLabel(status: StageStatus) {
  return {
    [StageStatus.Pending]: '待提交',
    [StageStatus.Submitted]: '待验收',
    [StageStatus.Approved]: '已通过'
  }[status];
}

function tagType(status: StageStatus) {
  return {
    [StageStatus.Pending]: 'info',
    [StageStatus.Submitted]: 'warning',
    [StageStatus.Approved]: 'success'
  }[status] as 'info' | 'warning' | 'success';
}

function dotType(status: StageStatus) {
  return {
    [StageStatus.Pending]: 'info',
    [StageStatus.Submitted]: 'warning',
    [StageStatus.Approved]: 'success'
  }[status] as 'info' | 'warning' | 'success';
}

function stageTimestamp(stage: ContractStage) {
  if (stage.status === StageStatus.Approved && stage.reviewedAt) {
    return `通过于 ${formatDateTime(stage.reviewedAt)}`;
  }
  if (stage.status === StageStatus.Submitted && stage.submittedAt) {
    return `提交于 ${formatDateTime(stage.submittedAt)}`;
  }
  return `截止 ${stage.dueDate}`;
}

function historyLabel(action: StageHistoryAction) {
  return { submit: '提交说明', approve: '确认通过', reject: '退回' }[action];
}

function historyTagType(action: StageHistoryAction) {
  return { submit: 'info', approve: 'success', reject: 'danger' }[action] as
    | 'info'
    | 'success'
    | 'danger';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
</script>

<style scoped>
.stage-card {
  margin-bottom: 4px;
}

.stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.stage-title {
  font-weight: 700;
  margin-right: 8px;
}

.stage-tag {
  margin-right: 6px;
}

.stage-note {
  margin-top: 10px;
  color: #374151;
  white-space: pre-wrap;
}

.stage-alert,
.stage-actions,
.stage-history {
  margin-top: 12px;
}

.stage-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.stage-actions .el-input {
  width: 100%;
}

.history-entry {
  padding: 6px 0;
}

.history-operator {
  margin: 0 8px;
  font-weight: 600;
}

.history-note {
  margin: 6px 0 0;
  color: #4b5563;
  white-space: pre-wrap;
}

.muted {
  color: #6b7280;
  font-size: 13px;
}

.label {
  font-weight: 600;
  color: #111827;
}
</style>
