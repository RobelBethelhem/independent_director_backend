import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { CreateRecommendationDto } from './recommendations.dto';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recs: RecommendationsService) {}

  @Roles(UserRole.Recommender)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRecommendationDto) {
    return this.recs.create(userId, dto);
  }

  @Roles(UserRole.Recommender)
  @Get('mine')
  mine(@CurrentUser('id') userId: string) {
    return this.recs.mine(userId);
  }

  /** Public landing resolution — naming the recommender to the candidate. */
  @Public()
  @Get('by-token/:token')
  byToken(@Param('token') token: string) {
    return this.recs.byToken(token);
  }
}
