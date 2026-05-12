import { useFocusEffect, useRoute } from '@react-navigation/native';
import { getAnalytics } from '@/lib/analytics';
import React, { useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

interface UseAnalyticsOptions {
  trackScreenView?: boolean;
  trackAppState?: boolean;
  screenProperties?: Record<string, any>;
  includeRouteParams?: boolean;
}

const EMPTY_SCREEN_PROPERTIES: Record<string, any> = {};

export const useAnalytics = (options: UseAnalyticsOptions = {}) => {
  const {
    trackScreenView = true,
    trackAppState = true,
    screenProperties = EMPTY_SCREEN_PROPERTIES,
    includeRouteParams = true,
  } = options;

  const route = useRoute();
  const appStateRef = useRef(AppState.currentState);
  const analytics = getAnalytics();
  const mergedScreenProperties = useMemo(
    () => ({
      ...screenProperties,
      ...(includeRouteParams ? { params: route.params } : {}),
    }),
    [screenProperties, includeRouteParams, route.params]
  );

  useFocusEffect(
    React.useCallback(() => {
      if (trackScreenView && route.name && analytics) {
        analytics.trackScreen(route.name, mergedScreenProperties);
      }
    }, [trackScreenView, route.name, analytics, mergedScreenProperties])
  );

  useEffect(() => {
    if (!trackAppState || !analytics) return;
    // On web, AppState is wired to document visibility/focus, which fires on
    // every Cmd-Tab, DevTools focus, or browser-tab throttle — producing noisy
    // app_resumed/app_backgrounded pairs that don't correspond to mobile-style
    // backgrounding. Skip the subscription on web.
    if (Platform.OS === 'web') return;

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
  }, [trackAppState, analytics]);

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
