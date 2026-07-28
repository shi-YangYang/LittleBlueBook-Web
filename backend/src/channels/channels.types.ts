export type PublicChannel = {
  code: string;
  name: string;
  displayOrder: number;
};

export type PublicChannelList = {
  items: PublicChannel[];
};

export type ChannelRecord = PublicChannel & {
  id: string;
  enabled: boolean;
  publishable: boolean;
  isPublic: boolean;
};
