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
import { API_BASE_URL, apiRequest, ApiRequestError } from '../_lib/api';
import type { PublicChannel, PublicChannelList } from '../_lib/channels';
import { markNoteDetailSource } from '../_lib/notes';

type SessionResult = {
  authenticated: boolean;
  user: { id: string; email: string; nickname: string } | null;
};

type SelectedImage = {
  id: string;
  file: File | null;
  existingId: string | null;
  previewUrl: string;
};

type PublishMode = 'image' | 'video';

type SelectedVideo = {
  file: File | null;
  previewUrl: string;
  width: number;
  height: number;
  durationMs: number;
  cover: File | null;
  coverPreviewUrl: string | null;
  coverSource: 'automatic' | 'custom' | 'existing' | null;
};

type EditableNote = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  content: string;
  contentVersion: number;
  channel: { code: string; name: string; publishable: boolean };
  images: Array<{
    id: string;
    url: string;
    width: number;
    height: number;
  }>;
  video: {
    url: string;
    posterUrl: string;
    width: number;
    height: number;
    durationMs: number;
  } | null;
};

type UploadStage = 'uploading' | 'validating' | 'publishing';

const UPLOAD_STAGES: Array<{ key: UploadStage; label: string }> = [
  { key: 'uploading', label: '上传文件' },
  { key: 'validating', label: '校验媒体' },
  { key: 'publishing', label: '发布笔记' },
];

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MIN_VIDEO_DURATION_MS = 1_000;
const MAX_VIDEO_DURATION_MS = 600_000;
const UNSAVED_CHANGES_MESSAGE = '内容尚未发布，确认离开吗？';

function revokeBlobUrl(value: string | null): void {
  if (value?.startsWith('blob:')) URL.revokeObjectURL(value);
}

function visibleLength(value: string): number {
  return Array.from(value.trim()).length;
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function waitForVisiblePaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  success: keyof HTMLMediaElementEventMap,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('VIDEO_TIMEOUT')),
      10_000,
    );
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(success, onSuccess);
      video.removeEventListener('error', onError);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('VIDEO_DECODE_FAILED'));
    };
    video.addEventListener(success, onSuccess, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function inspectVideo(
  file: File,
  previewUrl: string,
): Promise<SelectedVideo> {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = previewUrl;
  await waitForVideoEvent(video, 'loadedmetadata');
  const durationMs = Math.round(video.duration * 1000);
  if (
    !Number.isFinite(durationMs) ||
    durationMs < MIN_VIDEO_DURATION_MS ||
    durationMs > MAX_VIDEO_DURATION_MS ||
    video.videoWidth < 1 ||
    video.videoHeight < 1
  ) {
    throw new Error('VIDEO_METADATA_INVALID');
  }
  const width = video.videoWidth;
  const height = video.videoHeight;

  let cover: File | null = null;
  let coverPreviewUrl: string | null = null;
  try {
    video.currentTime = Math.min(0.1, Math.max(0, video.duration / 10));
    await waitForVideoEvent(video, 'seeked');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.88),
    );
    if (!blob) throw new Error('COVER_EXTRACTION_FAILED');
    cover = new File([blob], 'video-cover.webp', { type: 'image/webp' });
    coverPreviewUrl = URL.createObjectURL(cover);
  } catch {
    // A manual cover is required when this browser cannot decode a frame.
  } finally {
    video.removeAttribute('src');
    video.load();
  }
  return {
    file,
    previewUrl,
    width,
    height,
    durationMs,
    cover,
    coverPreviewUrl,
    coverSource: cover ? 'automatic' : null,
  };
}

export default function PublishPage() {
  const router = useRouter();
  const [mode, setMode] = useState<PublishMode>('image');
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  const [editOriginalChannel, setEditOriginalChannel] = useState<{
    code: string;
    name: string;
    publishable: boolean;
  } | null>(null);
  const [pendingMode, setPendingMode] = useState<PublishMode | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [videoInspecting, setVideoInspecting] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [reauthOpen, setReauthOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const uploadRequestRef = useRef<XMLHttpRequest | null>(null);
  const modeDialogRef = useRef<HTMLDivElement>(null);
  const modeDialogConfirmRef = useRef<HTMLButtonElement>(null);
  const modeDialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const channelTriggerRef = useRef<HTMLButtonElement>(null);
  const channelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const imagesRef = useRef<SelectedImage[]>([]);
  const videoRef = useRef<SelectedVideo | null>(null);
  const dirtyRef = useRef(false);

  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    videoRef.current = video;
  }, [video]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (!parameters.get('edit') && parameters.get('mode') === 'video') {
      const timer = window.setTimeout(() => setMode('video'), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest<SessionResult>('/auth/session')
      .then(async (session) => {
        if (!active) return;
        if (!session.authenticated) {
          router.replace('/?login=1&next=/publish');
          return;
        }
        const noteId = new URLSearchParams(window.location.search).get('edit');
        if (noteId) {
          setEditNoteId(noteId);
          try {
            const editable = await apiRequest<EditableNote>(
              `/notes/${encodeURIComponent(noteId)}/edit`,
            );
            if (!active) return;
            const nextMode =
              editable.contentType === 'VIDEO' ? 'video' : 'image';
            setMode(nextMode);
            setTitle(editable.title);
            setContent(editable.content);
            setContentVersion(editable.contentVersion);
            setEditOriginalChannel(editable.channel);
            setSelectedChannelCode(editable.channel.code);
            if (nextMode === 'image') {
              setImages(
                editable.images.map((image) => ({
                  id: image.id,
                  existingId: image.id,
                  file: null,
                  previewUrl: image.url,
                })),
              );
            } else if (editable.video) {
              setVideo({
                file: null,
                previewUrl: editable.video.url,
                width: editable.video.width,
                height: editable.video.height,
                durationMs: editable.video.durationMs,
                cover: null,
                coverPreviewUrl: editable.video.posterUrl,
                coverSource: 'existing',
              });
            }
          } catch (loadError) {
            if (!active) return;
            window.sessionStorage.setItem(
              'littlebluebook:profile-toast',
              loadError instanceof ApiRequestError && loadError.status === 404
                ? '笔记不存在或无权编辑'
                : '笔记编辑内容加载失败',
            );
            router.replace('/profile');
            return;
          }
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
      imagesRef.current.forEach((image) => revokeBlobUrl(image.previewUrl));
      if (videoRef.current) {
        revokeBlobUrl(videoRef.current.previewUrl);
        revokeBlobUrl(videoRef.current.coverPreviewUrl);
      }
      uploadRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!pendingMode) return;
    window.setTimeout(() => modeDialogConfirmRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPendingMode(null);
        window.setTimeout(() => {
          modeDialogTriggerRef.current?.focus();
          modeDialogTriggerRef.current = null;
        }, 0);
      }
      if (event.key !== 'Tab' || !modeDialogRef.current) return;
      const buttons = Array.from(
        modeDialogRef.current.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])',
        ),
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingMode]);

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
    (mode === 'image'
      ? images.length >= 1 && images.length <= 9
      : Boolean(video?.coverPreviewUrl) &&
        Boolean(video) &&
        !videoInspecting) &&
    selectedChannelCode !== null &&
    !channelsLoading &&
    !channelsFailed &&
    Boolean(channels.find((channel) => channel.code === selectedChannelCode)) &&
    (!editNoteId || dirty);

  const selectedChannel = channels.find(
    (channel) => channel.code === selectedChannelCode,
  );
  const selectedChannelUnavailable =
    Boolean(editNoteId) &&
    Boolean(selectedChannelCode) &&
    !selectedChannel &&
    editOriginalChannel?.code === selectedChannelCode;

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
      existingId: null,
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
      if (target) revokeBlobUrl(target.previewUrl);
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

  const clearImages = () => {
    setImages((current) => {
      current.forEach((image) => revokeBlobUrl(image.previewUrl));
      return [];
    });
  };

  const clearVideo = () => {
    setVideo((current) => {
      if (current) {
        revokeBlobUrl(current.previewUrl);
        revokeBlobUrl(current.coverPreviewUrl);
      }
      return null;
    });
  };

  const applyMode = (nextMode: PublishMode, trigger: HTMLButtonElement) => {
    if (editNoteId) return;
    if (nextMode === mode) return;
    if (images.length > 0 || video) {
      modeDialogTriggerRef.current = trigger;
      setPendingMode(nextMode);
      return;
    }
    setMode(nextMode);
    setError('');
  };

  const closeModeDialog = () => {
    setPendingMode(null);
    window.setTimeout(() => {
      modeDialogTriggerRef.current?.focus();
      modeDialogTriggerRef.current = null;
    }, 0);
  };

  const confirmModeChange = () => {
    if (!pendingMode) return;
    if (pendingMode === 'image') clearVideo();
    else clearImages();
    setMode(pendingMode);
    closeModeDialog();
    setError('');
    markDirty();
  };

  const selectVideo = async (file: File | undefined) => {
    if (!file || videoInspecting || publishing || editNoteId) return;
    setError('');
    if (
      file.type !== 'video/mp4' ||
      file.size < 1 ||
      file.size > MAX_VIDEO_BYTES
    ) {
      setError(
        file.type !== 'video/mp4'
          ? '仅支持MP4视频'
          : file.size < 1
            ? '视频文件不能为空'
            : '视频不能超过100 MiB',
      );
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setVideoInspecting(true);
    try {
      const inspected = await inspectVideo(file, previewUrl);
      clearVideo();
      setVideo(inspected);
      if (!inspected.cover) {
        setError('当前浏览器未能自动提取封面，请手动选择封面');
      }
      markDirty();
    } catch {
      revokeBlobUrl(previewUrl);
      setError('视频无法解码，或时长不在1秒至10分钟范围内');
    } finally {
      setVideoInspecting(false);
    }
  };

  const selectCover = (file: File | undefined) => {
    if (!file || !video || publishing) return;
    if (
      !ACCEPTED_IMAGE_TYPES.has(file.type) ||
      file.size < 1 ||
      file.size > MAX_IMAGE_BYTES
    ) {
      setError('封面仅支持JPEG、PNG、WebP且不能超过10 MiB');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setVideo((current) => {
      if (!current) {
        revokeBlobUrl(previewUrl);
        return current;
      }
      revokeBlobUrl(current.coverPreviewUrl);
      return {
        ...current,
        cover: file,
        coverPreviewUrl: previewUrl,
        coverSource: 'custom',
      };
    });
    setError('');
    markDirty();
  };

  const confirmNavigation = (destination: string) => {
    const message = editNoteId
      ? '修改尚未保存，确认离开吗？'
      : UNSAVED_CHANGES_MESSAGE;
    if (dirtyRef.current && !window.confirm(message)) {
      return;
    }
    dirtyRef.current = false;
    setDirty(false);
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

  const sendVideo = (formData: FormData) =>
    new Promise<{ id: string; createdAt: string }>((resolve, reject) => {
      const request = new XMLHttpRequest();
      uploadRequestRef.current = request;
      request.open('POST', `${API_BASE_URL}/notes/videos`);
      request.withCredentials = true;
      request.responseType = 'json';
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return;
        setUploadProgress(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
      });
      request.upload.addEventListener('load', () => {
        setUploadProgress(100);
        setUploadStage('validating');
      });
      request.addEventListener('load', () => {
        const payload = (request.response ?? {}) as {
          data?: { id: string; createdAt: string };
          code?: string;
          message?: string;
          details?: Record<string, unknown>;
        };
        if (request.status >= 200 && request.status < 300 && payload.data) {
          resolve(payload.data);
          return;
        }
        reject(
          new ApiRequestError(request.status || 500, {
            code: payload.code,
            message: payload.message,
            details: payload.details,
          }),
        );
      });
      request.addEventListener('error', () =>
        reject(new Error('NETWORK_ERROR')),
      );
      request.addEventListener('abort', () => {
        const error = new Error('UPLOAD_ABORTED');
        error.name = 'AbortError';
        reject(error);
      });
      request.send(formData);
    });

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!formValid || publishing) {
      if (titleLength < 1 || titleLength > 50) {
        setError('标题需为1～50个字符');
      } else if (contentLength < 1 || contentLength > 2000) {
        setError('正文需为1～2000个字符');
      } else if (mode === 'image' && images.length < 1) {
        setError('请至少选择1张图片');
      } else if (mode === 'video' && !video) {
        setError('请选择一个视频');
      } else if (mode === 'video' && !video?.coverPreviewUrl) {
        setError('请等待自动封面生成或手动选择封面');
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
    if (editNoteId && contentVersion !== null) {
      formData.set('contentType', mode === 'image' ? 'IMAGE' : 'VIDEO');
      formData.set('expectedContentVersion', String(contentVersion));
    } else {
      formData.set('clientRequestId', requestIdRef.current);
    }
    if (mode === 'image') {
      if (editNoteId) {
        let newImageIndex = 0;
        const imageOrder = images.map((image) => {
          if (image.existingId) {
            return { kind: 'existing' as const, id: image.existingId };
          }
          const entry = { kind: 'new' as const, index: newImageIndex };
          newImageIndex += 1;
          if (image.file) formData.append('images', image.file);
          return entry;
        });
        formData.set('imageOrder', JSON.stringify(imageOrder));
      } else {
        images.forEach((image) => {
          if (image.file) formData.append('images', image.file);
        });
      }
    } else if (video?.cover) {
      if (!editNoteId && video.file) formData.set('video', video.file);
      formData.set('cover', video.cover);
    }

    setPublishing(true);
    setUploadProgress(0);
    setUploadStage(mode === 'video' && !editNoteId ? 'uploading' : null);
    try {
      const result = editNoteId
        ? await apiRequest<{
            id: string;
            contentVersion: number;
            editedAt: string;
          }>(`/notes/${encodeURIComponent(editNoteId)}`, {
            method: 'PATCH',
            body: formData,
          })
        : mode === 'video'
          ? await sendVideo(formData)
          : await apiRequest<{ id: string; createdAt: string }>('/notes', {
              method: 'POST',
              body: formData,
            });
      if (mode === 'video' && !editNoteId) {
        setUploadStage('publishing');
        await waitForVisiblePaint();
      }
      dirtyRef.current = false;
      setDirty(false);
      if (editNoteId) {
        window.sessionStorage.setItem(
          'littlebluebook:detail-toast',
          '笔记修改已保存',
        );
      } else {
        markNoteDetailSource(result.id);
      }
      router.push(`/explore/${result.id}`);
    } catch (publishError) {
      if (publishError instanceof Error && publishError.name === 'AbortError') {
        setError('已取消上传，内容和本地文件已保留，可重新发布');
        return;
      }
      if (
        publishError instanceof ApiRequestError &&
        publishError.status === 401
      ) {
        setError('登录状态已失效，请重新登录后继续发布');
        setReauthOpen(true);
      } else if (publishError instanceof ApiRequestError) {
        if (publishError.message === 'NOTE_EDIT_CONFLICT') {
          setEditConflict(true);
          setError('笔记已在其他页面更新，请重新加载最新内容后再编辑');
          return;
        }
        if (editNoteId && publishError.status === 404) {
          dirtyRef.current = false;
          setDirty(false);
          window.sessionStorage.setItem(
            'littlebluebook:profile-toast',
            '笔记不存在或已被删除',
          );
          router.replace('/profile');
          return;
        }
        if (publishError.message === 'CHANNEL_INVALID') {
          setSelectedChannelCode(null);
          setChannelPanelOpen(false);
        }
        setError(
          publishError.payload.message ??
            (editNoteId ? '保存失败，请稍后重试' : '发布失败，请稍后重试'),
        );
      } else {
        setError(
          editNoteId
            ? '网络异常，修改内容已保留，请稍后重试'
            : '网络异常，内容已保留，请稍后重试',
        );
      }
    } finally {
      uploadRequestRef.current = null;
      setPublishing(false);
      setUploadStage(null);
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
          aria-label={editNoteId ? '返回笔记详情' : '返回首页'}
          onClick={() =>
            confirmNavigation(editNoteId ? `/explore/${editNoteId}` : '/')
          }
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
          <h1>
            {editNoteId
              ? mode === 'image'
                ? '编辑图文笔记'
                : '编辑视频笔记'
              : mode === 'image'
                ? '发布图文笔记'
                : '发布视频笔记'}
          </h1>
          <p>
            {editNoteId
              ? '修改后保留原发布时间和互动数据'
              : '分享你的见闻、经验与灵感'}
          </p>
        </div>
        <button
          className="publish-exit"
          type="button"
          onClick={() =>
            confirmNavigation(editNoteId ? `/explore/${editNoteId}` : '/')
          }
        >
          {editNoteId ? '返回笔记' : '返回首页'}
        </button>
      </header>

      <form className="publish-page" onSubmit={publish}>
        <div
          className="publish-mode-selector"
          role="radiogroup"
          aria-label="发布类型"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'image'}
            className={mode === 'image' ? 'active' : ''}
            disabled={publishing || Boolean(editNoteId)}
            onClick={(event) => applyMode('image', event.currentTarget)}
          >
            {editNoteId ? '图文笔记' : '发布图文'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'video'}
            className={mode === 'video' ? 'active' : ''}
            disabled={publishing || Boolean(editNoteId)}
            onClick={(event) => applyMode('video', event.currentTarget)}
          >
            {editNoteId ? '视频笔记' : '发布视频'}
          </button>
        </div>
        {mode === 'image' ? (
          <section
            className="publish-media-panel"
            aria-labelledby="media-title"
          >
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
        ) : (
          <section
            className="publish-media-panel video-publish-panel"
            aria-labelledby="media-title"
          >
            <div className="publish-section-heading">
              <div>
                <h2 id="media-title">视频与封面</h2>
                <p>支持H.264 MP4，1秒至10分钟，最大100 MiB</p>
              </div>
              <strong aria-live="polite">1个视频</strong>
            </div>
            {!editNoteId ? (
              <input
                ref={videoInputRef}
                className="sr-only"
                type="file"
                accept="video/mp4"
                aria-label="选择笔记视频"
                onChange={(event) => {
                  void selectVideo(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            ) : null}
            <input
              ref={coverInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="选择视频封面"
              onChange={(event) => {
                selectCover(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {!video ? (
              <button
                type="button"
                className={`upload-dropzone ${dragging ? 'dragging' : ''}`}
                disabled={videoInspecting}
                aria-busy={videoInspecting}
                onClick={() => videoInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event: DragEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  setDragging(false);
                  void selectVideo(event.dataTransfer.files[0]);
                }}
              >
                <Icon name="video" size={42} />
                <strong>
                  {videoInspecting ? '正在读取视频…' : '点击或拖放视频到这里'}
                </strong>
                <span>不会自动播放，发布前将在浏览器生成封面</span>
              </button>
            ) : (
              <div className="video-publish-preview">
                <video
                  src={video.previewUrl}
                  poster={video.coverPreviewUrl ?? undefined}
                  controls
                  preload="metadata"
                  aria-label="待发布视频预览"
                />
                <dl>
                  <div>
                    <dt>大小</dt>
                    <dd>
                      {video.file
                        ? `${(video.file.size / 1024 / 1024).toFixed(1)} MiB`
                        : '已发布'}
                    </dd>
                  </div>
                  <div>
                    <dt>尺寸</dt>
                    <dd>
                      {video.width}×{video.height}
                    </dd>
                  </div>
                  <div>
                    <dt>时长</dt>
                    <dd>
                      {Math.floor(video.durationMs / 60_000)}:
                      {String(
                        Math.floor(video.durationMs / 1000) % 60,
                      ).padStart(2, '0')}
                    </dd>
                  </div>
                  <div>
                    <dt>格式</dt>
                    <dd>MP4（服务端将独立验证编码）</dd>
                  </div>
                </dl>
                <div className="video-cover-preview">
                  {video.coverPreviewUrl ? (
                    <img src={video.coverPreviewUrl} alt="视频封面预览" />
                  ) : (
                    <div role="status">自动提取失败，请手动选择封面</div>
                  )}
                  <span>
                    {video.coverSource === 'custom'
                      ? '自定义封面'
                      : video.coverSource === 'automatic'
                        ? '自动提取封面'
                        : video.coverSource === 'existing'
                          ? '当前封面'
                          : '封面未就绪'}
                  </span>
                </div>
                <div className="video-publish-actions">
                  {!editNoteId ? (
                    <button
                      type="button"
                      disabled={publishing}
                      onClick={() => videoInputRef.current?.click()}
                    >
                      替换视频
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {video.coverPreviewUrl ? '替换封面' : '选择封面'}
                  </button>
                  {!editNoteId ? (
                    <button
                      type="button"
                      disabled={publishing}
                      onClick={() => {
                        clearVideo();
                        markDirty();
                      }}
                    >
                      移除视频
                    </button>
                  ) : null}
                </div>
                {editNoteId ? (
                  <p className="video-edit-hint">
                    原视频不可替换；如需更换视频，请删除笔记后重新发布。
                  </p>
                ) : null}
              </div>
            )}
          </section>
        )}

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
                      : selectedChannelUnavailable
                        ? `${editOriginalChannel?.name ?? '原频道'}（不可发布）`
                        : (selectedChannel?.name ?? '选择频道')}
                  </span>
                  <Icon name="chevronRight" size={18} />
                </button>
                <small id="channel-picker-help">
                  {selectedChannel
                    ? editNoteId
                      ? '已选择，可在保存前更换'
                      : '已选择，可在发布前更换'
                    : selectedChannelUnavailable
                      ? '原频道已不可发布，请重新选择'
                      : '必选'}
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

          {editConflict ? (
            <button
              className="publish-conflict-reload"
              type="button"
              onClick={() => {
                dirtyRef.current = false;
                setDirty(false);
                window.location.reload();
              }}
            >
              重新加载最新内容
            </button>
          ) : null}

          {mode === 'video' && uploadStage ? (
            <div
              className="video-upload-status"
              role="status"
              aria-live="polite"
            >
              <ol aria-label="发布进度">
                {UPLOAD_STAGES.map((stage, index) => {
                  const currentIndex = UPLOAD_STAGES.findIndex(
                    (item) => item.key === uploadStage,
                  );
                  const state =
                    index < currentIndex
                      ? 'complete'
                      : index === currentIndex
                        ? 'current'
                        : 'pending';
                  return (
                    <li key={stage.key} data-state={state}>
                      <span aria-hidden="true">{index + 1}</span>
                      {stage.label}
                    </li>
                  );
                })}
              </ol>
              <span>
                {uploadStage === 'uploading'
                  ? `正在上传 ${uploadProgress}%`
                  : uploadStage === 'validating'
                    ? '正在校验视频与封面'
                    : '正在发布笔记'}
              </span>
              <progress
                max={100}
                value={uploadStage === 'uploading' ? uploadProgress : 100}
              >
                {uploadProgress}%
              </progress>
              {uploadStage !== 'publishing' ? (
                <button
                  type="button"
                  onClick={() => uploadRequestRef.current?.abort()}
                >
                  取消上传
                </button>
              ) : null}
            </div>
          ) : null}

          <button
            className="publish-submit"
            type="submit"
            disabled={!formValid || publishing}
            aria-busy={publishing}
          >
            {publishing
              ? editNoteId
                ? '保存中…'
                : mode === 'video'
                  ? '处理中…'
                  : '发布中…'
              : editNoteId
                ? '保存修改'
                : '发布笔记'}
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

      {pendingMode ? (
        <div className="confirm-layer">
          <div className="modal-backdrop" aria-hidden="true" />
          <div
            ref={modeDialogRef}
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="publish-mode-confirm-title"
            aria-describedby="publish-mode-confirm-description"
          >
            <h2 id="publish-mode-confirm-title">切换发布类型</h2>
            <p id="publish-mode-confirm-description">
              切换后会清除当前选择的媒体文件和预览，是否继续？
            </p>
            <div>
              <button type="button" onClick={closeModeDialog}>
                取消
              </button>
              <button
                ref={modeDialogConfirmRef}
                type="button"
                onClick={confirmModeChange}
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
