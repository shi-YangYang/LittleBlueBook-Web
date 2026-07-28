import type { PrismaService } from '../database/prisma.service.js';
import { ChannelsService } from './channels.service.js';

const publicChannels = [
  { code: 'digital', name: '数码', displayOrder: 1 },
  { code: 'other', name: '其它', displayOrder: 13 },
];

describe('ChannelsService', () => {
  function serviceWith(findUnique: jest.Mock = jest.fn(async () => null)) {
    const prisma = {
      channel: {
        findMany: jest.fn(async () => publicChannels),
        findUnique,
      },
    };
    return {
      service: new ChannelsService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('returns only the ordered public channel projection', async () => {
    const { service, prisma } = serviceWith();

    await expect(service.listPublic()).resolves.toEqual({
      items: publicChannels,
    });
    expect(prisma.channel.findMany).toHaveBeenCalledWith({
      where: { enabled: true, isPublic: true },
      orderBy: { displayOrder: 'asc' },
      select: { code: true, name: true, displayOrder: true },
    });
  });

  it('uses the same authoritative table to exclude non-publishable choices', async () => {
    const { service, prisma } = serviceWith();

    await service.listPublic(true);

    expect(prisma.channel.findMany).toHaveBeenCalledWith({
      where: { enabled: true, isPublic: true, publishable: true },
      orderBy: { displayOrder: 'asc' },
      select: { code: true, name: true, displayOrder: true },
    });
  });

  it.each([
    {
      code: 'uncategorized',
      enabled: true,
      isPublic: false,
      publishable: false,
    },
    {
      code: 'digital',
      enabled: false,
      isPublic: true,
      publishable: true,
    },
    {
      code: 'digital',
      enabled: true,
      isPublic: true,
      publishable: false,
    },
  ])('rejects a non-publishable channel safely', async (state) => {
    const { service } = serviceWith(
      jest.fn(async () => ({
        id: '00000000-0000-4000-8001-000000000001',
        name: '频道',
        displayOrder: 1,
        ...state,
      })),
    );

    await expect(service.requirePublishable(state.code)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CHANNEL_INVALID' }),
    });
  });

  it('rejects malformed channel codes without querying the database', async () => {
    const findUnique = jest.fn();
    const { service } = serviceWith(findUnique);

    await expect(service.requirePublic('../internal')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CHANNEL_NOT_FOUND' }),
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
