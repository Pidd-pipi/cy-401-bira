import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SubmitStageDto {
  @IsString()
  @IsNotEmpty({ message: '请填写本阶段交付说明' })
  @MaxLength(2000)
  submissionNote: string;
}
