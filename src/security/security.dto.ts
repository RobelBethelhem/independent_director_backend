import { IsIP, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportTamperDto {
  /** What was attempted (e.g. 'contextmenu', 'devtools-shortcut', 'view-source'). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  kind?: string;
}

export class AddBlockedIpDto {
  @IsIP()
  ip!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
