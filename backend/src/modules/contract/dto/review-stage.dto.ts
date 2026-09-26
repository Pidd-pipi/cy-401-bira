import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewStageDto {
  @IsBoolean()
  approved: boolean;

  // 退回时必须写明原因（非空校验在 service 中执行）
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectReason?: string;
}
