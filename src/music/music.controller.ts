import { Controller, Post, Body, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { MusicService } from './music.service';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';

// 추천 요청 DTO (JSON Body)
interface RecommendRequestDto {
  youtubeUrl: string;      // 유튜브 링크
  instrument: string[];    // 'drums', 'vocals', 'bass', 'other' 등 (배열로 여러 개 가능)
  startSec: number;        // 시작 시간 (초)
  endSec: number;          // 종료 시간 (초)
  topK?: number;           // 추천 곡 개수 (선택, 기본값 5)
}

// 유효한 악기 종류 목록
const VALID_INSTRUMENTS = ['drums', 'vocals', 'bass', 'other', 'piano', 'guitar'] as const;

// YouTube URL 검증 정규식 (다양한 유튜브 URL 형식 지원)
// - watch?v=, embed/, shorts/, youtu.be/ 형식 지원
// - 비디오 ID 이후 쿼리 파라미터(&t=30, &list=... 등) 허용
// - $ 앵커로 URL 끝 검증 (악의적 문자 삽입 방지)
const YOUTUBE_URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+([?&][\w=&%-]*)?$/;

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

    // YouTube URL 형식 검증
    if (!YOUTUBE_URL_REGEX.test(body.youtubeUrl)) {
      throw new BadRequestException('유효한 유튜브 링크 형식이 아닙니다.');
    }

    if (!body.instrument || !Array.isArray(body.instrument) || body.instrument.length === 0) {
      throw new BadRequestException('악기 이름 배열(instrument)이 필요합니다. 최소 1개 이상의 악기를 선택하세요.');
    }

    // 유효한 악기 종류인지 검증 (모든 악기에 대해)
    const instrument = body.instrument.map((inst: string) => inst.toLowerCase());
    for (const inst of instrument) {
      if (!VALID_INSTRUMENTS.includes(inst as any)) {
        throw new BadRequestException(
          `유효하지 않은 악기입니다: ${inst}. 사용 가능: ${VALID_INSTRUMENTS.join(', ')}`,
        );
      }
    }

    // topK 검증 (선택적, 기본값 5, 정수만 허용)
    const topK = body.topK != null ? Number(body.topK) : 5;
    if (isNaN(topK) || !Number.isInteger(topK) || topK < 1 || topK > 50) {
      throw new BadRequestException('추천 곡 개수(topK)는 1 이상 50 이하의 정수여야 합니다.');
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
      throw new BadRequestException('유효한 시간 범위가 아닙니다. (startSec >= 0, startSec < endSec)');
    }

    // 최대 구간 길이 제한 (AI 서버 부하 방지, 최대 5분)
    const MAX_DURATION_SEC = 300;
    if (endSec - startSec > MAX_DURATION_SEC) {
      throw new BadRequestException(`분석 구간은 최대 ${MAX_DURATION_SEC}초(5분)까지 가능합니다.`);
    }

    // JWT 토큰에서 userId 추출 (로그인 유저만 req.user 존재)
    const validUserId = req.user?.id ?? null;

    // 1단계: AI 서버로 데이터 전송하여 추천 받기
    // AI 서버가 유튜브 다운로드, 트리밍, 악기 분리, 유사도 계산 수행
    const aiResults = await this.musicService.getRecommendationsFromAI({
      youtubeUrl: body.youtubeUrl,
      instrument, // 정규화된 소문자 악기명 배열 사용
      startSec,
      endSec,
      topK,
    });

    // 2단계: AI 서버 결과를 DB Music 정보와 결합하여 풍부한 정보 제공
    // 원본 요청의 startSec, endSec, instrument를 fallback으로 전달 (AI가 정보를 안 주는 경우 대비)
    const enrichedResults = await this.musicService.enrichRecommendationsWithMusicInfo(
      aiResults,
      { startSec, endSec, instrument },
    );

    // 3단계: 히스토리 자동 저장 (로그인 유저만)
    if (validUserId) {
      await this.musicService.saveRecommendationHistory({
        userId: validUserId,
        youtubeUrl: body.youtubeUrl,
        instrument, // 정규화된 소문자 악기명 배열 사용
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