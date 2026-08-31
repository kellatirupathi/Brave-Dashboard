/**
 * Root navigation.
 *
 * `createNativeStackNavigator` rather than the JS stack: it is backed by real
 * Android fragments, so screen transitions and the hardware back button are
 * handled by the platform at 60fps instead of being animated in JavaScript.
 * That difference is most of what "feels native" means when you push a screen.
 */
import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';
import { useAuth } from '../lib/auth';
import { LoginScreen } from '../screens/LoginScreen';
import { TabNavigator } from './TabNavigator';
import {
  ProfileScreen,
  TeamScreen,
  LeaderboardScreen,
  NotificationsScreen,
  LeadDetailScreen,
  GritMilesScreen,
  DemoDayScreen,
  ResourcesScreen,
  GuidebookScreen,
  LeadCreateScreen,
} from '../screens/SecondaryScreens';

export type RootParamList = {
  Tabs: undefined;
  Profile: undefined;
  Team: undefined;
  Leaderboard: undefined;
  Notifications: undefined;
  LeadDetail: { id?: number };
  LeadCreate: undefined;
  GritMiles: undefined;
  DemoDay: undefined;
  Resources: undefined;
  Guidebook: undefined;
};

const Stack = createNativeStackNavigator<RootParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.chrome,
    text: colors.foreground,
    border: colors.border,
    primary: colors.primary,
  },
};

/**
 * Held while the app decides whether the stored session is still good. It is
 * usually a single frame, but showing the login screen first and yanking it
 * away would be worse than a brief hold — that flash is what makes an app look
 * like it forgot who you are.
 */
function Splash() {
  return (
    <View style={s.splash}>
      <StatusBar barStyle="light-content" />
      <ActivityIndicator size="large" color={colors.gold} />
    </View>
  );
}

export function RootNavigator() {
  const { user, restoring } = useAuth();

  if (restoring) return <Splash />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false, // every screen draws its own AppBar
          animation: 'slide_from_right',
          // Android 14's predictive back gesture, handled natively.
          animationTypeForReplace: 'push',
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Team" component={TeamScreen} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
            <Stack.Screen name="LeadCreate" component={LeadCreateScreen} />
            <Stack.Screen name="GritMiles" component={GritMilesScreen} />
            <Stack.Screen name="DemoDay" component={DemoDayScreen} />
            <Stack.Screen name="Resources" component={ResourcesScreen} />
            <Stack.Screen name="Guidebook" component={GuidebookScreen} />
          </>
        ) : (
          // Rendering ONLY the login screen while signed out means the back
          // button cannot walk backwards into a signed-in screen — the stack
          // physically does not contain one.
          <Stack.Screen name="Tabs" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.chrome,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
