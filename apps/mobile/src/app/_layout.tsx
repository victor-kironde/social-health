import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PrefsProvider } from '../data/prefs';
import { StoreProvider } from '../data/store';
import { SecurityProvider } from '../security/AppLock';
import { PaneFrame } from '../ui/PaneFrame';
import { useTheme } from '../ui/theme';

/** Routes shown full screen; everything else opens as a pane over the graph. */
const FULL_SCREEN = new Set(['index', 'intro', 'graph']);

/** A page presented as a pane: see-through behind, so the graph stays visible; PaneFrame draws its header. */
const pane = (title: string) =>
  ({
    title,
    presentation: 'transparentModal',
    headerShown: false,
    animation: 'fade',
    contentStyle: { backgroundColor: 'transparent' },
  }) as const;

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
              // Every page but the graph (and the intro, and the scenario graph) is a pane over the graph.
              screenLayout={({ children, route, options }) =>
                FULL_SCREEN.has(route.name) ? children : <PaneFrame title={options.title ?? ''}>{children}</PaneFrame>
              }
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
                  title: 'Social Health Network',
                  headerTitle: () => (
                    <Text style={{ color: t.text, fontSize: 20, fontWeight: '600' }} accessibilityRole="header">
                      Social Health <Text style={{ color: t.muted, fontWeight: '400' }}>Network</Text>
                    </Text>
                  ),
                  headerRight: () => (
                    <Link href="/settings" accessibilityRole="button" accessibilityLabel="Settings" style={{ padding: 8 }}>
                      <Text style={{ color: t.accent, fontSize: 16 }}>Settings</Text>
                    </Link>
                  ),
                }}
              />
              <Stack.Screen name="people" options={pane('People & score')} />
              <Stack.Screen name="groups" options={pane('Groups')} />
              <Stack.Screen name="group/[id]" options={pane('')} />
              <Stack.Screen name="plans" options={pane('Meetups')} />
              <Stack.Screen name="me" options={pane('You')} />
              <Stack.Screen name="plan/[id]" options={pane('')} />
              <Stack.Screen name="settings" options={pane('Settings')} />
              <Stack.Screen
                name="intro"
                options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
              />
              <Stack.Screen name="import" options={pane('Import from contacts')} />
              <Stack.Screen name="graph" options={{ title: 'Network graph' }} />
              <Stack.Screen name="graph-help" options={pane('Reading your graph')} />
              <Stack.Screen name="score" options={pane('Social Health')} />
              <Stack.Screen name="person/new" options={pane('Add person')} />
              <Stack.Screen name="person/[id]" options={pane('')} />
              <Stack.Screen name="log" options={pane('Log a catch-up')} />
              <Stack.Screen name="preview" options={pane('Engine preview')} />
            </Stack>
          </StoreProvider>
        </PrefsProvider>
      </SecurityProvider>
    </GestureHandlerRootView>
  );
}
