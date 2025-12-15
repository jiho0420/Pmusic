import { Controller, Get, Param, UseGuards, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // 유저 히스토리 조회: GET /api/history/user/:userid
  // 본인의 히스토리만 조회 가능 (JWT 토큰에서 userId 추출하여 권한 체크)
  @Get('user/:userid')
  @UseGuards(JwtAuthGuard)
  findUserHistory(
    @Param('userid') userid: string,
    @Request() req: { user: { id: number; email: string; nickname: string } },
  ) {
    const requestedUserId = parseInt(userid, 10);
    
    // userid 파라미터 유효성 검증
    if (isNaN(requestedUserId)) {
      throw new BadRequestException('유효하지 않은 사용자 ID입니다.');
    }
    
    // 본인 히스토리만 조회 가능
    if (requestedUserId !== req.user.id) {
      throw new ForbiddenException('본인의 히스토리만 조회할 수 있습니다.');
    }
    
    return this.historyService.findByUserId(requestedUserId);
  }
}
