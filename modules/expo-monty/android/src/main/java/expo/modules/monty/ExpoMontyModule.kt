package expo.modules.monty

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

internal class MontyUnavailableException :
  CodedException("expo_monty native Android library is unavailable.")

internal class MontyInvalidResponseException :
  CodedException("expo_monty returned an invalid JSON response.")

class ExpoMontyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMonty")

    Function("isAvailable") {
      ExpoMontyNativeBridge.isAvailable()
    }

    AsyncFunction("runCode") { code: String, inputs: Map<String, Any?>? ->
      if (!ExpoMontyNativeBridge.isAvailable()) {
        throw MontyUnavailableException()
      }

      val inputsJson = JSONObject(toJsonCompatibleMap(inputs ?: emptyMap())).toString()
      val response = ExpoMontyNativeBridge.runCode(code, inputsJson) ?: throw MontyInvalidResponseException()

      try {
        jsonObjectToMap(JSONObject(response))
      } catch (_: Exception) {
        throw MontyInvalidResponseException()
      }
    }
  }

  private fun toJsonCompatibleMap(map: Map<String, Any?>): Map<String, Any?> {
    return map.mapValues { (_, value) -> toJsonCompatibleValue(value) }
  }

  private fun toJsonCompatibleValue(value: Any?): Any? {
    return when (value) {
      null -> JSONObject.NULL
      is Boolean, is Number, is String -> value
      is Map<*, *> -> JSONObject(
        value.entries.associate { (key, nestedValue) ->
          key.toString() to toJsonCompatibleValue(nestedValue)
        }
      )
      is Iterable<*> -> JSONArray(value.map(::toJsonCompatibleValue))
      is Array<*> -> JSONArray(value.map(::toJsonCompatibleValue))
      else -> value.toString()
    }
  }

  private fun jsonObjectToMap(jsonObject: JSONObject): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    val keys = jsonObject.keys()

    while (keys.hasNext()) {
      val key = keys.next()
      result[key] = jsonValueToKotlin(jsonObject.get(key))
    }

    return result
  }

  private fun jsonArrayToList(jsonArray: JSONArray): List<Any?> {
    return List(jsonArray.length()) { index ->
      jsonValueToKotlin(jsonArray.get(index))
    }
  }

  private fun jsonValueToKotlin(value: Any?): Any? {
    return when (value) {
      JSONObject.NULL -> null
      is JSONObject -> jsonObjectToMap(value)
      is JSONArray -> jsonArrayToList(value)
      else -> value
    }
  }
}
