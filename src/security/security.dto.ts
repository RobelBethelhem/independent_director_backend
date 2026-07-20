import { IsIP, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddBlockedIpDto {
  @IsIP()
  ip!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
