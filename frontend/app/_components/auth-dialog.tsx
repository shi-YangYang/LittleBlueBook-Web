'use client';

import Image from 'next/image';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { lockDocumentScroll } from '../_lib/document-scroll-lock';
import { Icon } from './icon';

export type AuthenticatedUser = {
  id: string;
  email: string;
  nickname: string;
};

type SessionResult = {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  pendingRegistration: boolean;
  registrationExpired: boolean;
};

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthenticatedUser) => void;
  onToast?: (message: string) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

function authenticationError(error: unknown): string {
  if (!(error instanceof Error)) return '网络异常，请稍后重试';
  const payload =
    error instanceof ApiRequestError ? error.payload : ({} as never);
  const remainingAttempts = payload.details?.remainingAttempts;
  switch (payload.code ?? error.message) {
    case 'VERIFICATION_CODE_INVALID':
      return `验证码错误，还可尝试 ${typeof remainingAttempts === 'number' ? remainingAttempts : 0} 次`;
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
      return payload.message ?? '网络异常，请稍后重试';
  }
}

export function AuthDialog({
  open,
  onClose,
  onAuthenticated,
  onToast,
  returnFocusRef,
}: AuthDialogProps) {
  const [step, setStep] = useState<'verify' | 'register'>('verify');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onAuthenticatedRef = useRef(onAuthenticated);

  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  const close = useCallback(() => {
    setError('');
    onClose();
    window.setTimeout(() => returnFocusRef?.current?.focus(), 0);
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    return lockDocumentScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void apiRequest<SessionResult>('/auth/session')
      .then((session) => {
        if (!active) return;
        if (session.authenticated && session.user) {
          onAuthenticatedRef.current(session.user);
          return;
        }
        setStep(session.pendingRegistration ? 'register' : 'verify');
        if (session.registrationExpired) {
          setError('验证状态已失效，请重新获取验证码');
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      const selector =
        step === 'verify' ? '#login-email' : '#register-nickname';
      dialogRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
    }, 0);
  }, [open, step]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [close, open]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
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
          body: JSON.stringify({ email: normalizedEmail, acceptedTerms }),
        },
      );
      setEmail(normalizedEmail);
      onToast?.(result.message || '验证码已发送');
      setCountdown(60);
    } catch (requestError) {
      setError(authenticationError(requestError));
    } finally {
      setSending(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
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
        | { status: 'authenticated'; user: AuthenticatedUser }
        | { status: 'registration_required' }
      >('/auth/email-code/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });
      if (result.status === 'authenticated') {
        onToast?.('登录成功');
        onAuthenticated(result.user);
      } else {
        setStep('register');
        setCode('');
      }
    } catch (verifyError) {
      setError(authenticationError(verifyError));
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
        user: AuthenticatedUser;
      }>('/auth/registration/complete', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
      });
      setEmail('');
      setCode('');
      setNickname('');
      setAcceptedTerms(false);
      setStep('verify');
      onToast?.('注册成功');
      onAuthenticated(result.user);
    } catch (registerError) {
      setError(authenticationError(registerError));
      if (
        registerError instanceof ApiRequestError &&
        registerError.payload.code === 'REGISTRATION_EXPIRED'
      ) {
        setStep('verify');
      }
    } finally {
      setRegistering(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-layer">
      <div className="modal-backdrop" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onKeyDown={handleDialogKeyDown}
      >
        <button
          className="modal-close"
          type="button"
          aria-label="关闭登录弹窗"
          onClick={close}
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
            <form className="auth-form" onSubmit={verify}>
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
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
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
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span>
                  我已阅读并同意
                  <button type="button" onClick={() => onToast?.('功能开发中')}>
                    《用户协议》
                  </button>
                  <button type="button" onClick={() => onToast?.('功能开发中')}>
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
  );
}
