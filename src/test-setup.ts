import { vi } from 'vitest';

// Mock crypto.randomInt to avoid delays in tests
vi.mock('crypto', () => ({
    randomInt: vi.fn((min: number, _max: number) => min),
}));
