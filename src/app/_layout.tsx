import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/ui';
import { StoreProvider } from '@/lib/store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.brand,
            headerTitleStyle: { color: colors.ink, fontWeight: '700' },
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'RecoverIQ', headerLargeTitle: true }} />
          <Stack.Screen name="new" options={{ title: 'New claim', presentation: 'modal' }} />
          <Stack.Screen name="claim/[id]" options={{ title: 'Claim' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
