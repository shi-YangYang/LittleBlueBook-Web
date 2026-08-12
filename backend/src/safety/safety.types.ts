import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type ReportTargetTypeValue = 'NOTE' | 'COMMENT' | 'USER';
export type ReportStatusValue =
  'PENDING' | 'ACTIONED' | 'DISMISSED' | 'TARGET_UNAVAILABLE';

export type ReportItem = {
  id: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatusValue;
  result: '处理中' | '已采取措施' | '未发现违规' | '目标已失效';
  createdAt: string;
};

export type ReportPage = { items: ReportItem[]; nextCursor: string | null };

export type BlockedUserPage = {
  items: Array<{
    id: string;
    nickname: string;
    littleBlueBookId: string;
    avatar: ProfileAvatar;
    blockedAt: string;
  }>;
  nextCursor: string | null;
};

export type AdminReportPage = {
  items: Array<
    ReportItem & {
      reporter: {
        id: string;
        nickname: string;
        littleBlueBookId: string;
        avatar: ProfileAvatar;
      };
      target: {
        available: boolean;
        label: string | null;
        state: string;
      };
    }
  >;
  nextCursor: string | null;
};
