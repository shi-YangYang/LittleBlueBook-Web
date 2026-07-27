'use client';

import Image from 'next/image';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { lockDocumentScroll } from '../_lib/document-scroll-lock';
import { Icon } from './icon';

type AuthenticatedUser = {
  id: string;
  email: string;
  nickname: string;
};

type ReauthDialogProps = {
  open: boolean;
  onAuthenticated: (user: AuthenticatedUser) => void;
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.message === 'VERIFICATION_CODE_INVALID') {
      const attempts = error.payload.details?.remainingAttempts;
      return `验证码错误，还可尝试 ${typeof attempts === 'number' ? attempts : 0} 次`;
    }
    if (error.message === 'VERIFICATION_CODE_EXPIRED') {
      return '验证码已失效，请重新获取';
    }
    if (error.message === 'REGISTRATION_EXPIRED') {
      return '验证状态已失效，请重新获取验证码';
    }
    if (error.message === 'RATE_LIMITED') {
      return '操作过于频繁，请稍后再试';
    }
    return error.payload.message ?? '网络异常，请稍后重试';
  }
  return '网络异常，请稍后重试';
}

export function ReauthDialog({ open, onAuthenticated }: ReauthDialogProps) {
  const [step, setStep] = useState<'verify' | 'register'>('verify');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    return lockDocumentScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>(
          step === 'verify' ? '#reauth-email' : '#reauth-nickname',
        )
        ?.focus();
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

  if (!open) return null;

  const requestCode = async () => {
    setError('');
    setMessage('');
    if (!acceptedTerms) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (busy || countdown > 0) return;
    setBusy(true);
    try {
      await apiRequest('/auth/email-code/request', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          acceptedTerms: true,
        }),
      });
      setCountdown(60);
      setMessage('验证码已发送');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!acceptedTerms) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('验证码已失效，请重新获取');
      return;
    }
    if (busy) return;
    setBusy(true);
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
      if (result.status === 'registration_required') {
        setCode('');
        setStep('register');
      } else {
        onAuthenticated(result.user);
      }
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setBusy(false);
    }
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^[\u4e00-\u9fffA-Za-z0-9_]{2,20}$/.test(nickname)) {
      setError('昵称需为2～20个中文、字母、数字或下划线');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiRequest<{
        status: 'authenticated';
        user: AuthenticatedUser;
      }>('/auth/registration/complete', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
      });
      onAuthenticated(result.user);
    } catch (registerError) {
      setError(errorMessage(registerError));
      if (
        registerError instanceof ApiRequestError &&
        registerError.message === 'REGISTRATION_EXPIRED'
      ) {
        setStep('verify');
      }
    } finally {
      setBusy(false);
    }
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  return (
    <div className="modal-layer">
      <div className="modal-backdrop" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
        onKeyDown={trapFocus}
      >
        <section className="brand-panel" aria-label="小蓝书品牌介绍">
          <p className="brand-message">登录后继续发布你的笔记</p>
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
          </div>
          <p className="brand-subline">当前内容会保留，登录后可继续发布</p>
        </section>
        <section className="auth-panel">
          {step === 'verify' ? (
            <form className="auth-form" onSubmit={verify}>
              <h1 id="reauth-title">邮箱登录</h1>
              <div className="field">
                <input
                  id="reauth-email"
                  type="email"
                  value={email}
                  placeholder="输入邮箱"
                  aria-label="邮箱"
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="field code-field">
                <input
                  aria-label="验证码"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  placeholder="输入验证码"
                  disabled={busy}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                />
                <button
                  type="button"
                  className="send-code"
                  disabled={busy || countdown > 0}
                  onClick={requestCode}
                >
                  {busy
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
              ) : message ? (
                <p className="form-success" role="status">
                  {message}
                </p>
              ) : (
                <div className="error-placeholder" />
              )}
              <button className="primary-action" type="submit" disabled={busy}>
                {busy ? '验证中…' : '登录/注册'}
              </button>
              <label className="agreement">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  aria-label="同意用户协议与隐私政策"
                  disabled={busy}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span>我已阅读并同意《用户协议》《隐私政策》</span>
              </label>
            </form>
          ) : (
            <form className="auth-form register-form" onSubmit={register}>
              <h1 id="reauth-title">完善资料</h1>
              <p className="register-intro">
                邮箱验证成功，再设置一个大家认识你的昵称。
              </p>
              <div className="field">
                <input
                  id="reauth-nickname"
                  value={nickname}
                  maxLength={20}
                  placeholder="设置昵称"
                  aria-label="昵称"
                  disabled={busy}
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
              <button className="primary-action" type="submit" disabled={busy}>
                {busy ? '注册中…' : '完成注册'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
