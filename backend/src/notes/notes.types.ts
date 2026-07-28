export type NoteAuthor = {
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
  likes: 0;
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
    likes: 0;
    favorites: 0;
    comments: 0;
  };
};

export type PublishResult = {
  id: string;
  createdAt: string;
};
