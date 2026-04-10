package expo.modules.bioscript

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

internal class BioscriptUnavailableException :
  CodedException("bioscript native Android library is unavailable.")

internal class BioscriptInvalidResponseException :
  CodedException("bioscript returned an invalid JSON response.")

internal class BioscriptRuntimeException(message: String) :
  CodedException(message)

class ExpoBioscriptModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoBioscript")

    Function("isAvailable") {
      ExpoBioscriptNativeBridge.isAvailable()
    }

    AsyncFunction("runFile") { request: Map<String, Any?> ->
      if (!ExpoBioscriptNativeBridge.isAvailable()) {
        throw BioscriptUnavailableException()
      }

      val requestJson = JSONObject(request).toString()
      val response = ExpoBioscriptNativeBridge.runFile(requestJson)
        ?: throw BioscriptInvalidResponseException()

      val json = try {
        JSONObject(response)
      } catch (_: Exception) {
        throw BioscriptInvalidResponseException()
      }

      if (!json.optBoolean("ok")) {
        throw BioscriptRuntimeException(json.optString("error", "bioscript runFile failed"))
      }

      val value = json.optJSONObject("value") ?: throw BioscriptInvalidResponseException()
      mapOf("ok" to value.optBoolean("ok"))
    }
  }
}
