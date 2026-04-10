import ExpoModulesCore
import Foundation

@_silgen_name("bioscript_run_file_json")
func bioscript_run_file_json(_ requestJson: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?

@_silgen_name("bioscript_free_string")
func bioscript_free_string(_ ptr: UnsafeMutablePointer<CChar>)

public final class ExpoBioscriptModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoBioscript")

    Function("isAvailable") {
      true
    }

    AsyncFunction("runFile") { (request: [String: Any]) -> [String: Any] in
      let jsonData = try JSONSerialization.data(withJSONObject: request, options: [])
      guard let requestJson = String(data: jsonData, encoding: .utf8) else {
        throw BioscriptModuleError.invalidRequestEncoding
      }

      guard let requestCString = strdup(requestJson) else {
        throw BioscriptModuleError.allocationFailed
      }
      defer { free(requestCString) }

      guard let resultPointer = bioscript_run_file_json(requestCString) else {
        throw BioscriptModuleError.nullResponse
      }
      defer { bioscript_free_string(resultPointer) }

      let resultString = String(cString: resultPointer)
      guard let resultData = resultString.data(using: .utf8) else {
        throw BioscriptModuleError.invalidResponseEncoding
      }

      guard let resultObject = try JSONSerialization.jsonObject(with: resultData) as? [String: Any] else {
        throw BioscriptModuleError.invalidResponseShape
      }

      guard (resultObject["ok"] as? Bool) == true else {
        let message = (resultObject["error"] as? String) ?? "bioscript runFile failed"
        throw Exception(name: "BioscriptRunFileError", description: message)
      }

      guard let value = resultObject["value"] as? [String: Any] else {
        throw BioscriptModuleError.invalidResponseShape
      }

      return value
    }
  }
}

private enum BioscriptModuleError: Error {
  case allocationFailed
  case invalidRequestEncoding
  case nullResponse
  case invalidResponseEncoding
  case invalidResponseShape
}
