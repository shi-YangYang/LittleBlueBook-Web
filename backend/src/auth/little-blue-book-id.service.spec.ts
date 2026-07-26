import { LittleBlueBookIdService } from './little-blue-book-id.service.js';

describe('LittleBlueBookIdService', () => {
  it('always generates exactly ten decimal digits', () => {
    const service = new LittleBlueBookIdService();

    for (let sample = 0; sample < 200; sample += 1) {
      expect(service.generate()).toMatch(/^\d{10}$/);
    }
  });
});
