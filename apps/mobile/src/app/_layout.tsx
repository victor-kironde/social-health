import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { StoreProvider } from '../data/store';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  return (
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
        <Stack.Screen name="person/new" options={{ title: 'Add person', presentation: 'modal' }} />
        <Stack.Screen name="preview" options={{ title: 'Engine preview' }} />
      </Stack>
    </StoreProvider>
  );
}
