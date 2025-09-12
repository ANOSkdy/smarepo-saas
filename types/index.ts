import { FieldSet } from 'airtable';

// 各テーブルのフィールドの型定義
export interface UserFields extends FieldSet {
  userId: string;
  name: string;
  username: string;
  role: 'admin' | 'user';
  active?: boolean;
}

export interface MachineFields extends FieldSet {
  machineid: string;
  name: string;
  active?: boolean;
}

export interface SiteFields extends FieldSet {
  siteId: string;
  name: string;
  lat: number;
  lon: number;
  client: string;
  active?: boolean;
}

export interface WorkTypeFields extends FieldSet {
  workId: string;
  name: string;
  sortOrder: number;
  active?: boolean;
}

export interface LogFields extends FieldSet {
  timestamp: string; // ISO 8601 string
  date: string; // YYYY-MM-DD
  user: readonly string[]; // Link to Users table (record IDs)
  machine: readonly string[]; // Link to Machines table (record IDs)
  lat?: number;
  lon?: number;
  accuracy?: number;
  positionTimestamp?: number;
  distanceToSite?: number;
  decisionThreshold?: number;
  serverDecision?: 'accepted' | 'needs_review';
  status?: 'accepted' | 'needs_review' | 'rejected';
  siteName?: string;
  workDescription?: string;
  type: 'IN' | 'OUT';
}

export type StampPayload = {
  siteId: string;
  lat: number;
  lon: number;
  accuracy?: number;
  positionTimestamp?: number;
  distanceToSite?: number;
  decisionThreshold?: number;
  clientDecision?: 'auto' | 'blocked';
};

export type StampRecord = {
  id: string;
  siteId: string;
  lat: number;
  lon: number;
  accuracy?: number;
  positionTimestamp?: number;
  distanceToSite?: number;
  decisionThreshold?: number;
  serverDecision?: 'accepted' | 'needs_review';
  status?: 'accepted' | 'needs_review' | 'rejected';
  createdAt: string;
};