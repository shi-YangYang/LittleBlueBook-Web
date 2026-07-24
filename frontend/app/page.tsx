'use client';

import Image from 'next/image';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1';

type User = {
  id: string;
  email: string;
  nickname: string;
};

type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: {
    remainingAttempts?: number;
  };
};

type ModalStep = 'verify' | 'register';

type SessionResult = {
  authenticated: boolean;
  user: User | null;
  pendingRegistration?: boolean;
  registrationPending?: boolean;
  registrationExpired?: boolean;
  pendingEmail?: string | null;
  registration?: {
    email?: string | null;
  } | null;
};

type Card = {
  id: number;
  title: string;
  author: string;
  likes: string;
  cover: string;
  height: number;
  avatarColor: string;
  video?: boolean;
};

const menuItems = [
  ['discover', '发现'],
  ['video', '视频'],
  ['live', '直播'],
  ['publish', '发布'],
  ['notice', '通知'],
] as const;

const channels = [
  '推荐',
  '数码',
  '汽车',
  '游戏',
  '运动',
  '健身',
  '户外',
  '穿搭',
  '美食',
  '职场',
  '情感',
  '家居',
  '旅行',
  '视频',
];

const cards: Card[] = [
  {
    id: 1,
    title: '一套真正适合通勤的轻量装备',
    author: '蓝调生活家',
    likes: '445',
    cover: '/demo/cover-workbench.svg',
    height: 328,
    avatarColor: '#3b82f6',
  },
  {
    id: 2,
    title: '把周末留给山野，城市也可以很近',
    author: '北纬三十度',
    likes: '262',
    cover: '/demo/cover-camping.svg',
    height: 402,
    avatarColor: '#0f766e',
    video: true,
  },
  {
    id: 3,
    title: '机械键盘入门，先看懂这几个参数',
    author: '硬件研究所',
    likes: '315',
    cover: '/demo/cover-keyboard.svg',
    height: 294,
    avatarColor: '#7c3aed',
  },
  {
    id: 4,
    title: '下班后的四十分钟力量训练',
    author: '阿拓练起来',
    likes: '411',
    cover: '/demo/cover-training.svg',
    height: 356,
    avatarColor: '#ea580c',
  },
  {
    id: 5,
    title: '给桌面做一次彻底的收纳升级',
    author: '一平米工作室',
    likes: '2180',
    cover: '/demo/cover-desk.svg',
    height: 318,
    avatarColor: '#0369a1',
  },
  {
    id: 6,
    title: '第一次夜钓，需要准备什么？',
    author: '江边老周',
    likes: '892',
    cover: '/demo/cover-fishing.svg',
    height: 390,
    avatarColor: '#475569',
    video: true,
  },
  {
    id: 7,
    title: '家常牛肉面，汤底这样做更醇厚',
    author: '认真吃饭',
    likes: '763',
    cover: '/demo/cover-noodles.svg',
    height: 302,
    avatarColor: '#b45309',
  },
  {
    id: 8,
    title: '独处时最舒服的客厅灯光',
    author: '住进理想里',
    likes: '507',
    cover: '/demo/cover-livingroom.svg',
    height: 368,
    avatarColor: '#4f46e5',
  },
  {
    id: 9,
    title: '公路车新手的第一条百公里路线',
    author: '顺风骑行',
    likes: '634',
    cover: '/demo/cover-bike.svg',
    height: 340,
    avatarColor: '#15803d',
    video: true,
  },
  {
    id: 10,
    title: '旧相机也能拍出有质感的街头夜景',
    author: '慢快门',
    likes: '1196',
    cover: '/demo/cover-camera.svg',
    height: 408,
    avatarColor: '#be123c',
  },
];

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  const paths: Record<string, React.ReactNode> = {
    discover: (
      <>
        <path d="M3.5 10.8 12 4l8.5 6.8v7.7a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
        <path d="M9.5 15h5" />
      </>
    ),
    video: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4z" />
      </>
    ),
    live: (
      <>
        <rect x="3" y="6" width="14" height="12" rx="3" />
        <path d="m17 10 4-2v8l-4-2" />
        <circle cx="9" cy="12" r="2" />
      </>
    ),
    publish: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    notice: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8" />
        <path d="M10 20h4" />
      </>
    ),
    more: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16.5 16.5 4 4" />
      </>
    ),
    heart: (
      <path d="M20.8 5.7a5.4 5.4 0 0 0-7.7 0L12 6.8l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.7z" />
    ),
    close: (
      <>
        <path d="m5 5 14 14M19 5 5 19" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6z" />
        <path d="m9.5 12 1.7 1.7 3.6-3.7" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }

  const payload = (await response.json().catch(() => ({}))) as
    ({ data?: T } & Record<string, unknown>) | ApiErrorPayload;

  if (!response.ok) {
    const apiError = payload as ApiErrorPayload;
    const error = new Error(apiError.code ?? 'UNKNOWN_ERROR') as Error & {
      payload?: ApiErrorPayload;
    };
    error.payload = apiError;
    throw error;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    payload.data !== undefined
  ) {
    return payload.data;
  }

  return payload as T;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '网络异常，请稍后重试';
  }

  const payload = (error as Error & { payload?: ApiErrorPayload }).payload;
  const remainingAttempts = payload?.details?.remainingAttempts;

  switch (error.message) {
    case 'VERIFICATION_CODE_INVALID':
      return `验证码错误，还可尝试 ${remainingAttempts ?? 0} 次`;
    case 'VERIFICATION_CODE_EXPIRED':
      return '验证码已失效，请重新获取';
    case 'REGISTRATION_EXPIRED':
      return '验证状态已失效，请重新获取验证码';
    case 'RATE_LIMITED':
      return '操作过于频繁，请稍后再试';
    case 'EMAIL_SEND_FAILED':
      return '验证码发送失败，请稍后重试';
    case 'NETWORK_ERROR':
      return '网络异常，请稍后重试';
    default:
      return payload?.message ?? '网络异常，请稍后重试';
  }
}

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>('verify');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [identityMenuOpen, setIdentityMenuOpen] = useState(false);
  const [registrationExpiredNotice, setRegistrationExpiredNotice] =
    useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const loginButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const authStateVersionRef = useRef(0);

  const showComingSoon = useCallback(() => {
    setToast('功能开发中');
  }, []);

  useEffect(() => {
    const sessionRequestVersion = authStateVersionRef.current;
    let active = true;

    void apiRequest<SessionResult>('/auth/session')
      .then((session) => {
        if (
          !active ||
          authStateVersionRef.current !== sessionRequestVersion
        ) {
          return;
        }
        setUser(session.authenticated ? session.user : null);
        if (session.registrationExpired) {
          setStep('verify');
          setRegistrationExpiredNotice(true);
          setError('验证状态已失效，请重新获取验证码');
          return;
        }
        const registrationPending =
          session.pendingRegistration ?? session.registrationPending ?? false;
        setStep(registrationPending ? 'register' : 'verify');
        const pendingEmail =
          session.pendingEmail ?? session.registration?.email ?? null;
        if (registrationPending && pendingEmail) {
          setEmail(pendingEmail);
        }
      })
      .catch(() => {
        if (
          !active ||
          authStateVersionRef.current !== sessionRequestVersion
        ) {
          return;
        }
        setUser(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      if (step === 'verify') {
        const emailInput =
          modalRef.current?.querySelector<HTMLInputElement>('#login-email');
        emailInput?.focus();
      } else {
        const nicknameInput =
          modalRef.current?.querySelector<HTMLInputElement>(
            '#register-nickname',
          );
        nicknameInput?.focus();
      }
    }, 0);
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen, step]);

  const openModal = () => {
    setError(
      registrationExpiredNotice
        ? '验证状态已失效，请重新获取验证码'
        : '',
    );
    setRegistrationExpiredNotice(false);
    setModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setError('');
    window.setTimeout(() => loginButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeModal, modalOpen]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab' || !modalRef.current) return;

    const focusable = Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const requestCode = async () => {
    setError('');
    if (!acceptedTerms) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (sending || countdown > 0) return;

    setSending(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await apiRequest<{ message: string }>(
        '/auth/email-code/request',
        {
          method: 'POST',
          body: JSON.stringify({
            email: normalizedEmail,
            acceptedTerms,
          }),
        },
      );
      setEmail(normalizedEmail);
      setToast(result.message || '验证码已发送');
      setCountdown(60);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!acceptedTerms) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('验证码已失效，请重新获取');
      return;
    }
    if (verifying) return;

    setVerifying(true);
    try {
      const result = await apiRequest<
        | { status: 'authenticated'; user: User }
        | { status: 'registration_required' }
      >('/auth/email-code/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      if (result.status === 'authenticated') {
        authStateVersionRef.current += 1;
        setUser(result.user);
        setModalOpen(false);
        setToast('登录成功');
      } else {
        authStateVersionRef.current += 1;
        setError('');
        setStep('register');
        setCode('');
      }
    } catch (verifyError) {
      setError(getErrorMessage(verifyError));
    } finally {
      setVerifying(false);
    }
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^[\u4e00-\u9fffA-Za-z0-9_]{2,20}$/.test(nickname)) {
      setError('昵称需为2～20个中文、字母、数字或下划线');
      return;
    }
    if (registering) return;

    setRegistering(true);
    try {
      const result = await apiRequest<{
        status: 'authenticated';
        user: User;
      }>('/auth/registration/complete', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
      });
      authStateVersionRef.current += 1;
      setUser(result.user);
      setModalOpen(false);
      setToast('注册成功');
      setEmail('');
      setNickname('');
      setAcceptedTerms(false);
      setStep('verify');
    } catch (registerError) {
      const message = getErrorMessage(registerError);
      setError(message);
      if (
        registerError instanceof Error &&
        registerError.message === 'REGISTRATION_EXPIRED'
      ) {
        setStep('verify');
      }
    } finally {
      setRegistering(false);
    }
  };

  const logout = async () => {
    try {
      await apiRequest<{ success: true }>('/auth/logout', {
        method: 'POST',
      });
      authStateVersionRef.current += 1;
      setUser(null);
      setIdentityMenuOpen(false);
      setToast('已退出登录');
    } catch (logoutError) {
      setToast(getErrorMessage(logoutError));
    }
  };

  return (
    <div className="home-shell">
      <aside className="sidebar" aria-label="主菜单">
        <div className="sidebar-logo">
          <Image
            src="/brand/littlebluebook-logo.svg"
            alt="小蓝书"
            width={116}
            height={52}
            priority
          />
        </div>

        <nav className="primary-nav" aria-label="主要功能">
          {menuItems.map(([icon, label], index) => (
            <button
              className={`nav-item ${index === 0 ? 'active' : ''}`}
              key={label}
              type="button"
              onClick={showComingSoon}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}

          {user ? (
            <div className="identity-wrap">
              <button
                className="identity-button"
                type="button"
                aria-expanded={identityMenuOpen}
                onClick={() => setIdentityMenuOpen((open) => !open)}
              >
                <span className="identity-avatar" aria-hidden="true">
                  {Array.from(user.nickname)[0]}
                </span>
                <span className="identity-name">{user.nickname}</span>
              </button>
              {identityMenuOpen ? (
                <div className="identity-menu" role="menu">
                  <button type="button" role="menuitem" onClick={logout}>
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              ref={loginButtonRef}
              className="login-entry"
              type="button"
              onClick={openModal}
            >
              登录
            </button>
          )}
        </nav>

        <nav className="secondary-nav" aria-label="其他功能">
          <button type="button" onClick={showComingSoon}>
            <Icon name="more" />
            <span>更多</span>
          </button>
          <button type="button" onClick={showComingSoon}>
            <Icon name="info" />
            <span>关于我们</span>
          </button>
        </nav>
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <button
            className="search-box"
            type="button"
            onClick={showComingSoon}
            aria-label="搜索，登录探索更多内容"
          >
            <span>登录探索更多内容</span>
            <Icon name="search" size={23} />
          </button>
          <div className="top-actions">
            <button type="button" onClick={showComingSoon}>
              创作中心
            </button>
            <button type="button" onClick={showComingSoon}>
              业务合作
            </button>
          </div>
        </header>

        <nav className="channel-nav" aria-label="内容频道">
          {channels.map((channel, index) => (
            <button
              key={channel}
              type="button"
              className={index === 0 ? 'selected' : ''}
              onClick={showComingSoon}
            >
              {channel}
            </button>
          ))}
        </nav>

        <section
          className="feed-grid"
          data-testid="feed-grid"
          aria-label="推荐内容"
        >
          {cards.map((card) => (
            <article className="note-card" key={card.id}>
              <button
                className="card-action"
                type="button"
                onClick={showComingSoon}
                aria-label={`查看内容：${card.title}`}
              >
                <span className="cover-wrap" style={{ height: card.height }}>
                  <Image
                    src={card.cover}
                    alt=""
                    fill
                    sizes="(min-width: 1920px) 18vw, (min-width: 1440px) 22vw, 29vw"
                  />
                  {card.video ? (
                    <span className="video-badge" aria-label="视频内容">
                      <span />
                    </span>
                  ) : null}
                </span>
                <span className="card-title">{card.title}</span>
                <span className="card-meta">
                  <span className="author">
                    <span
                      className="author-avatar"
                      style={{ background: card.avatarColor }}
                      aria-hidden="true"
                    >
                      {Array.from(card.author)[0]}
                    </span>
                    <span>{card.author}</span>
                  </span>
                  <span className="likes">
                    <Icon name="heart" size={17} />
                    {card.likes}
                  </span>
                </span>
              </button>
            </article>
          ))}
        </section>
      </main>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {modalOpen ? (
        <div className="modal-layer">
          <div className="modal-backdrop" aria-hidden="true" />
          <div
            ref={modalRef}
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onKeyDown={handleDialogKeyDown}
          >
            <button
              ref={closeButtonRef}
              className="modal-close"
              type="button"
              aria-label="关闭登录弹窗"
              onClick={closeModal}
            >
              <Icon name="close" size={25} />
            </button>

            <section className="brand-panel" aria-label="小蓝书品牌介绍">
              <p className="brand-message">登录后，发现更懂你的内容</p>
              <Image
                className="modal-logo"
                src="/brand/littlebluebook-logo.svg"
                alt="小蓝书"
                width={164}
                height={74}
              />
              <div className="brand-illustration" aria-hidden="true">
                <span className="illustration-card card-one">
                  <Icon name="mail" size={34} />
                </span>
                <span className="illustration-card card-two">
                  <Icon name="shield" size={38} />
                </span>
                <span className="illustration-orbit" />
                <span className="illustration-dot dot-one" />
                <span className="illustration-dot dot-two" />
              </div>
              <p className="brand-subline">邮箱验证 · 安全登录 · 即刻探索</p>
            </section>

            <section className="auth-panel">
              {step === 'verify' ? (
                <form className="auth-form" onSubmit={verifyCode}>
                  <h1 id="auth-title">邮箱登录</h1>
                  <label className="sr-only" htmlFor="login-email">
                    邮箱
                  </label>
                  <div className="field">
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      placeholder="输入邮箱"
                      aria-label="邮箱"
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={sending || verifying}
                    />
                  </div>
                  <div className="field code-field">
                    <label className="sr-only" htmlFor="login-code">
                      验证码
                    </label>
                    <input
                      id="login-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      placeholder="输入验证码"
                      aria-label="验证码"
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, '').slice(0, 6),
                        )
                      }
                      disabled={verifying}
                    />
                    <button
                      type="button"
                      className="send-code"
                      disabled={sending || countdown > 0}
                      onClick={requestCode}
                    >
                      {sending
                        ? '发送中…'
                        : countdown > 0
                          ? `${countdown}秒后重发`
                          : '获取验证码'}
                    </button>
                  </div>

                  {error ? (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  ) : (
                    <div className="error-placeholder" />
                  )}

                  <button
                    className="primary-action"
                    type="submit"
                    disabled={verifying}
                    aria-busy={verifying}
                  >
                    {verifying ? '验证中…' : '登录/注册'}
                  </button>

                  <label className="agreement">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      aria-label="同意用户协议与隐私政策"
                      disabled={sending || verifying}
                      onChange={(event) =>
                        setAcceptedTerms(event.target.checked)
                      }
                    />
                    <span>
                      我已阅读并同意
                      <button type="button" onClick={showComingSoon}>
                        《用户协议》
                      </button>
                      <button type="button" onClick={showComingSoon}>
                        《隐私政策》
                      </button>
                    </span>
                  </label>
                  <p className="register-hint">未注册邮箱验证后将创建账号</p>
                </form>
              ) : (
                <form className="auth-form register-form" onSubmit={register}>
                  <h1 id="auth-title">完善资料</h1>
                  <p className="register-intro">
                    邮箱验证成功，再设置一个大家认识你的昵称。
                  </p>
                  <label className="sr-only" htmlFor="register-nickname">
                    昵称
                  </label>
                  <div className="field">
                    <input
                      id="register-nickname"
                      value={nickname}
                      maxLength={20}
                      autoComplete="nickname"
                      placeholder="设置昵称"
                      aria-label="昵称"
                      onChange={(event) => setNickname(event.target.value)}
                    />
                  </div>
                  {error ? (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  ) : (
                    <div className="error-placeholder register-error" />
                  )}
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={registering}
                    aria-busy={registering}
                  >
                    {registering ? '注册中…' : '完成注册'}
                  </button>
                  {email ? (
                    <p className="verified-email">
                      已验证邮箱：{email.trim().toLowerCase()}
                    </p>
                  ) : null}
                </form>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
