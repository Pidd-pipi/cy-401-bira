import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ReviewStageDto } from './dto/review-stage.dto';
import { SubmitStageDto } from './dto/submit-stage.dto';

@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  findAll() {
    return this.contractService.findAll();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@Req() req: Request & { user: { sub: string } }) {
    return this.contractService.findMine(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateContractDto) {
    return this.contractService.create(req.user.sub, dto);
  }

  @Patch(':id/sign')
  @UseGuards(JwtAuthGuard)
  sign(@Param('id') id: string, @Req() req: Request & { user: { sub: string } }) {
    return this.contractService.sign(id, req.user.sub);
  }

  // 自由职业者提交本阶段交付说明
  @Patch(':id/stages/:stageIndex/submit')
  @UseGuards(JwtAuthGuard)
  submitStage(
    @Param('id') id: string,
    @Param('stageIndex', ParseIntPipe) stageIndex: number,
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: SubmitStageDto
  ) {
    return this.contractService.submitStage(id, stageIndex, req.user.sub, dto);
  }

  // 需求方逐段验收：通过 / 退回并写明原因
  @Patch(':id/stages/:stageIndex/review')
  @UseGuards(JwtAuthGuard)
  reviewStage(
    @Param('id') id: string,
    @Param('stageIndex', ParseIntPipe) stageIndex: number,
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: ReviewStageDto
  ) {
    return this.contractService.reviewStage(id, stageIndex, req.user.sub, dto);
  }

  @Patch(':id/terminate')
  @UseGuards(JwtAuthGuard)
  terminate(@Param('id') id: string, @Req() req: Request & { user: { sub: string } }) {
    return this.contractService.terminate(id, req.user.sub);
  }
}
