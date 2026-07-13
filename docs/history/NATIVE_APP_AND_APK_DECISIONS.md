# Native app and APK decisions

Production browser and sanitized warehouse QA precede new mobile work. The requested future application is fully native React Native/Expo and must not use WebView. Expo testing is a distinct gate before Android packaging. APK/AAB generation, signing, and release remain final work, not part of this reset checkpoint.

Git history contains older mobile-shell commits before the documented Phase 1 timeline, but this checkpoint does not modify `mobile-app`, run Expo, create Android projects, or build APK/AAB artifacts. Future implementation must reconcile repository history with the currently approved no-WebView direction rather than assuming an older shell is the final architecture.
