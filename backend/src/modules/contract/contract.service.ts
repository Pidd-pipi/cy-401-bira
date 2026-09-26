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
import { User } from '../user/entity/user.entity';
import { Contract, ContractStage, StageHistoryEntry } from './entity/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';

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
    return contracts.map(contract => this.normalize(contract));
  }

  async findMine(userId: string) {
    const contracts = await this.contractRepository.find({
      where: [{ buyerId: userId }, { freelancerId: userId }],
      order: { createdAt: 'DESC' }
    });
    return contracts.map(contract => this.normalize(contract));
  }

  async findOne(id: string) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    return this.normalize(contract);
  }

  async create(buyerId: string, dto: CreateContractDto) {
    const requirement = await this.requirementRepository.findOne({ where: { id: dto.requirementId } });
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    const contract = this.contractRepository.create({
      ...dto,
      contractNo: `CY-${Date.now()}`,
      buyerId,
      stages: dto.stages.map(stage => ({
        ...stage,
        completed: false,
        status: StageStatus.Pending,
        note: undefined,
        submittedAt: undefined,
        reviewedAt: undefined,
        rejectReason: undefined,
        history: []
      })),
      status: ContractStatus.PendingSign
    });
    return this.normalize(await this.contractRepository.save(contract));
  }

  async sign(id: string, userId: string) {
    const contract = await this.findOne(id);
    this.assertParty(contract, userId);
    if (contract.status !== ContractStatus.PendingSign) {
      throw new BadRequestException('只有待签署的合同可以签署');
    }

    contract.status = ContractStatus.Active;
    const saved = await this.contractRepository.save(contract);
    await this.requirementRepository.update(contract.requirementId, {
      status: RequirementStatus.InProgress,
      winnerId: contract.freelancerId
    });
    return this.normalize(saved);
  }

  /** 自由职业者提交本阶段完成说明（退回后可补交后重新提交） */
  async submitStage(id: string, stageIndex: number, userId: string, note: string) {
    const contract = await this.findOne(id);
    if (contract.freelancerId !== userId) {
      throw new ForbiddenException('只有承接本合同的自由职业者可以提交阶段说明');
    }
    if (contract.status !== ContractStatus.Active && contract.status !== ContractStatus.PendingReview) {
      throw new BadRequestException('当前合同状态不允许提交阶段说明');
    }

    const stage = this.getStage(contract, stageIndex);
    if (stageIndex > 0) {
      const previous = this.getStage(contract, stageIndex - 1);
      if (previous.status !== StageStatus.Approved) {
        throw new BadRequestException('上一阶段尚未通过验收，暂不能开始本阶段');
      }
    }
    if (stage.status !== StageStatus.Pending) {
      throw new BadRequestException(
        stage.status === StageStatus.Submitted
          ? '本阶段说明已提交，等待需求方验收'
          : '本阶段已通过验收，无需重复提交'
      );
    }

    stage.note = note;
    stage.status = StageStatus.Submitted;
    stage.submittedAt = new Date().toISOString();
    stage.rejectReason = undefined;
    stage.completed = false;
    this.appendHistory(stage, 'submit', note, contract.freelancer);

    contract.status = ContractStatus.PendingReview;
    return this.persist(contract);
  }

  /** 需求方确认通过本阶段 */
  async approveStage(id: string, stageIndex: number, userId: string) {
    const contract = await this.findOne(id);
    if (contract.buyerId !== userId) {
      throw new ForbiddenException('只有需求方可以确认阶段验收');
    }

    const stage = this.getStage(contract, stageIndex);
    if (stage.status !== StageStatus.Submitted) {
      throw new BadRequestException('只有待验收的阶段可以确认通过');
    }

    stage.status = StageStatus.Approved;
    stage.completed = true;
    stage.reviewedAt = new Date().toISOString();
    stage.rejectReason = undefined;
    this.appendHistory(stage, 'approve', undefined, contract.buyer);

    const allApproved = contract.stages.every(item => item.status === StageStatus.Approved);
    if (allApproved) {
      contract.status = ContractStatus.Completed;
      const saved = await this.persist(contract);
      await this.requirementRepository.update(contract.requirementId, {
        status: RequirementStatus.Completed
      });
      return saved;
    }

    const pendingReview = contract.stages.some(item => item.status === StageStatus.Submitted);
    contract.status = pendingReview ? ContractStatus.PendingReview : ContractStatus.Active;
    return this.persist(contract);
  }

  /** 需求方退回本阶段并写明原因 */
  async rejectStage(id: string, stageIndex: number, userId: string, reason: string) {
    const contract = await this.findOne(id);
    if (contract.buyerId !== userId) {
      throw new ForbiddenException('只有需求方可以退回阶段');
    }

    const stage = this.getStage(contract, stageIndex);
    if (stage.status !== StageStatus.Submitted) {
      throw new BadRequestException('只有待验收的阶段可以退回');
    }

    stage.status = StageStatus.Pending;
    stage.completed = false;
    stage.reviewedAt = new Date().toISOString();
    stage.rejectReason = reason;
    this.appendHistory(stage, 'reject', reason, contract.buyer);

    const pendingReview = contract.stages.some(item => item.status === StageStatus.Submitted);
    contract.status = pendingReview ? ContractStatus.PendingReview : ContractStatus.Active;
    return this.persist(contract);
  }

  async terminate(id: string, userId: string) {
    const contract = await this.findOne(id);
    this.assertParty(contract, userId);
    if (contract.status === ContractStatus.Completed || contract.status === ContractStatus.Terminated) {
      throw new BadRequestException('已结束的合同不能终止');
    }
    contract.status = ContractStatus.Terminated;
    return this.persist(contract);
  }

  private async persist(contract: Contract) {
    return this.normalize(await this.contractRepository.save(contract));
  }

  private getStage(contract: Contract, stageIndex: number): ContractStage {
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= contract.stages.length) {
      throw new NotFoundException('Stage not found');
    }
    return contract.stages[stageIndex];
  }

  private assertParty(contract: Contract, userId: string) {
    if (contract.buyerId !== userId && contract.freelancerId !== userId) {
      throw new ForbiddenException('只有合同双方可以操作本合同');
    }
  }

  private appendHistory(stage: ContractStage, action: StageHistoryEntry['action'], note: string | undefined, user: User) {
    const entry: StageHistoryEntry = {
      action,
      note,
      operatorId: user.id,
      operatorName: user.username,
      at: new Date().toISOString()
    };
    stage.history = [...(stage.history || []), entry];
  }

  /** 兼容存量合同：补齐阶段状态字段，保持 completed 与 status 一致 */
  private normalize(contract: Contract): Contract {
    contract.stages = (contract.stages || []).map(stage => {
      const completed = Boolean(stage.completed);
      const status = stage.status || (completed ? StageStatus.Approved : StageStatus.Pending);
      return {
        ...stage,
        completed: status === StageStatus.Approved || completed,
        status,
        history: Array.isArray(stage.history) ? stage.history : []
      };
    });
    return contract;
  }
}
