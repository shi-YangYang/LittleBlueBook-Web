import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const LITTLE_BLUE_BOOK_ID_SPACE = 10_000_000_000;

@Injectable()
export class LittleBlueBookIdService {
  generate(): string {
    return randomInt(LITTLE_BLUE_BOOK_ID_SPACE).toString().padStart(10, '0');
  }
}
