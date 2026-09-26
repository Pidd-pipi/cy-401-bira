/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'assert';
import { ContractStatus } from '../src/common/enums/contract-status.enum';
import { RequirementStatus } from '../src/common/enums/requirement-status.enum';
import { StageStatus } from '../src/common/enums/stage-status.enum';
import { Contract } from '../src/modules/contract/entity/contract.entity';
import { ContractService } from '../src/modules/contract/contract.service';

// ---- 轻量内存仓储 ----
let store: Contract[] = [];
let requirementStatus: RequirementStatus = RequirementStatus.InProgress;

function makeContract(): Contract {
  return {
    id: 'c1',
    contractNo: 'CY-1',
    totalAmount: 1000,
    paymentMode: 'milestone' as any,
    status: ContractStatus.Active,
    requirementId: 'r1',
    requirement: {} as any,
    buyerId: 'buyer',
    buyer: {} as any,
    freelancerId: 'freelancer',
    freelancer: {} as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    stages: [
      { title: 'S1', amount: 400, dueDate: '2026-10-01', status: StageStatus.NotStarted, completed: false },
      { title: 'S2', amount: 600, dueDate: '2026-11-01', status: StageStatus.NotStarted, completed: false }
    ]
  };
}

const contractRepo: any = {
  find: async () => store,
  findOne: async ({ where }: any) => store.find(c => c.id === where.id) || null,
  create: (data: any) => data as Contract,
  save: async (contract: Contract) => {
    const idx = store.findIndex(c => c.id === contract.id);
    if (idx >= 0) store[idx] = contract;
    else store.push(contract);
    return contract;
  }
};
const requirementRepo: any = {
  findOne: async () => ({ id: 'r1' }),
  update: async (_id: string, patch: any) => {
    if (patch.status) requirementStatus = patch.status;
  }
};

const service = new ContractService(contractRepo, requirementRepo);

async function expectThrow(fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn();
    assert.fail('应当抛出异常');
  } catch (e: any) {
    assert.match(e.message, match, `异常信息不符合预期: ${e.message}`);
  }
}

(async () => {
  // 1. 非合同双方不能操作
  store = [makeContract()];
  await expectThrow(
    () => service.submitStage('c1', 0, 'stranger', { submissionNote: 'done' }),
    /合同双方/
  );

  // 2. 甲方不能提交阶段说明
  await expectThrow(
    () => service.submitStage('c1', 0, 'buyer', { submissionNote: 'done' }),
    /自由职业者/
  );

  // 3. 乙方提交第一阶段
  let c = await service.submitStage('c1', 0, 'freelancer', { submissionNote: '第一阶段交付' });
  assert.equal(c.stages[0].status, StageStatus.PendingReview);
  assert.equal(c.status, ContractStatus.PendingReview);
  assert.equal(c.stages[0].submissionNote, '第一阶段交付');
  assert.ok(c.stages[0].submittedAt);

  // 4. 重复提交待审阶段被拒
  await expectThrow(
    () => service.submitStage('c1', 0, 'freelancer', { submissionNote: 'again' }),
    /等待需求方验收/
  );

  // 5. 前一阶段未通过，第二阶段不能开始
  await expectThrow(
    () => service.submitStage('c1', 1, 'freelancer', { submissionNote: 'skip ahead' }),
    /上一阶段尚未通过/
  );

  // 6. 乙方不能验收
  await expectThrow(
    () => service.reviewStage('c1', 0, 'freelancer', { approved: true }),
    /需求方/
  );

  // 7. 甲方退回但不写原因 -> 报错
  await expectThrow(
    () => service.reviewStage('c1', 0, 'buyer', { approved: false }),
    /退回时必须写明原因/
  );

  // 8. 甲方退回并写明原因
  c = await service.reviewStage('c1', 0, 'buyer', {
    approved: false,
    rejectReason: '缺少测试报告'
  });
  assert.equal(c.stages[0].status, StageStatus.Rejected);
  assert.equal(c.stages[0].completed, false);
  assert.equal(c.stages[0].rejectReason, '缺少测试报告');
  assert.equal(c.status, ContractStatus.Active);

  // 9. 乙方补交说明重新提交，退回原因被清空
  c = await service.submitStage('c1', 0, 'freelancer', { submissionNote: '已补充测试报告' });
  assert.equal(c.stages[0].status, StageStatus.PendingReview);
  assert.equal(c.stages[0].rejectReason, null);

  // 10. 甲方通过第一阶段，合同仍执行中、需求未完成
  c = await service.reviewStage('c1', 0, 'buyer', { approved: true });
  assert.equal(c.stages[0].status, StageStatus.Approved);
  assert.equal(c.stages[0].completed, true);
  assert.equal(c.status, ContractStatus.Active);
  assert.equal(requirementStatus, RequirementStatus.InProgress);

  // 11. 第二阶段提交 -> 通过，全部阶段完成 -> 合同与需求完成
  c = await service.submitStage('c1', 1, 'freelancer', { submissionNote: '最终交付' });
  assert.equal(c.status, ContractStatus.PendingReview);
  c = await service.reviewStage('c1', 1, 'buyer', { approved: true });
  assert.equal(c.status, ContractStatus.Completed);
  assert.equal(requirementStatus, RequirementStatus.Completed);

  // 12. 全部完成后不能再提交
  await expectThrow(
    () => service.submitStage('c1', 0, 'freelancer', { submissionNote: 'x' }),
    /未处于执行中/
  );

  // 13. 非双方不能终止合同
  store = [makeContract()];
  await expectThrow(() => service.terminate('c1', 'stranger'), /合同双方/);

  // 14. 旧数据兼容：只有 completed 的阶段被归一化为 approved
  store = [
    {
      ...makeContract(),
      stages: [
        { title: 'old', amount: 1, dueDate: '2026-01-01', completed: true } as any,
        { title: 'old2', amount: 1, dueDate: '2026-02-01', completed: false } as any
      ]
    }
  ];
  c = await service.findOne('c1');
  assert.equal(c.stages[0].status, StageStatus.Approved);
  assert.equal(c.stages[1].status, StageStatus.NotStarted);

  console.log('全部阶段验收逻辑断言通过 ✔');
})().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
