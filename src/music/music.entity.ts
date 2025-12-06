import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Music {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column()
  artist: string;

  // 앨범 커버 URL (값이 없으면 iTunes API에서 가져와서 채움)
  @Column({ type: 'varchar', length: 500, nullable: true })
  albumCoverUrl: string | null;

  // 유튜브 영상 ID (예: 'dQw4w9WgXcQ')
  @Column({ type: 'varchar', length: 50, nullable: true })
  youtubeVideoId: string | null;

  // 하이라이트 구간 시작 시간 (초 단위)
  @Column({ type: 'int', default: 0 })
  youtubeStartTime: number;

  // AI가 추출한 128차원 특징 벡터 (JSON 형태로 저장)
  @Column('simple-json', { nullable: true })
  featureVector: number[] | null;
}