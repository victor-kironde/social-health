import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StoreProvider } from '../data/store';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
          <Stack.Screen name="index" options={{ title: 'Your network' }} />
          <Stack.Screen name="graph" options={{ title: 'Network graph' }} />
          <Stack.Screen name="person/new" options={{ title: 'Add person', presentation: 'modal' }} />
          <Stack.Screen name="person/[id]" options={{ title: '' }} />
          <Stack.Screen name="log" options={{ title: 'Log contact', presentation: 'modal' }} />
          <Stack.Screen name="preview" options={{ title: 'Engine preview' }} />
        </Stack>
      </StoreProvider>
    </GestureHandlerRootView>
  );
}
