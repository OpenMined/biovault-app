import ExpoModulesCore

// Declare the external Rust functions
@_silgen_name("rust_add")
func rust_add(_ a: Int32, _ b: Int32) -> Int32

@_silgen_name("process_23andme_file")
func process_23andme_file(_ inputPath: UnsafePointer<CChar>, _ customName: UnsafePointer<CChar>, _ outputDir: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?

@_silgen_name("free_string")
func free_string(_ ptr: UnsafeMutablePointer<CChar>)

public class ExpoBiovaultModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoBiovault")

    AsyncFunction("processGenomeFile") { (inputPath: String, customName: String, outputDir: String) -> String in
      let inputCString = inputPath.cString(using: .utf8)!
      let nameCString = customName.cString(using: .utf8)!
      let outputCString = outputDir.cString(using: .utf8)!
      
      guard let resultPtr = process_23andme_file(inputCString, nameCString, outputCString) else {
        throw Exception(name: "ProcessingError", description: "Failed to process genome file")
      }
      
      let result = String(cString: resultPtr)
      free_string(resultPtr)
      return result
    }

    Function("rust_add") { (a: Int32, b: Int32) -> Int32 in
      return rust_add(a, b)
    }
  }
}
