/**
 * BRAVE — the student app.
 *
 * A React Native application, not a website in a shell. Every screen is built
 * from native views; the only thing shared with the web app is the API it talks
 * to and the brand palette it paints with.
 *
 * Provider order matters:
 *   SafeAreaProvider        supplies the insets every screen reads
 *   QueryClientProvider     owns the cache; must outlive any screen using it
 *   AuthProvider            decides which navigator renders, so it sits inside
 *                           the query provider (it calls the API) and outside
 *                           the navigator (it chooses one)
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/lib/auth';
import { RootNavigator } from './src/navigation/RootNavigator';
import { UnauthorizedError } from './src/lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A phone loses signal in lifts and on trains. Two retries with backoff
      // rides that out; retrying a 401 would only spam a server that has
      // already said no.
      retry: (failureCount, error) =>
        !(error instanceof UnauthorizedError) && failureCount < 2,
      refetchOnWindowFocus: false,
      // Coming back from the background SHOULD refetch — a student who opened
      // the app yesterday must not be shown yesterday's numbers.
      refetchOnMount: true,
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
