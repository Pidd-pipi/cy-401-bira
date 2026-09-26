import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractStatus } from '../../common/enums/contract-status.enum';
import { RequirementStatus } from '../../common/enums/requirement-status.enum';
import { StageStatus } from '../../common/enums/stage-status.enum';
import { Requirement } from '../requirement/entity/requirement.entity';
import { Contract } from './entity/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { ReviewStageDto } from './dto/review-stage.dto';
import { SubmitStageDto } from './dto/submit-stage.dto';

@Injectable()
export class ContractService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(Requirement)
    private readonly requirementRepository: Repository<Requirement>
  ) {}

  async findAll() {
    const contracts = await this.contractRepository.find({ order: { createdAt: 'DESC' } });
    return contracts.map(contract => this.normalizeContract(contract));
  }

  async findMine(userId: string) {
    const contracts = await this.contractRepository.find({
      where: [{ buyerId: userId }, { freelancerId: userId }],
      order: { createdAt: 'DESC' }
    });
    return contracts.map(contract => this.normalizeContract(contract));
  }

  async findOne(id: string) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    return this.normalizeContract(contract);
  }

  async create(buyerId: string, dto: CreateContractDto) {
    const requirement = await this.requirementRepository.findOne({ where: { id: dto.requirementId } });
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }
    if (dto.freelancerId === buyerId) {
      throw new BadRequestException('不能与自己创建合同');
    }
    if (!dto.stages.length) {
      throw new BadRequestException('至少需要一个合同阶段');
    }

    const contract = this.contractRepository.create({
      ...dto,
      contractNo: `CY-${Date.now()}`,
      buyerId,
      stages: dto.stages.map(stage => ({
        ...stage,
        status: StageStatus.NotStarted,
        completed: false,
        submissionNote: null,
        submittedAt: null,
        rejectReason: null,
        reviewedAt: null
      })),
      status: ContractStatus.PendingSign
    });
    return this.normalizeContract(await this.contractRepository.save(contract));
  }

  async sign(id: string, userId: string) {
    const contract = await this.assertParty(id, userId);
    if (contract.status !== ContractStatus.PendingSign) {
      throw new BadRequestException('当前合同状态无法签署');
    }
    contract.status = ContractStatus.Active;
    await this.requirementRepository.update(contract.requirementId, {
      status: RequirementStatus.InProgress,
      winnerId: contract.freelancerId
    });
    return this.normalizeContract(await this.contractRepository.save(contract));
  }

  /**
   * 自由职业者提交本阶段交付说明（退回后可重新提交）。
   */
  async submitStage(id: string, stageIndex: number, userId: string, dto: SubmitStageDto) {
    const contract = await this.assertParty(id, userId);
    if (contract.freelancerId !== userId) {
      throw new ForbiddenException('只有承接的自由职业者可以提交阶段说明');
    }
    if (![ContractStatus.Active, ContractStatus.PendingReview].includes(contract.status)) {
      throw new BadRequestException('合同未处于执行中，无法提交阶段说明');
    }

    const stage = this.getStage(contract, stageIndex);
    if (stage.status === StageStatus.Approved) {
      throw new BadRequestException('该阶段已通过验收，无需重复提交');
    }
    if (stage.status === StageStatus.PendingReview) {
      throw new BadRequestException('该阶段已提交，正在等待需求方验收');
    }
    // 前一阶段未通过时，后面的阶段不能开始
    if (stageIndex > 0) {
      const previous = contract.stages[stageIndex - 1];
      if (previous.status !== StageStatus.Approved) {
        throw new BadRequestException('上一阶段尚未通过验收，暂时不能开始本阶段');
      }
    }

    stage.status = StageStatus.PendingReview;
    stage.submissionNote = dto.submissionNote;
    stage.submittedAt = new Date().toISOString();
    stage.rejectReason = null;
    stage.reviewedAt = null;
    stage.completed = false;

    contract.status = ContractStatus.PendingReview;
    return this.normalizeContract(await this.contractRepository.save(contract));
  }

  /**
   * 需求方逐段验收：通过，或退回并写明原因。
   */
  async reviewStage(id: string, stageIndex: number, userId: string, dto: ReviewStageDto) {
    const contract = await this.assertParty(id, userId);
    if (contract.buyerId !== userId) {
      throw new ForbiddenException('只有需求方可以进行阶段验收');
    }
    if (![ContractStatus.Active, ContractStatus.PendingReview].includes(contract.status)) {
      throw new BadRequestException('合同当前状态无法进行阶段验收');
    }

    const stage = this.getStage(contract, stageIndex);
    if (stage.status !== StageStatus.PendingReview) {
      throw new BadRequestException('该阶段未提交验收，无法进行审核');
    }
    if (!dto.approved && !dto.rejectReason?.trim()) {
      throw new BadRequestException('退回时必须写明原因');
    }

    stage.reviewedAt = new Date().toISOString();
    if (dto.approved) {
      stage.status = StageStatus.Approved;
      stage.completed = true;
      stage.rejectReason = null;
    } else {
      stage.status = StageStatus.Rejected;
      stage.completed = false;
      stage.rejectReason = dto.rejectReason!.trim();
    }

    // 全部阶段通过后，合同与其关联需求才完成
    const allApproved = contract.stages.every(item => item.status === StageStatus.Approved);
    if (allApproved) {
      contract.status = ContractStatus.Completed;
      await this.requirementRepository.update(contract.requirementId, {
        status: RequirementStatus.Completed
      });
    } else {
      // 通过后可能进入下一阶段，也可能仍有待验收阶段；有在审则保持待验收，否则回到执行中
      const hasPending = contract.stages.some(item => item.status === StageStatus.PendingReview);
      contract.status = hasPending ? ContractStatus.PendingReview : ContractStatus.Active;
    }

    return this.normalizeContract(await this.contractRepository.save(contract));
  }

  async terminate(id: string, userId: string) {
    const contract = await this.assertParty(id, userId);
    contract.status = ContractStatus.Terminated;
    return this.normalizeContract(await this.contractRepository.save(contract));
  }

  /** 仅合同双方（甲方/乙方）可以操作 */
  private async assertParty(id: string, userId: string): Promise<Contract> {
    const contract = await this.findOne(id);
    if (contract.buyerId !== userId && contract.freelancerId !== userId) {
      throw new ForbiddenException('只有合同双方可以操作该合同');
    }
    return contract;
  }

  private getStage(contract: Contract, stageIndex: number) {
    const stage = contract.stages?.[stageIndex];
    if (!stage) {
      throw new NotFoundException('合同阶段不存在');
    }
    return stage;
  }

  /**
   * 兼容历史数据：旧阶段只有 completed 标记，补齐逐段验收所需字段。
   */
  private normalizeContract(contract: Contract): Contract {
    contract.stages = (contract.stages || []).map(stage => {
      const status =
        stage.status || (stage.completed ? StageStatus.Approved : StageStatus.NotStarted);
      return {
        ...stage,
        status,
        completed: status === StageStatus.Approved,
        submissionNote: stage.submissionNote ?? null,
        submittedAt: stage.submittedAt ?? null,
        rejectReason: stage.rejectReason ?? null,
        reviewedAt: stage.reviewedAt ?? null
      };
    });
    return contract;
  }
}
