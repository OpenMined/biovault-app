package expo.modules.biovault

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class ExpoBiovaultModule : Module() {
  companion object {
    init {
      System.loadLibrary("biovault_rust_lib")
    }
  }

  external fun processGenomeFile(inputPath: String, customName: String, outputDir: String): String

  override fun definition() = ModuleDefinition {
    Name("ExpoBiovault")

    AsyncFunction("processGenomeFile") { inputPath: String, customName: String, outputDir: String ->
      processGenomeFile(inputPath, customName, outputDir)
    }
  }
}
