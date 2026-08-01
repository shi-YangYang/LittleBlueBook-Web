/* eslint-disable @next/next/no-img-element */
'use client';

import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AuthDialog,
  type AuthenticatedUser,
} from '../../_components/auth-dialog';
import { Avatar, type ProfileAvatar } from '../../_components/avatar';
import { PageSidebar, PageTopbar } from '../../_components/page-chrome';
import { apiRequest, ApiRequestError } from '../../_lib/api';
import { ProfileDatePicker } from './profile-date-picker';

type EditableGender = 'MALE' | 'FEMALE' | 'PRIVATE';
type AvatarAction = 'keep' | 'replace' | 'delete';

type ProfileSettings = {
  nickname: string;
  littleBlueBookId: string;
  email: string;
  gender: EditableGender;
  birthDate: string | null;
  showAge: boolean;
  bio: string | null;
  avatar: ProfileAvatar;
  profileVersion: string;
};

type ProfileForm = {
  nickname: string;
  gender: EditableGender;
  birthDate: string;
  showAge: boolean;
  bio: string;
};

type CropState = {
  file: File;
  sourceUrl: string;
  width: number;
  height: number;
  left: number;
  top: number;
  size: number;
};

type ConfirmNavigation = { type: 'path'; path: string } | { type: 'back' };

const MINIMUM_SKELETON_MS = 300;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const EDITABLE_PROFILE_FIELDS = [
  'nickname',
  'gender',
  'birthDate',
  'showAge',
  'bio',
] as const satisfies readonly (keyof ProfileForm)[];

function errorField(error: ApiRequestError): keyof ProfileForm | null {
  const directField = error.payload.details?.field;
  if (
    typeof directField === 'string' &&
    EDITABLE_PROFILE_FIELDS.some((field) => field === directField)
  ) {
    return directField as keyof ProfileForm;
  }

  const validationFields = error.payload.details?.fields;
  if (Array.isArray(validationFields)) {
    const field = validationFields.find(
      (candidate): candidate is keyof ProfileForm =>
        typeof candidate === 'string' &&
        EDITABLE_PROFILE_FIELDS.some(
          (editableField) => editableField === candidate,
        ),
    );
    return field ?? null;
  }

  return null;
}

function toForm(settings: ProfileSettings): ProfileForm {
  return {
    nickname: settings.nickname,
    gender: settings.gender,
    birthDate: settings.birthDate ?? '',
    showAge: settings.showAge,
    bio: settings.bio ?? '',
  };
}

function sameForm(left: ProfileForm, right: ProfileForm): boolean {
  return (
    left.nickname === right.nickname &&
    left.gender === right.gender &&
    left.birthDate === right.birthDate &&
    left.showAge === right.showAge &&
    left.bio === right.bio
  );
}

function initialAvatar(nickname: string): ProfileAvatar {
  return {
    type: 'initial',
    value: Array.from(nickname.trim())[0] ?? '蓝',
  };
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const replaceRoute = router.replace;
  const [sessionUser, setSessionUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [baseline, setBaseline] = useState<ProfileForm | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldError, setFieldError] = useState<{
    field: keyof ProfileForm;
    message: string;
  } | null>(null);
  const [toast, setToast] = useState('');
  const [avatarAction, setAvatarAction] = useState<AvatarAction>('keep');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<{
    left: number;
    top: number;
    size: number;
  } | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [cropError, setCropError] = useState('');
  const [confirmNavigation, setConfirmNavigation] =
    useState<ConfirmNavigation | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropDialogRef = useRef<HTMLDivElement>(null);
  const cropConfirmRef = useRef<HTMLButtonElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(false);
  const restoringHistoryRef = useRef(false);
  const navigationOriginRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);

  const dirty = Boolean(
    form && baseline && (!sameForm(form, baseline) || avatarAction !== 'keep'),
  );

  function closeCrop() {
    setCrop((current) => {
      if (current) URL.revokeObjectURL(current.sourceUrl);
      return null;
    });
    setCropError('');
    window.setTimeout(() => fileInputRef.current?.focus(), 0);
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const startedAt = Date.now();
    const waitForStableSkeleton = async () => {
      const remaining = MINIMUM_SKELETON_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
    };
    void Promise.all([
      apiRequest<ProfileSettings>('/profile/me/settings', {
        signal: controller.signal,
      }),
      apiRequest<{
        authenticated: boolean;
        user: AuthenticatedUser | null;
      }>('/auth/session', { signal: controller.signal }),
    ])
      .then(async ([nextSettings, session]) => {
        await waitForStableSkeleton();
        if (!active) return;
        const nextForm = toForm(nextSettings);
        setSettings(nextSettings);
        setForm(nextForm);
        setBaseline(nextForm);
        setAvatarAction('keep');
        setAvatarFile(null);
        setAvatarCrop(null);
        setSessionUser(session.authenticated ? session.user : null);
        setSaveError('');
        setFieldError(null);
      })
      .catch(async (error: unknown) => {
        await waitForStableSkeleton();
        if (!active) return;
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (error instanceof ApiRequestError && error.status === 401) {
          replaceRoute('/?login=1&next=/settings/profile');
          return;
        }
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadVersion, replaceRoute]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    setReloadVersion((value) => value + 1);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const handleBack = () => {
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        return;
      }
      if (!dirtyRef.current) return;
      restoringHistoryRef.current = true;
      window.history.forward();
      navigationOriginRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setConfirmNavigation({ type: 'back' });
    };
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, []);

  useEffect(() => {
    if (!crop) return;
    window.setTimeout(() => cropConfirmRef.current?.focus(), 0);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeCrop();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [crop]);

  useEffect(() => {
    if (!confirmNavigation) return;
    window.setTimeout(() => keepEditingRef.current?.focus(), 0);
  }, [confirmNavigation]);

  useEffect(
    () => () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      if (crop?.sourceUrl) URL.revokeObjectURL(crop.sourceUrl);
    },
    [avatarPreviewUrl, crop?.sourceUrl],
  );

  const updateForm = <Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key],
  ) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFieldError((current) => (current?.field === key ? null : current));
    setSaveError('');
  };

  const chooseAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setCropError('');
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setCropError('头像不能超过5 MiB');
      return;
    }
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth < 512 || image.naturalHeight < 512) {
        URL.revokeObjectURL(sourceUrl);
        setCropError('头像原图至少需要512×512像素');
        return;
      }
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      setCrop({
        file,
        sourceUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        left: Math.floor((image.naturalWidth - size) / 2),
        top: Math.floor((image.naturalHeight - size) / 2),
        size,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      setCropError('头像已损坏或无法读取');
    };
    image.src = sourceUrl;
  };

  const moveCrop = (left: number, top: number) => {
    setCrop((current) =>
      current
        ? {
            ...current,
            left: Math.max(
              0,
              Math.min(Math.round(left), current.width - current.size),
            ),
            top: Math.max(
              0,
              Math.min(Math.round(top), current.height - current.size),
            ),
          }
        : current,
    );
  };

  const setCropSize = (size: number) => {
    setCrop((current) => {
      if (!current) return current;
      const nextSize = Math.max(
        512,
        Math.min(Math.round(size), Math.min(current.width, current.height)),
      );
      const centerX = current.left + current.size / 2;
      const centerY = current.top + current.size / 2;
      return {
        ...current,
        size: nextSize,
        left: Math.max(
          0,
          Math.min(
            Math.round(centerX - nextSize / 2),
            current.width - nextSize,
          ),
        ),
        top: Math.max(
          0,
          Math.min(
            Math.round(centerY - nextSize / 2),
            current.height - nextSize,
          ),
        ),
      };
    });
  };

  const handleCropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: crop.left,
      top: crop.top,
    };
  };

  const handleCropPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop || !dragRef.current) return;
    const pixelsPerCssPixel = crop.size / 320;
    moveCrop(
      dragRef.current.left -
        (event.clientX - dragRef.current.x) * pixelsPerCssPixel,
      dragRef.current.top -
        (event.clientY - dragRef.current.y) * pixelsPerCssPixel,
    );
  };

  const handleCropKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!crop) return;
    const step = event.shiftKey ? 1 : 10;
    const movement = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    moveCrop(crop.left + movement[0], crop.top + movement[1]);
  };

  const confirmCrop = async () => {
    if (!crop) return;
    const image = new Image();
    image.src = crop.sourceUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      setCropError('头像预览生成失败');
      return;
    }
    context.fillStyle = '#f3f4f6';
    context.fillRect(0, 0, 512, 512);
    context.drawImage(
      image,
      crop.left,
      crop.top,
      crop.size,
      crop.size,
      0,
      0,
      512,
      512,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.86),
    );
    if (!blob) {
      setCropError('头像预览生成失败');
      return;
    }
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewUrl(URL.createObjectURL(blob));
    setAvatarFile(crop.file);
    setAvatarCrop({
      left: crop.left,
      top: crop.top,
      size: crop.size,
    });
    setAvatarAction('replace');
    closeCrop();
  };

  const displayedAvatar = useMemo<ProfileAvatar>(() => {
    if (!form || !settings) return { type: 'initial', value: '蓝' };
    if (avatarAction === 'replace' && avatarPreviewUrl) {
      return { type: 'image', value: avatarPreviewUrl };
    }
    if (avatarAction === 'delete') return initialAvatar(form.nickname);
    if (settings.avatar.type === 'initial') return initialAvatar(form.nickname);
    return settings.avatar;
  }, [avatarAction, avatarPreviewUrl, form, settings]);

  const requestNavigation = (path: string, origin?: HTMLElement) => {
    if (!dirty) {
      router.push(path);
      return;
    }
    navigationOriginRef.current =
      origin ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setConfirmNavigation({ type: 'path', path });
  };

  const continueEditing = () => {
    setConfirmNavigation(null);
    window.setTimeout(() => navigationOriginRef.current?.focus(), 0);
  };

  const abandonChanges = () => {
    const target = confirmNavigation;
    setConfirmNavigation(null);
    if (!target) return;
    dirtyRef.current = false;
    if (target.type === 'path') {
      router.push(target.path);
    } else {
      window.history.back();
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !settings || saving) return;
    setSaveError('');
    setFieldError(null);
    setSaving(true);
    const body = new FormData();
    body.set('nickname', form.nickname);
    body.set('gender', form.gender);
    body.set('birthDate', form.birthDate);
    body.set('showAge', String(form.showAge));
    body.set('bio', form.bio);
    body.set('avatarAction', avatarAction);
    body.set('profileVersion', settings.profileVersion);
    if (avatarAction === 'replace' && avatarFile && avatarCrop) {
      body.set('avatar', avatarFile);
      body.set('cropLeft', String(avatarCrop.left));
      body.set('cropTop', String(avatarCrop.top));
      body.set('cropSize', String(avatarCrop.size));
    }
    try {
      const result = await apiRequest<{
        settings: ProfileSettings;
      }>('/profile/me/settings', {
        method: 'PATCH',
        body,
      });
      const nextForm = toForm(result.settings);
      setSettings(result.settings);
      setForm(nextForm);
      setBaseline(nextForm);
      setAvatarAction('keep');
      setAvatarFile(null);
      setAvatarCrop(null);
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        setAvatarPreviewUrl(null);
      }
      setSessionUser((current) =>
        current
          ? {
              ...current,
              nickname: result.settings.nickname,
              avatar: result.settings.avatar,
            }
          : current,
      );
      window.dispatchEvent(
        new CustomEvent('littlebluebook:profile-updated', {
          detail: {
            nickname: result.settings.nickname,
            avatar: result.settings.avatar,
          },
        }),
      );
      setToast('资料已保存');
      dirtyRef.current = false;
      router.push('/profile');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        router.replace('/?login=1&next=/settings/profile');
        return;
      }
      const message =
        error instanceof ApiRequestError
          ? (error.payload.message ?? '资料保存失败，请稍后重试')
          : '资料保存失败，请稍后重试';
      const field = error instanceof ApiRequestError ? errorField(error) : null;
      if (field) {
        setFieldError({ field, message });
      } else {
        setSaveError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLinkCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dirty) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[href]',
    );
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    navigationOriginRef.current = link;
    setConfirmNavigation({
      type: 'path',
      path: `${url.pathname}${url.search}${url.hash}`,
    });
  };

  return (
    <div
      className="home-shell profile-settings-shell"
      onClickCapture={handleLinkCapture}
    >
      <PageSidebar
        user={sessionUser}
        active="profile"
        onLogin={() => setAuthOpen(true)}
        onToast={setToast}
      />
      <main className="content-shell profile-settings-content">
        <PageTopbar
          onToast={setToast}
          onNavigate={(path, origin) =>
            requestNavigation(path, origin ?? undefined)
          }
        />
        <section
          className="profile-settings-page"
          aria-labelledby="settings-title"
        >
          {loading ? (
            <div
              className="settings-skeleton"
              aria-busy="true"
              aria-label="正在加载个人资料设置"
            >
              <span className="profile-skeleton settings-skeleton-avatar" />
              {Array.from({ length: 7 }, (_, index) => (
                <span
                  className="profile-skeleton settings-skeleton-row"
                  key={index}
                />
              ))}
            </div>
          ) : loadError ? (
            <div className="profile-load-error" role="alert">
              <p>个人资料设置加载失败，请稍后重试</p>
              <button className="profile-retry" type="button" onClick={reload}>
                重试
              </button>
            </div>
          ) : settings && form ? (
            <>
              <header className="settings-heading">
                <button
                  type="button"
                  onClick={(event) =>
                    requestNavigation('/profile', event.currentTarget)
                  }
                >
                  返回个人主页
                </button>
                <div>
                  <h1 id="settings-title">编辑资料</h1>
                  <p>完善你的公开资料，邮箱和小蓝书号不可修改</p>
                </div>
              </header>
              <form
                className="profile-settings-form"
                onSubmit={save}
                noValidate
              >
                <section
                  className="avatar-editor"
                  aria-labelledby="avatar-label"
                >
                  <Avatar
                    avatar={displayedAvatar}
                    className="settings-avatar"
                    label={`${form.nickname || '用户'}的头像预览`}
                  />
                  <div>
                    <h2 id="avatar-label">头像</h2>
                    <p>支持 JPEG、PNG、WebP，最大 5 MiB，至少 512×512</p>
                    <div className="avatar-editor-actions">
                      <label className="secondary-action">
                        更换头像
                        <input
                          ref={fileInputRef}
                          className="sr-only"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={chooseAvatar}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={
                          avatarAction === 'delete' &&
                          settings.avatar.type === 'initial'
                        }
                        onClick={() => {
                          if (avatarPreviewUrl)
                            URL.revokeObjectURL(avatarPreviewUrl);
                          setAvatarPreviewUrl(null);
                          setAvatarFile(null);
                          setAvatarCrop(null);
                          setAvatarAction('delete');
                        }}
                      >
                        删除头像
                      </button>
                    </div>
                    {cropError ? (
                      <p className="field-error" role="alert">
                        {cropError}
                      </p>
                    ) : null}
                  </div>
                </section>

                <label className="settings-field" htmlFor="profile-nickname">
                  <span>昵称</span>
                  <input
                    id="profile-nickname"
                    aria-label="昵称"
                    value={form.nickname}
                    maxLength={20}
                    autoComplete="nickname"
                    aria-invalid={fieldError?.field === 'nickname'}
                    aria-describedby={
                      fieldError?.field === 'nickname'
                        ? 'nickname-error'
                        : undefined
                    }
                    onChange={(event) =>
                      updateForm('nickname', event.target.value)
                    }
                  />
                  <small>{Array.from(form.nickname).length}/20</small>
                  {fieldError?.field === 'nickname' ? (
                    <em id="nickname-error" className="field-error">
                      {fieldError.message}
                    </em>
                  ) : null}
                </label>

                <label className="settings-field" htmlFor="profile-id">
                  <span>小蓝书号</span>
                  <input
                    id="profile-id"
                    aria-label="小蓝书号"
                    value={settings.littleBlueBookId}
                    readOnly
                  />
                  <small>不可修改</small>
                </label>

                <label className="settings-field" htmlFor="profile-email">
                  <span>登录邮箱</span>
                  <input
                    id="profile-email"
                    aria-label="登录邮箱"
                    value={settings.email}
                    readOnly
                    autoComplete="email"
                  />
                  <small>不可修改</small>
                </label>

                <fieldset
                  className="settings-fieldset"
                  aria-invalid={fieldError?.field === 'gender'}
                  aria-describedby={
                    fieldError?.field === 'gender' ? 'gender-error' : undefined
                  }
                >
                  <legend>性别</legend>
                  <div className="segmented-control">
                    {(
                      [
                        ['MALE', '男'],
                        ['FEMALE', '女'],
                        ['PRIVATE', '保密'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="gender"
                          value={value}
                          aria-label={label}
                          aria-describedby={
                            fieldError?.field === 'gender'
                              ? 'gender-error'
                              : undefined
                          }
                          checked={form.gender === value}
                          onChange={() => updateForm('gender', value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {fieldError?.field === 'gender' ? (
                    <p id="gender-error" className="field-error" role="alert">
                      {fieldError.message}
                    </p>
                  ) : null}
                </fieldset>

                <div className="settings-field settings-date-field">
                  <span>出生日期</span>
                  <ProfileDatePicker
                    id="profile-birth-date"
                    value={form.birthDate}
                    invalid={fieldError?.field === 'birthDate'}
                    describedBy={
                      fieldError?.field === 'birthDate'
                        ? 'birth-date-error'
                        : undefined
                    }
                    onChange={(birthDate) => {
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              birthDate,
                              showAge: birthDate ? current.showAge : false,
                            }
                          : current,
                      );
                      setFieldError(null);
                    }}
                  />
                  {fieldError?.field === 'birthDate' ? (
                    <em id="birth-date-error" className="field-error">
                      {fieldError.message}
                    </em>
                  ) : null}
                </div>

                <label className="settings-switch">
                  <span>
                    <strong>公开年龄</strong>
                    <small>公开页面只显示年龄，不显示完整出生日期</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.showAge}
                    disabled={!form.birthDate}
                    aria-invalid={fieldError?.field === 'showAge'}
                    aria-describedby={
                      fieldError?.field === 'showAge'
                        ? 'show-age-error'
                        : undefined
                    }
                    onChange={(event) =>
                      updateForm('showAge', event.target.checked)
                    }
                  />
                  {fieldError?.field === 'showAge' ? (
                    <em id="show-age-error" className="field-error">
                      {fieldError.message}
                    </em>
                  ) : null}
                </label>

                <label
                  className="settings-field settings-bio-field"
                  htmlFor="profile-bio"
                >
                  <span>个人简介</span>
                  <textarea
                    id="profile-bio"
                    aria-label="个人简介"
                    value={form.bio}
                    maxLength={100}
                    rows={4}
                    aria-invalid={fieldError?.field === 'bio'}
                    aria-describedby={
                      fieldError?.field === 'bio' ? 'bio-error' : undefined
                    }
                    onChange={(event) => updateForm('bio', event.target.value)}
                  />
                  <small>{Array.from(form.bio).length}/100</small>
                  {fieldError?.field === 'bio' ? (
                    <em id="bio-error" className="field-error">
                      {fieldError.message}
                    </em>
                  ) : null}
                </label>

                {saveError ? (
                  <div className="settings-save-error" role="alert">
                    <p>{saveError}</p>
                    {saveError.includes('其他窗口') ? (
                      <button type="button" onClick={reload}>
                        重新加载
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="settings-form-actions">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={(event) =>
                      requestNavigation('/profile', event.currentTarget)
                    }
                  >
                    取消
                  </button>
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </section>
      </main>

      {crop ? (
        <div className="modal-layer crop-layer">
          <div className="modal-backdrop" aria-hidden="true" />
          <div
            ref={cropDialogRef}
            className="crop-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-title"
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || !cropDialogRef.current) return;
              const focusable = Array.from(
                cropDialogRef.current.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
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
            }}
          >
            <h2 id="crop-title">裁剪头像</h2>
            <p>拖动图片调整位置，也可使用方向键精确移动</p>
            <div
              className="crop-stage"
              tabIndex={0}
              role="application"
              aria-label="头像裁剪区域，使用方向键移动"
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
              onKeyDown={handleCropKeyDown}
            >
              <img
                src={crop.sourceUrl}
                alt=""
                draggable={false}
                style={{
                  width: `${(crop.width / crop.size) * 320}px`,
                  height: `${(crop.height / crop.size) * 320}px`,
                  left: `${(-crop.left / crop.size) * 320}px`,
                  top: `${(-crop.top / crop.size) * 320}px`,
                }}
              />
            </div>
            <label className="crop-zoom">
              <span>缩放</span>
              <input
                type="range"
                min={512}
                max={Math.min(crop.width, crop.height)}
                value={crop.size}
                aria-valuetext={`裁剪区域 ${crop.size} 像素`}
                onChange={(event) => setCropSize(Number(event.target.value))}
              />
            </label>
            {cropError ? (
              <p className="field-error" role="alert">
                {cropError}
              </p>
            ) : null}
            <div className="crop-actions">
              <button type="button" onClick={closeCrop}>
                取消
              </button>
              <button
                ref={cropConfirmRef}
                className="primary-action"
                type="button"
                onClick={() => void confirmCrop()}
              >
                确认裁剪
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmNavigation ? (
        <div className="modal-layer">
          <div className="modal-backdrop" aria-hidden="true" />
          <div
            ref={confirmDialogRef}
            className="confirm-dialog settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                continueEditing();
                return;
              }
              if (event.key !== 'Tab' || !confirmDialogRef.current) return;
              const buttons = Array.from(
                confirmDialogRef.current.querySelectorAll<HTMLButtonElement>(
                  'button:not([disabled])',
                ),
              );
              const first = buttons[0];
              const last = buttons.at(-1);
              if (!first || !last) return;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <h2 id="leave-title">放弃未保存的修改？</h2>
            <p>离开后，本次修改和头像预览将不会保存。</p>
            <div>
              <button
                ref={keepEditingRef}
                type="button"
                onClick={continueEditing}
              >
                继续编辑
              </button>
              <button
                type="button"
                data-confirm-delete
                onClick={abandonChanges}
              >
                放弃修改
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(user) => {
          setSessionUser(user);
          setAuthOpen(false);
          reload();
        }}
        onToast={setToast}
      />
    </div>
  );
}
