import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { UserRole } from '../common/enums';

export class AuditQueryDto {
  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsString() @MaxLength(200)
  query?: string;

  @IsOptional() @IsString() @MaxLength(120)
  action?: string;

  @IsOptional() @IsIn(['success', 'failure'])
  outcome?: 'success' | 'failure';

  @IsOptional() @IsIn(Object.values(UserRole))
  actorRole?: UserRole;

  @IsOptional() @IsString() @MaxLength(40)
  from?: string;

  @IsOptional() @IsString() @MaxLength(40)
  to?: string;
}
