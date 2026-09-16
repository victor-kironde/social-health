import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PrefsProvider } from '../data/prefs';
import { StoreProvider } from '../data/store';
import { SecurityProvider } from '../security/AppLock';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SecurityProvider>
        <PrefsProvider>
          <StoreProvider>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: t.bg },
                headerTintColor: t.text,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: t.bg },
              }}
            >
              <Stack.Screen
                name="index"
                options={{
                  title: 'Your network',
                  headerRight: () => (
                    <Link href="/settings" accessibilityRole="button" accessibilityLabel="Settings" style={{ padding: 8 }}>
                      <Text style={{ color: t.accent, fontSize: 16 }}>Settings</Text>
                    </Link>
                  ),
                }}
              />
              <Stack.Screen name="people" options={{ title: 'People & score' }} />
              <Stack.Screen name="groups" options={{ title: 'Groups' }} />
              <Stack.Screen name="group/[id]" options={{ title: '' }} />
              <Stack.Screen name="settings" options={{ title: 'Settings' }} />
              <Stack.Screen
                name="intro"
                options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
              />
              <Stack.Screen name="import" options={{ title: 'Import from contacts', presentation: 'modal' }} />
              <Stack.Screen name="graph" options={{ title: 'Network graph' }} />
              <Stack.Screen name="graph-help" options={{ title: 'Reading your graph' }} />
              <Stack.Screen name="score" options={{ title: 'Social Health' }} />
              <Stack.Screen name="person/new" options={{ title: 'Add person', presentation: 'modal' }} />
              <Stack.Screen name="person/[id]" options={{ title: '' }} />
              <Stack.Screen name="log" options={{ title: 'Log a catch-up', presentation: 'modal' }} />
              <Stack.Screen name="preview" options={{ title: 'Engine preview' }} />
            </Stack>
          </StoreProvider>
        </PrefsProvider>
      </SecurityProvider>
    </GestureHandlerRootView>
  );
}
