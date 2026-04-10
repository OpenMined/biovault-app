package expo.modules.biovault

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class ExpoBiovaultModule : Module() {
  companion object {
    init {
      System.loadLibrary("expo_biovault_ffi")
    }
  }

  external fun processGenomeFile(inputPath: String, customName: String, outputDir: String): String

  override fun definition() = ModuleDefinition {
    Name("ExpoBiovault")

    AsyncFunction("processGenomeFile") { inputPath: String, customName: String, outputDir: String ->
      // Validate input file exists
      val inputFile = java.io.File(inputPath)
      if (!inputFile.exists()) {
        throw Exception("Input file not found: $inputPath")
      }
      
      try {
        processGenomeFile(inputPath, customName, outputDir)
      } catch (e: Exception) {
        // Provide helpful error message
        val errorMessage = """
          Failed to process genome file.
          
          Common causes:
          • Unsupported file format (supported: 23andMe, AncestryDNA, VCF, TSV, CSV)
          • File is corrupted or incomplete
          • ZIP file contains no genomic data or multiple files
          • File permissions issue
          
          File: $inputPath
          Error: ${e.message}
          
          Check logcat for detailed Rust error messages.
        """.trimIndent()
        
        throw Exception(errorMessage)
      }
    }
  }
}
