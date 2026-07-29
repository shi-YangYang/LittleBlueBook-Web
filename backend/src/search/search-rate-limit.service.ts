import { createHash } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { ApiException } from '../common/api-exception.js';
import { RedisService } from '../redis/redis.service.js';

const RESERVE_SEARCH_REQUEST_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if current > tonumber(ARGV[1]) then
  return 0
end
return 1
`;

@Injectable()
export class SearchRateLimitService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async reserve(sourceIp: string | undefined): Promise<void> {
    const sourceHash = createHash('sha256')
      .update(sourceIp || 'unknown')
      .digest('hex');
    const result = await this.redis.eval(
      RESERVE_SEARCH_REQUEST_SCRIPT,
      [`search:rate:${sourceHash}`],
      ['120', '60'],
    );
    if (Number(result) !== 1) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        '搜索过于频繁，请稍后再试',
      );
    }
  }
}
