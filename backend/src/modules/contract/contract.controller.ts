import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { RejectStageDto } from './dto/reject-stage.dto';
import { SubmitStageDto } from './dto/submit-stage.dto';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  findAll() {
    return this.contractService.findAll();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@Req() req: AuthRequest) {
    return this.contractService.findMine(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: AuthRequest, @Body() dto: CreateContractDto) {
    return this.contractService.create(req.user.sub, dto);
  }

  @Patch(':id/sign')
  @UseGuards(JwtAuthGuard)
  sign(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.contractService.sign(id, req.user.sub);
  }

  @Patch(':id/stages/:stageIndex/submit')
  @UseGuards(JwtAuthGuard)
  submitStage(
    @Param('id') id: string,
    @Param('stageIndex', ParseIntPipe) stageIndex: number,
    @Req() req: AuthRequest,
    @Body() dto: SubmitStageDto
  ) {
    return this.contractService.submitStage(id, stageIndex, req.user.sub, dto.note);
  }

  @Patch(':id/stages/:stageIndex/approve')
  @UseGuards(JwtAuthGuard)
  approveStage(
    @Param('id') id: string,
    @Param('stageIndex', ParseIntPipe) stageIndex: number,
    @Req() req: AuthRequest
  ) {
    return this.contractService.approveStage(id, stageIndex, req.user.sub);
  }

  @Patch(':id/stages/:stageIndex/reject')
  @UseGuards(JwtAuthGuard)
  rejectStage(
    @Param('id') id: string,
    @Param('stageIndex', ParseIntPipe) stageIndex: number,
    @Req() req: AuthRequest,
    @Body() dto: RejectStageDto
  ) {
    return this.contractService.rejectStage(id, stageIndex, req.user.sub, dto.reason);
  }

  @Patch(':id/terminate')
  @UseGuards(JwtAuthGuard)
  terminate(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.contractService.terminate(id, req.user.sub);
  }
}
