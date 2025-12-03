import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Post()
  create(
    @Body()
    body: {
      userId: number;
      userUploadedAudio: string;
      recommendedMusic: import('./history.entity').RecommendedMusicItem[];
    },
  ) {
    return this.historyService.createHistory({
      userId: Number(body.userId),
      userUploadedAudio: body.userUploadedAudio,
      recommendedMusic: body.recommendedMusic,
    });
  }

  // 특정 유저의 히스토리 조회 (예시)
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.historyService.findByUserId(Number(userId));
  }
}
