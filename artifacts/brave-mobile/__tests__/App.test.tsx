/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-inappbrowser-reborn', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn().mockResolvedValue(true),
    openAuth: jest.fn(),
  },
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK: 'AfterFirstUnlock' },
  getGenericPassword: jest.fn().mockResolvedValue(false),
  setGenericPassword: jest.fn().mockResolvedValue(true),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('lucide-react-native', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => ReactModule.createElement(View, props);
  return new Proxy(
    { __esModule: true },
    {
      get: (target, property) =>
        property in target
          ? target[property as keyof typeof target]
          : Icon,
    },
  );
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
