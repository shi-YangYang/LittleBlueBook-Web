'use client';

import Image from 'next/image';
import Link from 'next/link';

import type { AuthenticatedUser } from './auth-dialog';
import { Avatar } from './avatar';
import { Icon } from './icon';
import { NotificationNavItem } from './notification-nav-item';
import { SearchTrigger } from './search-dialog';

const menuItems = [
  { icon: 'discover', label: '发现', href: '/' },
  { icon: 'video', label: '视频' },
  { icon: 'live', label: '直播' },
  { icon: 'publish', label: '发布', href: '/publish' },
] as const;

type PageSidebarProps = {
  user: AuthenticatedUser | null;
  active?: 'discover' | 'profile' | 'notifications';
  onLogin: (destination?: string) => void;
  onToast: (message: string) => void;
};

export function PageSidebar({
  user,
  active,
  onLogin,
  onToast,
}: PageSidebarProps) {
  return (
    <aside className="sidebar" aria-label="主菜单">
      <Link className="sidebar-logo" href="/" aria-label="返回首页">
        <Image
          src="/brand/littlebluebook-logo.svg"
          alt="小蓝书"
          width={116}
          height={52}
          priority
        />
      </Link>
      <nav className="primary-nav" aria-label="主要功能">
        {menuItems.map((item) =>
          'href' in item ? (
            item.href === '/publish' ? (
              user ? (
                <a className="nav-item" href="/publish" key={item.label}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </a>
              ) : (
                <button
                  className="nav-item"
                  type="button"
                  key={item.label}
                  onClick={() => onLogin('/publish')}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              )
            ) : (
              <Link
                className={`nav-item ${active === 'discover' ? 'active' : ''}`}
                href={item.href}
                key={item.label}
                aria-current={active === 'discover' ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            )
          ) : (
            <button
              className="nav-item"
              type="button"
              key={item.label}
              onClick={() => onToast('功能开发中')}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ),
        )}
        <NotificationNavItem
          authenticated={Boolean(user)}
          active={active === 'notifications'}
          onLogin={onLogin}
        />
        {user ? (
          <div className="identity-wrap">
            <Link
              className={`identity-button ${active === 'profile' ? 'active' : ''}`}
              href="/profile"
              aria-label="我"
              aria-current={active === 'profile' ? 'page' : undefined}
            >
              <Avatar
                avatar={
                  user.avatar ?? {
                    type: 'initial',
                    value: Array.from(user.nickname.trim())[0] ?? '蓝',
                  }
                }
                className="identity-avatar"
              />
              <span className="identity-name">我</span>
            </Link>
          </div>
        ) : (
          <button
            className="login-entry"
            type="button"
            onClick={() => onLogin()}
          >
            登录
          </button>
        )}
      </nav>
      <nav className="secondary-nav" aria-label="其他功能">
        <button type="button" onClick={() => onToast('功能开发中')}>
          <Icon name="more" />
          <span>更多</span>
        </button>
        <button type="button" onClick={() => onToast('功能开发中')}>
          <Icon name="info" />
          <span>关于我们</span>
        </button>
      </nav>
    </aside>
  );
}

type PageTopbarProps = {
  currentKeyword?: string;
  onToast: (message: string) => void;
  onNavigate?: (path: string, origin: HTMLButtonElement | null) => void;
};

export function PageTopbar({
  currentKeyword,
  onToast,
  onNavigate,
}: PageTopbarProps) {
  return (
    <header className="topbar">
      <SearchTrigger currentKeyword={currentKeyword} onNavigate={onNavigate} />
      <div className="top-actions">
        <button type="button" onClick={() => onToast('功能开发中')}>
          创作中心
        </button>
        <button type="button" onClick={() => onToast('功能开发中')}>
          业务合作
        </button>
      </div>
    </header>
  );
}
