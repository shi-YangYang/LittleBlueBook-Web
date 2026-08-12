import { apiRequest } from './api';

export type ReportTargetType = 'NOTE' | 'COMMENT' | 'USER';
export type ReportStatus =
  'PENDING' | 'ACTIONED' | 'DISMISSED' | 'TARGET_UNAVAILABLE';

export type ReportItem = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  result: '处理中' | '已采取措施' | '未发现违规' | '目标已失效';
  createdAt: string;
};

export type ReportPage = { items: ReportItem[]; nextCursor: string | null };

export const REPORT_REASONS = [
  ['SEXUAL', '色情低俗'],
  ['VIOLENCE', '暴力血腥'],
  ['HATE', '仇恨攻击'],
  ['HARASSMENT', '骚扰'],
  ['PERSONAL_ATTACK', '人身攻击'],
  ['SPAM', '垃圾广告'],
  ['INFRINGEMENT', '侵权'],
  ['OTHER', '其他'],
] as const;

export const REPORT_REASON_LABELS = Object.fromEntries(
  REPORT_REASONS,
) as Record<
  (typeof REPORT_REASONS)[number][0],
  (typeof REPORT_REASONS)[number][1]
>;

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  NOTE: '笔记',
  COMMENT: '评论',
  USER: '用户',
};

export function reportReasonLabel(reason: string): string {
  return (
    REPORT_REASON_LABELS[reason as keyof typeof REPORT_REASON_LABELS] ?? '其他'
  );
}

export function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: (typeof REPORT_REASONS)[number][0];
  details?: string;
}) {
  return apiRequest<ReportItem>('/safety/reports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
