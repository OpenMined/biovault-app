package expo.modules.bioscript

internal class ExpoBioscriptNativeBridge private constructor() {
  companion object {
    private val nativeLibraryLoaded: Boolean by lazy {
      try {
        System.loadLibrary("bioscript_ffi")
        true
      } catch (_: UnsatisfiedLinkError) {
        false
      }
    }

    @JvmStatic
    fun isAvailable(): Boolean = nativeLibraryLoaded

    @JvmStatic
    fun runFile(requestJson: String): String? {
      check(nativeLibraryLoaded) { "bioscript native library is unavailable on Android." }
      return runFileNative(requestJson)
    }

    @JvmStatic
    private external fun runFileNative(requestJson: String): String?
  }
}
