import { Controller, Post, Body, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { MusicService } from './music.service';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';

// 추천 요청 DTO (JSON Body)
interface RecommendRequestDto {
  youtubeUrl: string;      // 유튜브 링크
  instrument: string;      // 'drums', 'vocals', 'bass', 'other' 등
  startSec: number;        // 시작 시간 (초)
  endSec: number;          // 종료 시간 (초)
}

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  // 1. 음악 추천 API (핵심 기능)
  // 프론트에서 JSON으로 유튜브 링크, 시간 정보, 악기를 보내면
  // 백엔드에서 히스토리에 저장하고 AI 서버로 전달
  // AI 서버가 유튜브 다운로드, 트리밍, 악기 분리, 유사도 계산 후 추천 결과 반환
  // 로그인 유저는 Authorization 헤더에 Bearer 토큰 포함
  // 비로그인 유저는 토큰 없이 요청 가능 (OptionalJwtAuthGuard 사용)
  @Post('recommend')
  @UseGuards(OptionalJwtAuthGuard)
  async recommendMusic(
    @Body() body: RecommendRequestDto,
    @Request() req: { user?: { id: number; email: string; nickname: string } },
  ) {
    // 필수 파라미터 검증
    if (!body.youtubeUrl) {
      throw new BadRequestException('유튜브 링크(youtubeUrl)가 필요합니다.');
    }

    if (!body.instrument) {
      throw new BadRequestException('악기 이름(instrument)이 필요합니다.');
    }

    // null/undefined 체크 (Number(null) = 0이므로 별도 검증 필요)
    if (body.startSec == null || body.endSec == null) {
      throw new BadRequestException('시작 시간(startSec)과 종료 시간(endSec)이 필요합니다.');
    }

    const startSec = Number(body.startSec);
    const endSec = Number(body.endSec);

    // 숫자가 아닌 값 체크 (예: "abc" → NaN)
    if (isNaN(startSec) || isNaN(endSec)) {
      throw new BadRequestException('시작 시간(startSec)과 종료 시간(endSec)은 숫자여야 합니다.');
    }

    if (startSec < 0 || endSec <= startSec) {
      throw new BadRequestException('유효한 시간 범위가 아닙니다. (startSec < endSec)');
    }

    // JWT 토큰에서 userId 추출 (로그인 유저만 req.user 존재)
    const validUserId = req.user?.id ?? null;

    // 1단계: AI 서버로 데이터 전송하여 추천 받기
    // AI 서버가 유튜브 다운로드, 트리밍, 악기 분리, 유사도 계산 수행
    const aiResults = await this.musicService.getRecommendationsFromAI({
      youtubeUrl: body.youtubeUrl,
      instrument: body.instrument,
      startSec,
      endSec,
    });

    // 2단계: AI 서버 결과를 DB Music 정보와 결합하여 풍부한 정보 제공
    const enrichedResults = await this.musicService.enrichRecommendationsWithMusicInfo(
      aiResults,
    );

    // 3단계: 히스토리 자동 저장 (로그인 유저만)
    if (validUserId) {
      await this.musicService.saveRecommendationHistory({
        userId: validUserId,
        youtubeUrl: body.youtubeUrl,
        instrument: body.instrument,
        startSec,
        endSec,
        recommendedMusic: enrichedResults,
      });
    }

    return {
      status: 'success',
      isLoggedIn: !!validUserId, // 프론트에서 로그인 상태 확인 가능
      historySaved: !!validUserId, // 히스토리 저장 여부
      results: enrichedResults,
    };
  }

  // 2. 음악 등록 API (관리자/테스트 데이터 추가용)
  // Postman으로 { "title": "Dynamite", "artist": "BTS", "youtubeVideoId": "...", ... } 등을 보냄
  @Post('register')
  async registerMusic(@Body() body: any) {
    return await this.musicService.registerMusic(body);
  }
}