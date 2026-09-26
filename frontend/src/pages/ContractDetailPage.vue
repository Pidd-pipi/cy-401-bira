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
        <el-descriptions-item label="甲方"><UserAvatar :user="contract.buyer" /></el-descriptions-item>
        <el-descriptions-item label="乙方"><UserAvatar :user="contract.freelancer" /></el-descriptions-item>
        <el-descriptions-item label="阶段进度" :span="2">
          已通过 {{ approvedCount }} / {{ contract.stages.length }} 阶段
        </el-descriptions-item>
      </el-descriptions>

      <div class="section">
        <ProgressSteps :stages="contract.stages" />
      </div>

      <div v-if="isParty && contract.status === ContractStatus.PendingSign" class="section">
        <el-button type="primary" :loading="signing" @click="handleSign">签署确认</el-button>
        <span class="muted">双方签署后合同开始执行，乙方可逐段提交验收。</span>
      </div>

      <div v-if="contract.status === ContractStatus.Completed" class="section">
        <el-result icon="success" title="全部阶段已通过验收" sub-title="合同与关联需求已完成">
          <template #extra>
            <RouterLink :to="`/requirements/${contract.requirementId}`">查看关联需求</RouterLink>
          </template>
        </el-result>
      </div>
      <el-alert
        v-else-if="contract.status === ContractStatus.Terminated"
        class="section"
        type="error"
        :closable="false"
        title="合同已终止"
      />

      <div v-if="isParty && [ContractStatus.Active, ContractStatus.PendingReview].includes(contract.status)" class="section">
        <h2>逐段验收</h2>
        <StageAcceptance
          :stages="contract.stages"
          :contract-status="contract.status"
          :viewer-role="viewerRole"
          :submitting="loadingAction === 'submit'"
          :approving="loadingAction === 'approve'"
          :rejecting="loadingAction === 'reject'"
          @submit="handleSubmitStage"
          @approve="handleApproveStage"
          @reject="handleRejectStage"
        />
      </div>
      <el-alert
        v-else-if="!isParty"
        class="section"
        type="info"
        :closable="false"
        title="您不是本合同当事人，仅可查看进度，不能进行验收操作"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import ProgressSteps from '@/components/common/ProgressSteps.vue';
import StageAcceptance from '@/components/common/StageAcceptance.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { useAuth } from '@/hooks/useAuth';
import { useContractStore } from '@/stores/contract';
import { ContractStatus, PaymentMode, StageStatus } from '@/types/enums';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{ id: string }>();
const contractStore = useContractStore();
const auth = useAuth();

const signing = ref(false);
const loadingAction = ref<'submit' | 'approve' | 'reject' | null>(null);

const contract = computed(() => contractStore.currentContract);
const paymentLabel = computed(() =>
  contract.value?.paymentMode === PaymentMode.OneTime ? '一次性付款' : '分阶段付款'
);
const approvedCount = computed(
  () => contract.value?.stages.filter(stage => stage.status === StageStatus.Approved).length ?? 0
);
const isParty = computed(
  () =>
    Boolean(auth.user.value) &&
    (contract.value?.buyerId === auth.user.value?.id ||
      contract.value?.freelancerId === auth.user.value?.id)
);
const viewerRole = computed<'buyer' | 'freelancer' | 'outsider'>(() => {
  if (!auth.user.value || !contract.value) {
    return 'outsider';
  }
  if (contract.value.buyerId === auth.user.value.id) {
    return 'buyer';
  }
  if (contract.value.freelancerId === auth.user.value.id) {
    return 'freelancer';
  }
  return 'outsider';
});

async function handleSign() {
  signing.value = true;
  try {
    await contractStore.signContract(props.id);
    ElMessage.success('合同已签署，开始执行');
  } finally {
    signing.value = false;
  }
}

async function handleSubmitStage(index: number, note: string) {
  loadingAction.value = 'submit';
  try {
    await contractStore.submitStage(props.id, index, note);
    ElMessage.success('阶段说明已提交，等待需求方验收');
  } finally {
    loadingAction.value = null;
  }
}

async function handleApproveStage(index: number) {
  try {
    await ElMessageBox.confirm('确认本阶段成果通过验收？通过后将进入下一阶段。', '阶段验收', {
      type: 'success',
      confirmButtonText: '确认通过',
      cancelButtonText: '取消'
    });
  } catch {
    return;
  }
  loadingAction.value = 'approve';
  try {
    const updated = await contractStore.approveStage(props.id, index);
    if (updated.status === ContractStatus.Completed) {
      ElMessage.success('全部阶段已通过，合同与关联需求已完成');
    } else {
      ElMessage.success('阶段已通过验收');
    }
  } finally {
    loadingAction.value = null;
  }
}

async function handleRejectStage(index: number, reason: string) {
  loadingAction.value = 'reject';
  try {
    await contractStore.rejectStage(props.id, index, reason);
    ElMessage.warning('阶段已退回，等待自由职业者补交说明');
  } finally {
    loadingAction.value = null;
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

.muted {
  color: #6b7280;
  font-size: 13px;
}
</style>
