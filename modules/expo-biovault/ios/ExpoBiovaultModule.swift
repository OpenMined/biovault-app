import ExpoModulesCore
import Foundation

@_silgen_name("process_genome_file")
func process_genome_file(_ inputPath: UnsafePointer<CChar>, _ customName: UnsafePointer<CChar>, _ outputDir: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?

@_silgen_name("free_string")
func free_string(_ ptr: UnsafeMutablePointer<CChar>)

public class ExpoBiovaultModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoBiovault")

    AsyncFunction("processGenomeFile") { (inputPath: String, customName: String, outputDir: String) -> String in
      // Validate inputs first
      guard FileManager.default.fileExists(atPath: inputPath) else {
        throw Exception(name: "FileNotFound", description: "Input file not found: \(inputPath)")
      }
      
      let inputCString = inputPath.cString(using: .utf8)!
      let nameCString = customName.cString(using: .utf8)!
      let outputCString = outputDir.cString(using: .utf8)!
      
      // Call Rust function
      guard let resultPtr = process_genome_file(inputCString, nameCString, outputCString) else {
        // Rust function returned null - check common issues
        let errorDetails = """
        Failed to process genome file.
        
        Common causes:
        • Unsupported file format (supported: 23andMe, AncestryDNA, VCF, TSV, CSV)
        • File is corrupted or incomplete
        • ZIP file contains no genomic data or multiple files
        • File permissions issue
        
        File: \(inputPath)
        
        Check the Xcode console for detailed Rust error messages.
        """
        throw Exception(name: "ProcessingError", description: errorDetails)
      }
      
      let result = String(cString: resultPtr)
      free_string(resultPtr)
      return result
    }
  }
}
