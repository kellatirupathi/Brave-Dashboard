/** BRAVE mobile: NIAT login and every authenticated page share one WebView. */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebAppScreen } from './src/screens/WebAppScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <WebAppScreen />
    </SafeAreaProvider>
  );
}
