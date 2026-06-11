import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { PutReviewDto, PutScoresDto } from './review.dto';

@Roles(UserRole.Reviewer)
@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('overview')
  overview(@CurrentUser('id') userId: string) {
    return this.review.overview(userId);
  }

  @Get('applications')
  list(@CurrentUser('id') userId: string) {
    return this.review.list(userId);
  }

  @Get('shortlist')
  shortlist(@CurrentUser('id') userId: string) {
    return this.review.shortlist(userId);
  }

  @Get('applications/:id')
  dossier(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.dossier(userId, id);
  }

  @Get('applications/:id/suggested-scores')
  suggested(@Param('id', ParseUUIDPipe) id: string) {
    return this.review.suggestedScores(id);
  }

  @Get('applications/:id/documents/:docId/preview')
  previewDoc(@Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    return this.review.previewDocument(id, docId);
  }

  @Get('applications/:id/documents/:docId/download')
  downloadDoc(@Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    return this.review.downloadDocument(id, docId);
  }

  @Put('applications/:id/scores')
  scores(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutScoresDto,
  ) {
    return this.review.putScores(userId, id, dto);
  }

  @Put('applications/:id/review')
  putReview(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutReviewDto,
  ) {
    return this.review.putReview(userId, id, dto);
  }
}
