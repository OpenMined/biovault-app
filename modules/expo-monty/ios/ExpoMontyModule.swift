import ExpoModulesCore
import Foundation

public final class ExpoMontyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoMonty")

    Function("isAvailable") {
      true
    }

    AsyncFunction("runCode") { (code: String, inputs: [String: Any]?) -> [String: Any] in
      let normalizedInputs = inputs ?? [:]
      let jsonData = try JSONSerialization.data(withJSONObject: normalizedInputs, options: [])
      guard let inputsJson = String(data: jsonData, encoding: .utf8) else {
        throw MontyModuleError.invalidInputsEncoding
      }

      guard let codeCString = strdup(code) else {
        throw MontyModuleError.allocationFailed
      }
      defer { free(codeCString) }

      guard let inputsCString = strdup(inputsJson) else {
        throw MontyModuleError.allocationFailed
      }
      defer { free(inputsCString) }

      guard let resultPointer = expo_monty_run(codeCString, inputsCString) else {
        throw MontyModuleError.nullResponse
      }
      defer { expo_monty_free_string(resultPointer) }

      let resultString = String(cString: resultPointer)
      guard let resultData = resultString.data(using: .utf8) else {
        throw MontyModuleError.invalidResponseEncoding
      }

      guard let resultObject = try JSONSerialization.jsonObject(with: resultData) as? [String: Any] else {
        throw MontyModuleError.invalidResponseShape
      }

      return resultObject
    }
  }
}

private enum MontyModuleError: Error {
  case allocationFailed
  case invalidInputsEncoding
  case nullResponse
  case invalidResponseEncoding
  case invalidResponseShape
}
