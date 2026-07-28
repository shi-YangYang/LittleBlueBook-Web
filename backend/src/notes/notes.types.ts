export type NoteAuthor = {
  id: string;
  nickname: string;
  avatar: {
    type: 'initial';
    value: string;
  };
};

export type NoteCard = {
  id: string;
  title: string;
  cover: {
    url: string;
    width: number;
    height: number;
  };
  author: NoteAuthor;
  likes: number;
  liked: boolean;
  canLike: boolean;
};

export type NotePage = {
  items: NoteCard[];
  nextCursor: string | null;
};

export type NoteDetail = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: NoteAuthor;
  channel: {
    code: string;
    name: string;
    navigable: boolean;
  } | null;
  images: Array<{
    url: string;
    width: number;
    height: number;
  }>;
  interactions: {
    likes: number;
    favorites: number;
    comments: number;
  };
  viewer: {
    authenticated: boolean;
    isAuthor: boolean;
    liked: boolean;
    favorited: boolean;
    followingAuthor: boolean;
    canLike: boolean;
    canFollow: boolean;
  };
};

export type PublishResult = {
  id: string;
  createdAt: string;
};
