import { Injectable, HttpException, HttpStatus, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Music } from './music.entity';
import { HistoryService } from '../history/history.service';

@Injectable()
export class MusicService {
  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Music)
    private readonly musicRepository: Repository<Music>,
    @Inject(forwardRef(() => HistoryService))
    private readonly historyService: HistoryService,
  ) {}

  // 사설 클라우드 AI 서버 주소 (환경변수)
  private readonly AI_SERVER_URL = process.env.AI_SERVER_URL;

  // iTunes API 캐싱 (메모리 캐시, TTL: 1시간)
  private readonly albumCoverCache = new Map<string, { url: string; expiry: number }>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1시간

  // --- [기능 1] AI 서버로부터 유사한 음악 추천 받기 ---
  // AI 서버에 유튜브 URL, 악기, 시간 정보를 JSON으로 전송
  // AI 서버가 유튜브 다운로드, 트리밍, 악기 분리, 유사도 계산 수행
  async getRecommendationsFromAI(params: {
    youtubeUrl: string;
    instrument: string;
    startSec: number;
    endSec: number;
  }): Promise<any[]> {
    // 필수 파라미터 검증
    if (!params.youtubeUrl) {
      throw new BadRequestException('유튜브 URL이 필요합니다.');
    }

    try {
      // AI 서버의 추천 API 호출 (JSON POST)
      // 입력: youtube_url, instrument, start_sec, end_sec
      // 출력: 유사한 음악 리스트 top_k = 5
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.AI_SERVER_URL}/recommend`,
          {
            youtube_url: params.youtubeUrl,
            instrument: params.instrument,
            start_sec: params.startSec,
            end_sec: params.endSec,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000, // 120초 타임아웃 (AI 처리 시간 고려)
          },
        ),
      );
      
      // AI 서버 응답 형식: { "status": "success", "results": [...] }
      if (response.data.status === 'success' && response.data.results) {
        return response.data.results;
      }
      
      throw new Error('AI 서버 응답 형식이 올바르지 않습니다.');
    } catch (error) {
      console.error('AI 서버 추천 실패:', error.message);
      throw new HttpException(
        `AI 서버 추천 실패: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // --- [기능 2] AI 서버 추천 결과를 DB Music 정보와 결합 ---
  // AI 서버는 similarity를 직접 반환 (코사인 유사도, 0~1)
  async enrichRecommendationsWithMusicInfo(aiResults: any[]): Promise<any[]> {
    const enrichedResults: any[] = [];

    for (const result of aiResults) {
      // AI 서버가 반환한 song_name으로 DB에서 음악 정보 조회
      // song_name 형식이 "제목 - 아티스트" 또는 "제목"일 수 있음
      const songName = result.song_name || '';
      const [title, artist] = songName.split(' - ').map((s: string) => s.trim());

      const similarity = result.similarity ?? (result.distance ? 1 - result.distance : 0);

      let musicInfo: Music | null = null;
      if (title) {
        // 제목으로 검색
        musicInfo = await this.musicRepository.findOne({
          where: { title },
        });
        
        // 제목만으로 못 찾으면 아티스트도 함께 검색
        if (!musicInfo && artist) {
          musicInfo = await this.musicRepository.findOne({
            where: { title, artist },
          });
        }
      }

      // 공통 기본 정보
      const baseResult = {
        id: result.id,
        similarity, // AI 서버에서 직접 받은 유사도 사용
        songName: result.song_name,
        instrument: result.instrument,
        startSec: result.start_sec,
        endSec: result.end_sec,
      };

      // DB에 없는 경우 iTunes API로 정보 가져오기 (캐싱 적용)
      if (!musicInfo && title) {
        const albumCoverUrl = await this.fetchAlbumCoverFromItunes(title, artist || '');
        
        enrichedResults.push({
          ...baseResult,
          title,
          artist: artist || 'Unknown',
          albumCoverUrl,
          youtubeVideoId: null,
        });
      } else if (musicInfo) {
        // DB에 있는 경우 기존 정보 사용
        enrichedResults.push({
          ...baseResult,
          title: musicInfo.title,
          artist: musicInfo.artist,
          albumCoverUrl: musicInfo.albumCoverUrl || '',
          youtubeVideoId: musicInfo.youtubeVideoId,
          youtubeStartTime: musicInfo.youtubeStartTime,
        });
      } else {
        // 정보를 찾을 수 없는 경우 기본 정보만 반환
        enrichedResults.push({
          ...baseResult,
          title: songName,
          artist: 'Unknown',
        });
      }
    }

    return enrichedResults;
  }

  // [보조] iTunes Search API + 메모리 캐싱
  async fetchAlbumCoverFromItunes(title: string, artist: string): Promise<string> {
    const cacheKey = `${title}|${artist}`.toLowerCase();
    
    // 캐시에서 먼저 확인
    const cached = this.albumCoverCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.url;
    }

    try {
      const term = encodeURIComponent(`${title} ${artist}`);
      const url = `https://itunes.apple.com/search?term=${term}&media=music&limit=1`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 5000 }), // 타임아웃 추가
      );
      
      let albumCoverUrl = '';
      if (response.data.resultCount > 0) {
        // 100x100 저화질을 600x600 고화질로 변환
        albumCoverUrl = response.data.results[0].artworkUrl100.replace('100x100', '600x600');
      }

      // 캐시에 저장 (결과가 없어도 캐싱하여 반복 호출 방지)
      this.albumCoverCache.set(cacheKey, {
        url: albumCoverUrl,
        expiry: Date.now() + this.CACHE_TTL,
      });

      return albumCoverUrl;
    } catch (e) {
      console.error('iTunes API Error:', e.message);
      return '';
    }
  }

  // [보조] 코사인 유사도 수학 공식
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return magA && magB ? dotProduct / (magA * magB) : 0;
  }

  // [보조] 음악 데이터 등록
  async registerMusic(data: Partial<Music>) {
    if (!data.title) {
      throw new BadRequestException('제목은 필수입니다.');
    }
    return this.musicRepository.save(data);
  }

  // [보조] 추천 히스토리 저장
  // 유튜브 URL과 분석 정보를 기록
  async saveRecommendationHistory(params: {
    userId: number;
    youtubeUrl: string;
    instrument: string;
    startSec: number;
    endSec: number;
    recommendedMusic: any[];
  }) {
    return this.historyService.createHistory({
      userId: params.userId,
      youtubeUrl: params.youtubeUrl,
      instrument: params.instrument,
      startSec: params.startSec,
      endSec: params.endSec,
      recommendedMusic: params.recommendedMusic,
    });
  }
}