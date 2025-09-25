import { useFocusEffect, useRoute } from '@react-navigation/native';
import { getAnalytics } from '@/lib/analytics';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UseAnalyticsOptions {
  trackScreenView?: boolean;
  trackAppState?: boolean;
  screenProperties?: Record<string, any>;
}

export const useAnalytics = (options: UseAnalyticsOptions = {}) => {
  const {
    trackScreenView = true,
    trackAppState = true,
    screenProperties = {}
  } = options;

  const route = useRoute();
  const appStateRef = useRef(AppState.currentState);
  const analytics = getAnalytics();

  useFocusEffect(() => {
    if (trackScreenView && route.name && analytics) {
      analytics.trackScreen(route.name, {
        ...screenProperties,
        params: route.params
      });
    }
  });

  useEffect(() => {
    if (!trackAppState || !analytics) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        analytics.trackEvent('app_resumed');
      } else if (appStateRef.current === 'active' && nextAppState.match(/inactive|background/)) {
        analytics.trackEvent('app_backgrounded');
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [trackAppState]);

  return {
    trackEvent: (eventName: string, properties?: Record<string, any>) => {
      if (!analytics) {
        console.log('Analytics not initialized, skipping event:', eventName);
        return;
      }
      analytics.trackEvent(eventName, properties);
    },
    trackScreen: (screenName: string, properties?: Record<string, any>) => {
      if (!analytics) {
        console.log('Analytics not initialized, skipping screen:', screenName);
        return;
      }
      analytics.trackScreen(screenName, properties);
    },
    trackError: (error: Error, context?: Record<string, any>) => {
      if (!analytics) {
        console.log('Analytics not initialized, skipping error:', error.message);
        return;
      }
      analytics.trackError(error, context);
    }
  };
};