import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitStageDto {
  @IsString()
  @MinLength(1, { message: '请填写本阶段完成说明' })
  @MaxLength(2000)
  note: string;
}
