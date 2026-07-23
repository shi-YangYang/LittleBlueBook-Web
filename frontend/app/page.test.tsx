import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from './page';

describe('Home', () => {
  it('renders the product name and initialization status', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { level: 1, name: '小蓝书' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/工程基础已初始化/)).toBeInTheDocument();
  });
});
