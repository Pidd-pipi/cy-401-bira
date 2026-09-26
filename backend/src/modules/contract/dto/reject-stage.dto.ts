import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectStageDto {
  @IsString()
  @MinLength(1, { message: '请填写退回原因' })
  @MaxLength(2000)
  reason: string;
}
