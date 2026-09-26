<template>
  <section class="page">
    <el-page-header @back="$router.push('/dashboard')">
      <template #content>
        <span>{{ contract?.contractNo || '合同详情' }}</span>
      </template>
    </el-page-header>

    <el-card v-if="contract" class="section" shadow="never">
      <template #header>
        <div class="contract-header">
          <div>
            <h1>{{ contract.contractNo }}</h1>
            <p class="muted">{{ contract.requirement?.title }}</p>
          </div>
          <StatusBadge :status="contract.status" />
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="总金额">{{ formatCurrency(contract.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="付款方式">{{ paymentLabel }}</el-descriptions-item>
        <el-descriptions-item label="甲方（需求方）"><UserAvatar :user="contract.buyer" /></el-descriptions-item>
        <el-descriptions-item label="乙方（自由职业者）"><UserAvatar :user="contract.freelancer" /></el-descriptions-item>
      </el-descriptions>

      <div class="section">
        <ProgressSteps :stages="contract.stages" />
        <p class="progress-text muted">
          阶段进度：已通过 {{ approvedCount }} / {{ contract.stages.length }} 段
        </p>
      </div>

      <!-- 仅合同双方可见操作区 -->
      <div v-if="isParty && contract.status === ContractStatus.PendingSign" class="section">
        <el-button type="primary" :loading="acting" @click="handleSign">双方签署确认</el-button>
      </div>
    </el-card>

    <el-card v-if="contract" class="section" shadow="never">
      <template #header>
        <div class="stage-list-header">
          <h2>分阶段验收</h2>
          <span class="muted">按顺序逐段交付、逐段验收，全部通过后合同与需求自动完成</span>
        </div>
      </template>

      <el-timeline>
        <el-timeline-item
          v-for="(stage, index) in contract.stages"
          :key="`${stage.title}-${index}`"
          :type="dotType(stage.status)"
          :hollow="stage.status === StageStatus.NotStarted"
          :timestamp="stageTimestamp(stage)"
        >
          <el-card shadow="never" class="stage-card">
            <div class="stage-head">
              <div>
                <span class="stage-index">阶段 {{ index + 1 }}</span>
                <span class="stage-title">{{ stage.title }}</span>
              </div>
              <div class="stage-meta">
                <span>{{ formatCurrency(stage.amount) }} · 截止 {{ stage.dueDate }}</span>
                <el-tag :type="stageTagType(stage.status)" size="small" effect="light">
                  {{ stageStatusLabel(stage.status) }}
                </el-tag>
              </div>
            </div>

            <!-- 交付说明 -->
            <div v-if="stage.submissionNote" class="stage-note">
              <div class="note-label">交付说明：</div>
              <p>{{ stage.submissionNote }}</p>
            </div>

            <!-- 退回原因 -->
            <el-alert
              v-if="stage.status === StageStatus.Rejected && stage.rejectReason"
              class="stage-alert"
              type="error"
              :closable="false"
              show-icon
              title="验收未通过"
              :description="`退回原因：${stage.rejectReason}`"
            />

            <!-- 乙方：提交 / 被退回后补交说明重新提交 -->
            <template v-if="isFreelancer && canFreelancerSubmit(stage, index)">
              <el-input
                v-model="submissionDrafts[index]"
                type="textarea"
                :rows="3"
                class="stage-action"
                :placeholder="
                  stage.status === StageStatus.Rejected
                    ? '请根据退回原因补交本阶段说明后重新提交'
                    : '请填写本阶段交付说明'
                "
              />
              <el-button
                type="primary"
                :loading="actingIndex === index"
                @click="handleSubmit(index)"
              >
                {{ stage.status === StageStatus.Rejected ? '重新提交' : '提交阶段说明' }}
              </el-button>
            </template>

            <!-- 甲方：验收通过 / 退回并写明原因 -->
            <template v-if="isBuyer && stage.status === StageStatus.PendingReview">
              <el-input
                v-model="rejectDrafts[index]"
                type="textarea"
                :rows="2"
                class="stage-action"
                placeholder="如不通过，请写明退回原因"
              />
              <div class="review-buttons">
                <el-button
                  type="success"
                  :loading="actingIndex === index"
                  @click="handleApprove(index)"
                >
                  验收通过
                </el-button>
                <el-button type="danger" plain :loading="actingIndex === index" @click="handleReject(index)">
                  退回修改
                </el-button>
              </div>
            </template>
          </el-card>
        </el-timeline-item>
      </el-timeline>

      <el-alert
        v-if="!isParty"
        class="section"
        type="info"
        :closable="false"
        title="您不是该合同的相关方，仅可查看进度，无法进行操作"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ProgressSteps from '@/components/common/ProgressSteps.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { useAuth } from '@/hooks/useAuth';
import { useContractStore } from '@/stores/contract';
import { useRequirementStore } from '@/stores/requirement';
import { ContractStatus, PaymentMode, StageStatus } from '@/types/enums';
import type { ContractStage } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const props = defineProps<{ id: string }>();
const contractStore = useContractStore();
const requirementStore = useRequirementStore();
const auth = useAuth();

const acting = ref(false);
const actingIndex = ref<number | null>(null);
const submissionDrafts = reactive<Record<number, string>>({});
const rejectDrafts = reactive<Record<number, string>>({});

const contract = computed(() => contractStore.currentContract);
const paymentLabel = computed(() =>
  contract.value?.paymentMode === PaymentMode.OneTime ? '一次性付款' : '分阶段付款'
);

const approvedCount = computed(
  () => contract.value?.stages.filter(stage => stage.status === StageStatus.Approved).length || 0
);

const isBuyer = computed(() => contract.value?.buyerId === auth.user.value?.id);
const isFreelancer = computed(() => contract.value?.freelancerId === auth.user.value?.id);
const isParty = computed(() => isBuyer.value || isFreelancer.value);

const stageStatusLabels: Record<StageStatus, string> = {
  [StageStatus.NotStarted]: '未开始',
  [StageStatus.PendingReview]: '待验收',
  [StageStatus.Approved]: '已通过',
  [StageStatus.Rejected]: '已退回'
};

function stageStatusLabel(status: StageStatus) {
  return stageStatusLabels[status] || status;
}

function stageTagType(status: StageStatus): 'info' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case StageStatus.Approved:
      return 'success';
    case StageStatus.PendingReview:
      return 'warning';
    case StageStatus.Rejected:
      return 'danger';
    default:
      return 'info';
  }
}

function dotType(status: StageStatus): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case StageStatus.Approved:
      return 'success';
    case StageStatus.PendingReview:
      return 'warning';
    case StageStatus.Rejected:
      return 'danger';
    default:
      return 'info';
  }
}

function stageTimestamp(stage: ContractStage) {
  if (stage.status === StageStatus.Approved) {
    return `通过时间：${formatDate(stage.reviewedAt || undefined)}`;
  }
  if (stage.status === StageStatus.Rejected) {
    return `退回时间：${formatDate(stage.reviewedAt || undefined)}`;
  }
  if (stage.status === StageStatus.PendingReview) {
    return `提交时间：${formatDate(stage.submittedAt || undefined)}`;
  }
  return `截止：${stage.dueDate}`;
}

/** 前一阶段未通过时后面无法开始；同时仅允许一个阶段在审 */
function canFreelancerSubmit(stage: ContractStage, index: number) {
  if (!contract.value || contract.value.status === ContractStatus.Completed) {
    return false;
  }
  if (![StageStatus.NotStarted, StageStatus.Rejected].includes(stage.status)) {
    return false;
  }
  // 已有阶段等待验收时，不能再提交后续阶段
  const hasPending = contract.value.stages.some(item => item.status === StageStatus.PendingReview);
  if (hasPending) {
    return false;
  }
  if (index === 0) {
    return true;
  }
  return contract.value.stages[index - 1].status === StageStatus.Approved;
}

async function handleSign() {
  acting.value = true;
  try {
    await contractStore.signContract(props.id);
    ElMessage.success('合同已签署，进入执行阶段');
  } finally {
    acting.value = false;
  }
}

async function handleSubmit(index: number) {
  const note = (submissionDrafts[index] || '').trim();
  if (!note) {
    ElMessage.warning('请先填写本阶段交付说明');
    return;
  }
  actingIndex.value = index;
  try {
    await contractStore.submitStage(props.id, index, note);
    submissionDrafts[index] = '';
    ElMessage.success('阶段说明已提交，等待需求方验收');
  } finally {
    actingIndex.value = null;
  }
}

async function handleApprove(index: number) {
  actingIndex.value = index;
  try {
    const updated = await contractStore.reviewStage(props.id, index, true);
    if (updated.status === ContractStatus.Completed) {
      // 全部阶段通过，关联需求完成，刷新工作台需求进度
      await requirementStore.fetchMine();
      ElMessage.success('最后阶段已通过，合同与关联需求全部完成');
    } else {
      ElMessage.success('阶段验收已通过');
    }
  } finally {
    actingIndex.value = null;
  }
}

async function handleReject(index: number) {
  const reason = (rejectDrafts[index] || '').trim();
  if (!reason) {
    ElMessage.warning('退回时必须写明原因');
    return;
  }
  actingIndex.value = index;
  try {
    await contractStore.reviewStage(props.id, index, false, reason);
    rejectDrafts[index] = '';
    ElMessage.info('已退回，等待自由职业者补交说明');
  } finally {
    actingIndex.value = null;
  }
}

onMounted(() => contractStore.fetchDetail(props.id));
</script>

<style scoped>
.contract-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.contract-header h1 {
  margin: 0;
  font-size: 24px;
}

.progress-text {
  margin-top: 12px;
  text-align: center;
}

.stage-list-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.stage-list-header h2 {
  margin: 0;
}

.stage-card {
  margin-bottom: 4px;
}

.stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.stage-index {
  display: inline-block;
  margin-right: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e6fffb;
  color: #0f766e;
  font-weight: 700;
  font-size: 12px;
}

.stage-title {
  font-weight: 700;
}

.stage-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #666;
  font-size: 13px;
}

.stage-note {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f7f8fa;
  border-radius: 6px;
}

.note-label {
  font-weight: 600;
  font-size: 13px;
}

.stage-note p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}

.stage-alert,
.stage-action {
  margin-top: 12px;
}

.review-buttons {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}
</style>
