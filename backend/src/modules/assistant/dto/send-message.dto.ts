import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
