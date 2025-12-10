import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // 본인의 히스토리 조회 (로그인 필수)
  // JWT 토큰에서 userId를 추출하여 본인 히스토리만 조회
  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMyHistory(@Request() req: { user: { id: number; email: string; nickname: string } }) {
    return this.historyService.findByUserId(req.user.id);
  }
}
