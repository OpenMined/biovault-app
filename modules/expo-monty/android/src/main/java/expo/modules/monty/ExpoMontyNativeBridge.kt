package expo.modules.monty

internal class ExpoMontyNativeBridge private constructor() {
  companion object {
    private val nativeLibraryLoaded: Boolean by lazy {
      try {
        System.loadLibrary("expo_monty_ffi")
        true
      } catch (_: UnsatisfiedLinkError) {
        false
      }
    }

    @JvmStatic
    fun isAvailable(): Boolean = nativeLibraryLoaded

    @JvmStatic
    fun runCode(code: String, inputsJson: String): String? {
      check(nativeLibraryLoaded) { "expo_monty_ffi native library is unavailable on Android." }
      return runCodeNative(code, inputsJson)
    }

    @JvmStatic
    private external fun runCodeNative(code: String, inputsJson: String): String?
  }
}
