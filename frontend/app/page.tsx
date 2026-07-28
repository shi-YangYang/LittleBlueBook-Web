'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Icon } from './_components/icon';
import { NoteFeed } from './_components/note-feed';
import type { PublicChannel, PublicChannelList } from './_lib/channels';
import { lockDocumentScroll } from './_lib/document-scroll-lock';

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

const menuItems = [
  ['discover', '发现'],
  ['video', '视频'],
  ['live', '直播'],
  ['publish', '发布'],
  ['notice', '通知'],
] as const;

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
  const [registrationExpiredNotice, setRegistrationExpiredNotice] =
    useState(false);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsFailed, setChannelsFailed] = useState(false);
  const [channelsReloadVersion, setChannelsReloadVersion] = useState(0);
  const [activeChannelCode, setActiveChannelCode] = useState<string | null>(
    null,
  );
  const [channelUrlReady, setChannelUrlReady] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const loginButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const authStateVersionRef = useRef(0);
  const destinationAfterAuthRef = useRef<string | null>(null);

  const showComingSoon = useCallback(() => {
    setToast('功能开发中');
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const code = new URLSearchParams(window.location.search).get('channel');
      setActiveChannelCode(code);
      setChannelUrlReady(true);
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<PublicChannelList>('/channels')
      .then((result) => {
        if (!active) return;
        setChannels(result.items);
        setChannelsFailed(result.items.length === 0);
      })
      .catch(() => {
        if (!active) return;
        setChannels([]);
        setChannelsFailed(true);
      })
      .finally(() => {
        if (active) setChannelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [channelsReloadVersion]);

  useEffect(() => {
    const sessionRequestVersion = authStateVersionRef.current;
    let active = true;

    void apiRequest<SessionResult>('/auth/session')
      .then((session) => {
        if (!active || authStateVersionRef.current !== sessionRequestVersion) {
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
        if (!active || authStateVersionRef.current !== sessionRequestVersion) {
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
    return lockDocumentScroll();
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
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
  }, [modalOpen, step]);

  const openModal = () => {
    setError(
      registrationExpiredNotice ? '验证状态已失效，请重新获取验证码' : '',
    );
    setRegistrationExpiredNotice(false);
    setModalOpen(true);
  };

  const openPublish = () => {
    if (user) {
      window.location.assign('/publish');
      return;
    }
    destinationAfterAuthRef.current = '/publish';
    openModal();
  };

  const continueAfterAuthentication = () => {
    const destination = destinationAfterAuthRef.current;
    destinationAfterAuthRef.current = null;
    if (destination) {
      window.location.assign(destination);
    }
  };

  const selectChannel = (code: string | null) => {
    const destination = code ? `/?channel=${encodeURIComponent(code)}` : '/';
    window.history.pushState(null, '', destination);
    setActiveChannelCode(code);
  };

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get('login') !== '1') {
      return;
    }

    if (parameters.get('next') === '/publish') {
      destinationAfterAuthRef.current = '/publish';
    }
    window.setTimeout(() => setModalOpen(true), 0);
    parameters.delete('login');
    parameters.delete('next');
    const query = parameters.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setError('');
    destinationAfterAuthRef.current = null;
    window.setTimeout(() => loginButtonRef.current?.focus(), 0);
  }, []);

  const activeChannel =
    activeChannelCode === null
      ? null
      : channels.find((channel) => channel.code === activeChannelCode);
  const invalidChannel =
    channelUrlReady &&
    !channelsLoading &&
    !channelsFailed &&
    activeChannelCode !== null &&
    !activeChannel;

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
        continueAfterAuthentication();
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
      continueAfterAuthentication();
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
              onClick={
                label === '发布'
                  ? openPublish
                  : index === 0
                    ? undefined
                    : showComingSoon
              }
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}

          {user ? (
            <div className="identity-wrap">
              <Link className="identity-button" href="/profile" aria-label="我">
                <span className="identity-avatar" aria-hidden="true">
                  {Array.from(user.nickname)[0]}
                </span>
                <span className="identity-name">我</span>
              </Link>
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
          <button
            type="button"
            className={activeChannelCode === null ? 'selected' : ''}
            aria-current={activeChannelCode === null ? 'page' : undefined}
            onClick={() => selectChannel(null)}
          >
            推荐
          </button>
          {channels.map((channel) => (
            <button
              key={channel.code}
              type="button"
              className={activeChannelCode === channel.code ? 'selected' : ''}
              aria-current={
                activeChannelCode === channel.code ? 'page' : undefined
              }
              onClick={() => selectChannel(channel.code)}
            >
              {channel.name}
            </button>
          ))}
          {channelsLoading ? (
            <span className="channel-nav-status" aria-live="polite">
              正在加载频道…
            </span>
          ) : null}
        </nav>

        {!channelUrlReady || channelsLoading ? (
          <section className="feed-state" aria-busy="true">
            <span>正在加载频道…</span>
          </section>
        ) : channelsFailed ? (
          <section className="feed-state feed-error-state">
            <Icon name="empty" size={46} />
            <p role="alert">频道加载失败，请重试</p>
            <button
              type="button"
              onClick={() => {
                setChannelsLoading(true);
                setChannelsFailed(false);
                setChannelsReloadVersion((value) => value + 1);
              }}
            >
              重试
            </button>
          </section>
        ) : invalidChannel ? (
          <section className="feed-state feed-error-state">
            <Icon name="empty" size={46} />
            <p role="alert">频道不存在或已停用</p>
            <button type="button" onClick={() => selectChannel(null)}>
              返回推荐
            </button>
          </section>
        ) : (
          <NoteFeed
            key={activeChannel?.code ?? 'recommendations'}
            endpoint={
              activeChannel
                ? `/notes/channels/${encodeURIComponent(activeChannel.code)}`
                : '/notes/recommendations'
            }
            label={activeChannel ? `${activeChannel.name}频道内容` : '推荐内容'}
            emptyMessage={
              activeChannel
                ? '该频道还没有笔记'
                : '还没有笔记，发布第一篇内容吧'
            }
            errorMessage={
              activeChannel
                ? '频道内容加载失败，请稍后重试'
                : '推荐内容加载失败，请稍后重试'
            }
            onPublish={activeChannel ? undefined : openPublish}
          />
        )}
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
