export async function clearAllAppStorage(): Promise<void> {
  // Desktop storage is owned by native app/cache directories. This web shell
  // deliberately avoids browser storage APIs, so there is nothing to clear here.
}
