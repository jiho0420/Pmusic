import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { History } from '../history/history.entity';

@Entity('Users')  // 기존 DB 테이블명과 일치
export class User {
  // [Index] 유저 고유 번호 (1, 2, 3...)
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  nickname: string;

  @CreateDateColumn()
  createdAt: Date;

  // 유저 1명이 여러 개의 히스토리를 가질 수 있음 (1:N 관계)
  @OneToMany(() => History, (history) => history.user)
  histories: History[];
}