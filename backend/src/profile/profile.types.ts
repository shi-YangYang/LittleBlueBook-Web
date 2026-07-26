export type ProfileGender = '男' | '女' | '保密';

export type CurrentProfile = {
  nickname: string;
  littleBlueBookId: string;
  gender: ProfileGender;
  avatar: {
    type: 'initial';
    value: string;
  };
  stats: {
    following: number;
    followers: number;
    receivedLikesAndFavorites: number;
  };
};
