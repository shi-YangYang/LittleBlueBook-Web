/* eslint-disable @next/next/no-img-element */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

import { Icon } from '../../_components/icon';
import { apiRequest, ApiRequestError } from '../../_lib/api';
import {
  bindNoteDetailSource,
  consumeNoteDetailSource,
  type NoteDetailData,
} from '../../_lib/notes';

const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export function formatNoteTime(value: string, now = Date.now()): string {
  const date = new Date(value);
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed > THIRTY_DAYS_IN_MILLISECONDS) {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export default function NoteDetailPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = use(params);
  return <NoteDetailView noteId={noteId} />;
}

export function NoteDetailView({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [note, setNote] = useState<NoteDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState('');

  useEffect(() => {
    bindNoteDetailSource(noteId);
  }, [noteId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setNote(null);
      setLoading(true);
      setNotFound(false);
      setLoadError(false);
      setImageIndex(0);
      setFailedImages(new Set());
      try {
        const result = await apiRequest<NoteDetailData>(`/notes/${noteId}`, {
          signal: controller.signal,
        });
        if (active) setNote(result);
      } catch (error) {
        if (
          !active ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        if (error instanceof ApiRequestError && error.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [noteId, reloadVersion]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showComingSoon = () => setToast('功能正在开发中');
  const selectImage = (next: number) => {
    if (!note || next < 0 || next >= note.images.length) return;
    setImageIndex(next);
  };

  if (loading) {
    return (
      <main className="detail-page detail-loading" aria-busy="true">
        <span>正在加载笔记…</span>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="detail-page detail-message-page">
        <Image
          src="/brand/littlebluebook-logo.svg"
          alt="小蓝书"
          width={116}
          height={52}
        />
        <Icon name="empty" size={58} />
        <h1>笔记不存在</h1>
        <p>这篇笔记可能不存在或暂时无法访问。</p>
        <Link href="/">返回首页</Link>
      </main>
    );
  }

  if (loadError || !note) {
    return (
      <main className="detail-page detail-message-page">
        <Icon name="empty" size={58} />
        <h1>笔记加载失败</h1>
        <p role="alert">网络异常，请稍后重试</p>
        <button
          type="button"
          onClick={() => setReloadVersion((value) => value + 1)}
        >
          重试
        </button>
        <Link href="/">返回首页</Link>
      </main>
    );
  }

  const currentImage = note.images[imageIndex];

  return (
    <main className="detail-page">
      <button
        className="detail-back-button"
        type="button"
        aria-label="返回上一页"
        onClick={() => {
          if (consumeNoteDetailSource(noteId)) {
            window.history.back();
          } else {
            router.push('/');
          }
        }}
      >
        <Icon name="chevronLeft" size={20} />
        <span>返回</span>
      </button>

      <article className="note-detail">
        <section
          className="detail-media"
          aria-label={`笔记图片，第${imageIndex + 1}张，共${note.images.length}张`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              selectImage(imageIndex - 1);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              selectImage(imageIndex + 1);
            }
          }}
        >
          {currentImage && !failedImages.has(imageIndex) ? (
            <img
              src={currentImage.url}
              alt={`笔记图片 ${imageIndex + 1}`}
              onError={() =>
                setFailedImages((current) => new Set(current).add(imageIndex))
              }
            />
          ) : (
            <div
              className="detail-image-error"
              role="img"
              aria-label="图片加载失败"
            >
              <Icon name="empty" size={54} />
              <span>图片加载失败</span>
            </div>
          )}

          {note.images.length > 1 ? (
            <>
              <button
                className="carousel-button previous"
                type="button"
                disabled={imageIndex === 0}
                aria-label="上一张图片"
                onClick={() => selectImage(imageIndex - 1)}
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                className="carousel-button next"
                type="button"
                disabled={imageIndex === note.images.length - 1}
                aria-label="下一张图片"
                onClick={() => selectImage(imageIndex + 1)}
              >
                <Icon name="chevronRight" />
              </button>
              <span className="carousel-position" aria-live="polite">
                {imageIndex + 1}/{note.images.length}
              </span>
            </>
          ) : null}
        </section>

        <section className="detail-content">
          <div className="detail-scroll">
            <header className="detail-author">
              <span className="detail-avatar" aria-hidden="true">
                {note.author.avatar.value}
              </span>
              <strong>{note.author.nickname}</strong>
              <button
                type="button"
                aria-describedby="placeholder-description"
                onClick={showComingSoon}
              >
                关注
              </button>
            </header>

            <div className="detail-copy">
              <h1>{note.title}</h1>
              <p>{note.content}</p>
              {note.channel ? (
                note.channel.navigable ? (
                  <Link
                    className="detail-channel-tag"
                    href={`/?channel=${encodeURIComponent(note.channel.code)}`}
                  >
                    {note.channel.name}
                  </Link>
                ) : (
                  <span className="detail-channel-tag disabled">
                    {note.channel.name}
                  </span>
                )
              ) : null}
              <time dateTime={note.createdAt}>
                {formatNoteTime(note.createdAt)}
              </time>
            </div>

            <section className="comment-placeholder" aria-label="评论区">
              <h2>共 {note.interactions.comments} 条评论</h2>
              <div>
                <Icon name="comment" size={34} />
                <p>还没有评论</p>
              </div>
            </section>
          </div>

          <footer className="detail-actions">
            <button
              className="comment-entry"
              type="button"
              aria-describedby="placeholder-description"
              onClick={showComingSoon}
            >
              说点什么…
            </button>
            <button
              type="button"
              aria-label={`点赞 ${note.interactions.likes}，功能正在开发中`}
              aria-describedby="placeholder-description"
              onClick={showComingSoon}
            >
              <Icon name="heart" size={26} />
              <span>{note.interactions.likes}</span>
            </button>
            <button
              type="button"
              aria-label={`收藏 ${note.interactions.favorites}，功能正在开发中`}
              aria-describedby="placeholder-description"
              onClick={showComingSoon}
            >
              <Icon name="bookmark" size={26} />
              <span>{note.interactions.favorites}</span>
            </button>
            <button
              type="button"
              aria-label="分享，功能正在开发中"
              aria-describedby="placeholder-description"
              onClick={showComingSoon}
            >
              <Icon name="share" size={26} />
            </button>
          </footer>
        </section>
      </article>

      <span className="sr-only" id="placeholder-description">
        此控件仅为占位，当前不会产生业务数据
      </span>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
