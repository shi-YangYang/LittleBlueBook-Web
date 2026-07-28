/* eslint-disable @next/next/no-img-element */
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Icon } from '../_components/icon';
import { ReauthDialog } from '../_components/reauth-dialog';
import { apiRequest, ApiRequestError } from '../_lib/api';
import type { PublicChannel, PublicChannelList } from '../_lib/channels';
import { markNoteDetailSource } from '../_lib/notes';

type SessionResult = {
  authenticated: boolean;
  user: { id: string; email: string; nickname: string } | null;
};

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UNSAVED_CHANGES_MESSAGE = '内容尚未发布，确认离开吗？';

function visibleLength(value: string): number {
  return Array.from(value.trim()).length;
}

function createRequestId(): string {
  return crypto.randomUUID();
}

export default function PublishPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [reauthOpen, setReauthOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsFailed, setChannelsFailed] = useState(false);
  const [channelsReloadVersion, setChannelsReloadVersion] = useState(0);
  const [selectedChannelCode, setSelectedChannelCode] = useState<string | null>(
    null,
  );
  const [channelPanelOpen, setChannelPanelOpen] = useState(false);
  const requestIdRef = useRef(createRequestId());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelTriggerRef = useRef<HTMLButtonElement>(null);
  const channelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const imagesRef = useRef<SelectedImage[]>([]);
  const dirtyRef = useRef(false);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    let active = true;
    void apiRequest<SessionResult>('/auth/session')
      .then((session) => {
        if (!active) return;
        if (!session.authenticated) {
          router.replace('/?login=1&next=/publish');
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) {
          router.replace('/?login=1&next=/publish');
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    let active = true;
    void apiRequest<PublicChannelList>('/channels?purpose=publish')
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
    if (!channelPanelOpen) return;
    const selectedIndex = channels.findIndex(
      (channel) => channel.code === selectedChannelCode,
    );
    const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
    window.setTimeout(() => channelOptionRefs.current[focusIndex]?.focus(), 0);
  }, [channelPanelOpen, channels, selectedChannelCode]);

  useEffect(
    () => () => {
      imagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl),
      );
    },
    [],
  );

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = UNSAVED_CHANGES_MESSAGE;
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const titleLength = useMemo(() => visibleLength(title), [title]);
  const contentLength = useMemo(() => visibleLength(content), [content]);
  const formValid =
    titleLength >= 1 &&
    titleLength <= 50 &&
    contentLength >= 1 &&
    contentLength <= 2000 &&
    images.length >= 1 &&
    images.length <= 9 &&
    selectedChannelCode !== null &&
    !channelsLoading &&
    !channelsFailed;

  const selectedChannel = channels.find(
    (channel) => channel.code === selectedChannelCode,
  );

  const addFiles = (files: File[]) => {
    setError('');
    const available = 9 - images.length;
    if (files.length > available) {
      setError(`最多选择9张图片，还可以选择${available}张`);
      return;
    }
    const invalid = files.find(
      (file) =>
        !ACCEPTED_IMAGE_TYPES.has(file.type) ||
        file.size < 1 ||
        file.size > MAX_IMAGE_BYTES,
    );
    if (invalid) {
      const reason = !ACCEPTED_IMAGE_TYPES.has(invalid.type)
        ? '仅支持JPEG、PNG和WebP'
        : invalid.size < 1
          ? '文件不能为空'
          : '单张不能超过10 MiB';
      setError(`${invalid.name}：${reason}`);
      return;
    }
    const selected = files.map((file) => ({
      id: createRequestId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((current) => [...current, ...selected]);
    markDirty();
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, imageIndex) => imageIndex !== index);
    });
    markDirty();
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(to, 0, moved);
      return next;
    });
    markDirty();
  };

  const confirmNavigation = (destination: string) => {
    if (dirtyRef.current && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      return;
    }
    dirtyRef.current = false;
    window.location.assign(destination);
  };

  const closeChannelPanel = (restoreFocus = true) => {
    setChannelPanelOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => channelTriggerRef.current?.focus(), 0);
    }
  };

  const handleChannelKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeChannelPanel();
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % channels.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + channels.length) % channels.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = channels.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      channelOptionRefs.current[nextIndex]?.focus();
    }
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!formValid || publishing) {
      if (titleLength < 1 || titleLength > 50) {
        setError('标题需为1～50个字符');
      } else if (contentLength < 1 || contentLength > 2000) {
        setError('正文需为1～2000个字符');
      } else if (images.length < 1) {
        setError('请至少选择1张图片');
      } else if (!selectedChannelCode) {
        setError('请选择频道');
      }
      return;
    }
    if (!selectedChannelCode) return;

    const formData = new FormData();
    formData.set('title', title.trim());
    formData.set('content', content.trim());
    formData.set('channelCode', selectedChannelCode);
    formData.set('clientRequestId', requestIdRef.current);
    images.forEach((image) => formData.append('images', image.file));

    setPublishing(true);
    try {
      const result = await apiRequest<{ id: string; createdAt: string }>(
        '/notes',
        { method: 'POST', body: formData },
      );
      dirtyRef.current = false;
      markNoteDetailSource(result.id);
      router.push(`/explore/${result.id}`);
    } catch (publishError) {
      if (
        publishError instanceof ApiRequestError &&
        publishError.status === 401
      ) {
        setError('登录状态已失效，请重新登录后继续发布');
        setReauthOpen(true);
      } else if (publishError instanceof ApiRequestError) {
        if (publishError.message === 'CHANNEL_INVALID') {
          setSelectedChannelCode(null);
          setChannelPanelOpen(false);
        }
        setError(publishError.payload.message ?? '发布失败，请稍后重试');
      } else {
        setError('网络异常，内容已保留，请稍后重试');
      }
    } finally {
      setPublishing(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="publish-session-loading" aria-busy="true">
        正在确认登录状态…
      </main>
    );
  }

  return (
    <div className="publish-shell">
      <header className="publish-topbar">
        <button
          type="button"
          className="publish-logo-button"
          aria-label="返回首页"
          onClick={() => confirmNavigation('/')}
        >
          <Image
            src="/brand/littlebluebook-logo.svg"
            alt="小蓝书"
            width={116}
            height={52}
            priority
          />
        </button>
        <div>
          <h1>发布图文笔记</h1>
          <p>分享你的见闻、经验与灵感</p>
        </div>
        <button
          className="publish-exit"
          type="button"
          onClick={() => confirmNavigation('/')}
        >
          返回首页
        </button>
      </header>

      <form className="publish-page" onSubmit={publish}>
        <section className="publish-media-panel" aria-labelledby="media-title">
          <div className="publish-section-heading">
            <div>
              <h2 id="media-title">图片</h2>
              <p>第一张图片将作为笔记封面</p>
            </div>
            <strong aria-live="polite">{images.length}/9</strong>
          </div>

          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-label="选择笔记图片"
            onChange={handleFiles}
          />

          {images.length === 0 ? (
            <button
              type="button"
              className={`upload-dropzone ${dragging ? 'dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLButtonElement>) => {
                event.preventDefault();
                setDragging(false);
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <Icon name="publish" size={42} />
              <strong>点击或拖放图片到这里</strong>
              <span>支持 JPEG、PNG、WebP，单张不超过10 MiB</span>
            </button>
          ) : (
            <>
              <div className="publish-image-grid">
                {images.map((image, index) => (
                  <article className="publish-image-item" key={image.id}>
                    <div className="publish-preview">
                      <img
                        src={image.previewUrl}
                        alt={`第${index + 1}张预览`}
                      />
                      {index === 0 ? (
                        <span className="cover-label">封面</span>
                      ) : null}
                      <span className="image-order">{index + 1}</span>
                    </div>
                    <div className="image-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`将第${index + 1}张图片前移`}
                        onClick={() => moveImage(index, index - 1)}
                      >
                        前移
                      </button>
                      <button
                        type="button"
                        disabled={index === images.length - 1}
                        aria-label={`将第${index + 1}张图片后移`}
                        onClick={() => moveImage(index, index + 1)}
                      >
                        后移
                      </button>
                      <button
                        type="button"
                        aria-label={`移除第${index + 1}张图片`}
                        onClick={() => removeImage(index)}
                      >
                        移除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {images.length < 9 ? (
                <button
                  type="button"
                  className="add-more-images"
                  onClick={() => fileInputRef.current?.click()}
                >
                  继续添加图片
                </button>
              ) : null}
            </>
          )}
        </section>

        <section className="publish-copy-panel" aria-labelledby="copy-title">
          <div className="publish-section-heading">
            <div>
              <h2 id="copy-title">笔记内容</h2>
              <p>文字将按纯文本展示，并保留换行</p>
            </div>
          </div>

          <label className="publish-field" htmlFor="note-title">
            <span>标题</span>
            <input
              id="note-title"
              aria-label="标题"
              value={title}
              maxLength={80}
              aria-describedby="title-counter"
              aria-invalid={titleLength > 50}
              placeholder="填写标题，会有更多人看到"
              onChange={(event) => {
                setTitle(event.target.value);
                markDirty();
              }}
            />
            <small
              id="title-counter"
              className={titleLength > 50 ? 'invalid' : ''}
            >
              {titleLength}/50
            </small>
          </label>

          <label className="publish-field" htmlFor="note-content">
            <span>正文</span>
            <textarea
              id="note-content"
              aria-label="正文"
              value={content}
              maxLength={2400}
              aria-describedby="content-counter"
              aria-invalid={contentLength > 2000}
              placeholder="分享你的真实体验和想法…"
              onChange={(event) => {
                setContent(event.target.value);
                markDirty();
              }}
            />
            <small
              id="content-counter"
              className={contentLength > 2000 ? 'invalid' : ''}
            >
              {contentLength}/2000
            </small>
          </label>

          <div className="channel-picker">
            <span className="channel-picker-label">频道</span>
            {channelsFailed ? (
              <div className="channel-picker-failure">
                <span id="channel-picker-help" role="alert">
                  频道加载失败，请重试
                </span>
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
              </div>
            ) : (
              <>
                <button
                  ref={channelTriggerRef}
                  className="channel-picker-trigger"
                  type="button"
                  aria-expanded={channelPanelOpen}
                  aria-controls="channel-picker-panel"
                  aria-describedby="channel-picker-help"
                  disabled={channelsLoading}
                  onClick={() => setChannelPanelOpen((value) => !value)}
                >
                  <span>
                    {channelsLoading
                      ? '正在加载频道…'
                      : (selectedChannel?.name ?? '选择频道')}
                  </span>
                  <Icon name="chevronRight" size={18} />
                </button>
                <small id="channel-picker-help">
                  {selectedChannel ? '已选择，可在发布前更换' : '必选'}
                </small>
                {channelPanelOpen ? (
                  <div
                    className="channel-picker-panel"
                    id="channel-picker-panel"
                    role="radiogroup"
                    aria-label="选择笔记频道"
                  >
                    {channels.map((channel, index) => (
                      <button
                        key={channel.code}
                        ref={(element) => {
                          channelOptionRefs.current[index] = element;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={selectedChannelCode === channel.code}
                        tabIndex={
                          selectedChannelCode === channel.code ||
                          (!selectedChannelCode && index === 0)
                            ? 0
                            : -1
                        }
                        onKeyDown={(event) =>
                          handleChannelKeyDown(event, index)
                        }
                        onClick={() => {
                          setSelectedChannelCode(channel.code);
                          setError('');
                          markDirty();
                          closeChannelPanel();
                        }}
                      >
                        <span>{channel.name}</span>
                        {selectedChannelCode === channel.code ? (
                          <span aria-hidden="true">已选</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <button
            className="topic-placeholder"
            type="button"
            aria-describedby="topic-placeholder-description"
            onClick={() => setToast('功能正在开发中')}
          >
            <Icon name="topic" size={20} />
            <span>
              <strong>添加话题</strong>
              <small id="topic-placeholder-description">功能正在开发中</small>
            </span>
          </button>

          {error ? (
            <p className="publish-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="publish-submit"
            type="submit"
            disabled={!formValid || publishing}
            aria-busy={publishing}
          >
            {publishing ? '发布中…' : '发布笔记'}
          </button>
        </section>
      </form>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <ReauthDialog
        open={reauthOpen}
        onAuthenticated={() => {
          setReauthOpen(false);
          setError('');
          setToast('登录成功，可以继续发布');
        }}
      />
    </div>
  );
}
