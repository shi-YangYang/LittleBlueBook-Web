import type { ValidationError } from '@nestjs/common';

import {
  extractValidationFieldPaths,
  MAX_VALIDATION_ERROR_CHILD_SLOTS,
  MAX_VALIDATION_ERROR_DEPTH,
  MAX_VALIDATION_ERROR_NODES,
} from './validation-fields.js';

type RuntimeValidationNode = {
  property?: unknown;
  children?: unknown;
  constraints?: unknown;
};

function extract(errors: unknown): string[] {
  return extractValidationFieldPaths(errors as readonly ValidationError[]);
}

describe('extractValidationFieldPaths', () => {
  it('recursively returns only stable, de-duplicated and sorted field paths', () => {
    const secretValue = 'must-not-leak-C:\\private\\avatar.png';
    const target = { internalObjectKey: 'avatars/private.webp' };
    const errors = [
      {
        property: 'profile',
        target,
        value: { gender: secretValue },
        children: [
          {
            property: 'preferences',
            target,
            value: [secretValue],
            children: [
              {
                property: '0',
                target,
                value: secretValue,
                children: [
                  {
                    property: 'label',
                    target,
                    value: secretValue,
                    constraints: {
                      isString: `leaked constraint ${secretValue}`,
                    },
                  },
                ],
              },
            ],
          },
          {
            property: 'gender',
            target,
            value: secretValue,
            constraints: { isIn: `leaked constraint ${secretValue}` },
          },
        ],
      },
      {
        property: 'bio',
        target,
        value: secretValue,
        constraints: { maxLength: `leaked constraint ${secretValue}` },
      },
      {
        property: 'bio',
        constraints: { isString: 'duplicate field' },
      },
      {
        property: 'unsafe/C:\\private\\avatar.png',
        value: secretValue,
        constraints: { whitelistValidation: secretValue },
      },
    ] as ValidationError[];

    const fields = extractValidationFieldPaths(errors);

    expect(fields).toEqual([
      'bio',
      'profile.gender',
      'profile.preferences.0.label',
    ]);
    expect(JSON.stringify(fields)).not.toContain(secretValue);
    expect(JSON.stringify(fields)).not.toMatch(
      /(?:internalObjectKey|constraint|target|value|private|avatar\.png)/i,
    );
  });

  it('rejects prototype-chain reserved segments case-insensitively at every depth', () => {
    const errors: RuntimeValidationNode[] = [
      { property: '__proto__', constraints: { isString: 'invalid' } },
      { property: 'prototype', constraints: { isString: 'invalid' } },
      { property: 'constructor', constraints: { isString: 'invalid' } },
      { property: 'PROTOTYPE', constraints: { isString: 'invalid' } },
      { property: 'Constructor', constraints: { isString: 'invalid' } },
      {
        property: 'profile',
        children: [
          {
            property: 'items',
            children: [
              {
                property: '0',
                children: [
                  {
                    property: '__Proto__',
                    constraints: { isString: 'invalid' },
                  },
                  {
                    property: 'constructor',
                    constraints: { isString: 'invalid' },
                  },
                ],
              },
            ],
          },
          {
            property: 'constructorValue',
            constraints: { isString: 'invalid' },
          },
          {
            property: '_prototype',
            constraints: { isString: 'invalid' },
          },
        ],
      },
    ];

    expect(extract(errors)).toEqual([
      'profile._prototype',
      'profile.constructorValue',
    ]);
  });

  it('ignores null, scalar and function child entries', () => {
    const errors: RuntimeValidationNode[] = [
      {
        property: 'profile',
        children: [
          null,
          42,
          'invalid',
          () => undefined,
          {
            property: 'nickname',
            constraints: { isString: 'invalid' },
          },
        ],
      },
      null as unknown as RuntimeValidationNode,
      7 as unknown as RuntimeValidationNode,
      (() => undefined) as unknown as RuntimeValidationNode,
    ];

    expect(() => extract(errors)).not.toThrow();
    expect(extract(errors)).toEqual(['profile.nickname']);
  });

  it('stops self-cycles and parent-child mutual cycles by object identity', () => {
    const selfCycle: RuntimeValidationNode = { property: 'self' };
    selfCycle.children = [selfCycle];

    const parent: RuntimeValidationNode = { property: 'parent' };
    const child: RuntimeValidationNode = {
      property: 'child',
      constraints: { isString: 'invalid' },
    };
    parent.children = [child];
    child.children = [parent];

    expect(() => extract([selfCycle, parent])).not.toThrow();
    expect(extract([selfCycle, parent])).toEqual(['parent.child']);
  });

  it('visits a shared node once and keeps the first stable path', () => {
    const shared: RuntimeValidationNode = {
      property: 'nickname',
      constraints: { isString: 'invalid' },
    };
    const errors: RuntimeValidationNode[] = [
      { property: 'profile', children: [shared] },
      { property: 'account', children: [shared] },
    ];

    expect(extract(errors)).toEqual(['profile.nickname']);
    expect(extract(errors)).toEqual(['profile.nickname']);
  });

  it('fails closed without throwing when the maximum depth is exceeded', () => {
    const root: RuntimeValidationNode = { property: 'level0' };
    let cursor = root;
    for (let depth = 1; depth <= MAX_VALIDATION_ERROR_DEPTH; depth += 1) {
      const child: RuntimeValidationNode = {
        property: `level${depth}`,
      };
      cursor.children = [child];
      cursor = child;
    }
    cursor.constraints = { isString: 'invalid' };

    const errors: RuntimeValidationNode[] = [
      { property: 'visible', constraints: { isString: 'invalid' } },
      root,
    ];

    expect(() => extract(errors)).not.toThrow();
    expect(extract(errors)).toEqual([]);
  });

  it('fails closed without throwing when the node budget is exceeded', () => {
    const children = Array.from(
      { length: MAX_VALIDATION_ERROR_NODES - 1 },
      (_, index): RuntimeValidationNode => ({
        property: `field${index}`,
        constraints: { isString: 'invalid' },
      }),
    );
    const errors: RuntimeValidationNode[] = [
      { property: 'visible', constraints: { isString: 'invalid' } },
      { property: 'profile', children },
    ];

    expect(() => extract(errors)).not.toThrow();
    expect(extract(errors)).toEqual([]);
  });

  it('fails closed for invalid or unsafe children length values', () => {
    const lengthValues: unknown[] = [
      Number.POSITIVE_INFINITY,
      Number.NaN,
      -1,
      1.5,
      '2',
      Number.MAX_SAFE_INTEGER,
    ];

    for (const lengthValue of lengthValues) {
      const children = new Proxy([], {
        get(target, property, receiver): unknown {
          if (property === 'length') {
            return lengthValue;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const errors: RuntimeValidationNode[] = [
        { property: 'visible', constraints: { isString: 'invalid' } },
        { property: 'profile', children },
      ];

      expect(() => extract(errors)).not.toThrow();
      expect(extract(errors)).toEqual([]);
    }

    const childrenWithThrowingLength = new Proxy([], {
      get(target, property, receiver): unknown {
        if (property === 'length') {
          throw new Error('length getter must not escape');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const errors: RuntimeValidationNode[] = [
      { property: 'visible', constraints: { isString: 'invalid' } },
      { property: 'profile', children: childrenWithThrowingLength },
    ];

    expect(() => extract(errors)).not.toThrow();
    expect(extract(errors)).toEqual([]);
  });

  it('charges every declared children slot before reading its index getter', () => {
    function throwingChildren(length: number): {
      readonly children: unknown[];
      readonly getReadCount: () => number;
    } {
      let readCount = 0;
      const children = new Proxy([], {
        get(target, property, receiver): unknown {
          if (property === 'length') {
            return length;
          }
          if (typeof property === 'string' && /^\d+$/u.test(property)) {
            readCount += 1;
            throw new Error('index getter must not escape');
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return { children, getReadCount: () => readCount };
    }

    const withinBudget = throwingChildren(MAX_VALIDATION_ERROR_CHILD_SLOTS);
    expect(
      extract([
        { property: 'visible', constraints: { isString: 'invalid' } },
        { property: 'profile', children: withinBudget.children },
      ]),
    ).toEqual(['visible']);
    expect(withinBudget.getReadCount()).toBe(MAX_VALIDATION_ERROR_CHILD_SLOTS);

    const overBudget = throwingChildren(MAX_VALIDATION_ERROR_CHILD_SLOTS + 1);
    expect(
      extract([
        { property: 'visible', constraints: { isString: 'invalid' } },
        { property: 'profile', children: overBudget.children },
      ]),
    ).toEqual([]);
    expect(overBudget.getReadCount()).toBe(0);

    const reportedRegression = throwingChildren(
      MAX_VALIDATION_ERROR_CHILD_SLOTS + 8,
    );
    expect(
      extract([
        { property: 'visible', constraints: { isString: 'invalid' } },
        { property: 'profile', children: reportedRegression.children },
      ]),
    ).toEqual([]);
    expect(reportedRegression.getReadCount()).toBe(0);
  });

  it('enforces the children slot budget cumulatively and clears prior fields', () => {
    let firstArrayReadCount = 0;
    const firstChildren = new Proxy([], {
      get(target, property, receiver): unknown {
        if (property === 'length') {
          return MAX_VALIDATION_ERROR_CHILD_SLOTS - 1;
        }
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          firstArrayReadCount += 1;
          throw new Error('index getter must not escape');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    let secondArrayReadCount = 0;
    const secondChildren = new Proxy([], {
      get(target, property, receiver): unknown {
        if (property === 'length') {
          return 2;
        }
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          secondArrayReadCount += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(
      extract([
        { property: 'visible', constraints: { isString: 'invalid' } },
        { property: 'first', children: firstChildren },
        { property: 'second', children: secondChildren },
      ]),
    ).toEqual([]);
    expect(firstArrayReadCount).toBe(MAX_VALIDATION_ERROR_CHILD_SLOTS - 1);
    expect(secondArrayReadCount).toBe(0);
  });

  it('skips nodes and array entries whose properties cannot be read', () => {
    const propertyGetterThrows = Object.defineProperty({}, 'property', {
      get(): never {
        throw new Error('property getter must not escape');
      },
    });
    const childrenGetterThrows = Object.defineProperties(
      {},
      {
        property: { value: 'unsafeChildren' },
        children: {
          get(): never {
            throw new Error('children getter must not escape');
          },
        },
      },
    );
    const constraintsGetterThrows = Object.defineProperties(
      {},
      {
        property: { value: 'safeLeaf' },
        constraints: {
          get(): never {
            throw new Error('constraints getter must not escape');
          },
        },
      },
    );
    const children: unknown[] = [
      {
        property: 'visible',
        constraints: { isString: 'invalid' },
      },
    ];
    Object.defineProperty(children, 1, {
      get(): never {
        throw new Error('array entry getter must not escape');
      },
    });
    children.length = 2;

    const errors = [
      propertyGetterThrows,
      childrenGetterThrows,
      constraintsGetterThrows,
      { property: 'profile', children },
    ];

    expect(() => extract(errors)).not.toThrow();
    expect(extract(errors)).toEqual(['profile.visible', 'safeLeaf']);
  });
});
