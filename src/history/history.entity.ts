import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

export interface RecommendedMusicItem {
  title: string;
  artist: string;
  similarity: number;
  youtubeVideoId?: string;
  albumCoverUrl?: string;
}

@Entity()
export class History {
  @PrimaryGeneratedColumn()
  id: number;

  // [Index 연동] 유저 테이블의 index(id)와 동일한 값을 가짐
  @Column()
  userId: number;

  // 유저 엔티티와 연결 설정 (DB에는 userId로 저장됨)
  @ManyToOne(() => User, (user) => user.histories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' }) // 위에서 만든 userId 컬럼을 외래키로 사용
  user: User;

  // [Date] 분석 날짜
  @CreateDateColumn()
  date: Date;

  // [유저가 첨부한 음원] 파일 경로 또는 URL 저장
  @Column()
  userUploadedAudio: string;

  // [추천된 노래] 추천 결과 리스트를 JSON 형태로 통째로 저장
  // 예: [{ title: 'Dynamite', artist: 'BTS', similarity: 0.98 }, ...]
  @Column('simple-json')
  recommendedMusic: RecommendedMusicItem[]; 
}