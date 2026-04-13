export type BundledAssaySource = {
  assayAssetModuleId: number
  assayPath: string
  compiledPath: string
  fileAssetModuleIds: Record<string, number>
}

export const bundledAssaySources: BundledAssaySource[] = [
  {
    assayAssetModuleId: require('../assets/assays/herc2/assay.yaml'),
    assayPath: 'assets/assays/herc2/assay.yaml',
    compiledPath: 'assets/assays/herc2/assay.compiled.yaml',
    fileAssetModuleIds: {
      'assets/assays/herc2/assay.compiled.yaml': require('../assets/assays/herc2/assay.compiled.yaml'),
      'assets/assays/herc2/assay.yaml': require('../assets/assays/herc2/assay.yaml'),
      'assets/assays/herc2/catalogue.yaml': require('../assets/assays/herc2/catalogue.yaml'),
      'assets/assays/herc2/herc2.py': require('../assets/assays/herc2/herc2.py'),
      'assets/assays/herc2/variants/rs12913832.yaml': require('../assets/assays/herc2/variants/rs12913832.yaml'),
    },
  },
  {
    assayAssetModuleId: require('../assets/assays/apol1/assay.yaml'),
    assayPath: 'assets/assays/apol1/assay.yaml',
    compiledPath: 'assets/assays/apol1/assay.compiled.yaml',
    fileAssetModuleIds: {
      'assets/assays/apol1/assay.compiled.yaml': require('../assets/assays/apol1/assay.compiled.yaml'),
      'assets/assays/apol1/assay.yaml': require('../assets/assays/apol1/assay.yaml'),
      'assets/assays/apol1/catalogue.yaml': require('../assets/assays/apol1/catalogue.yaml'),
      'assets/assays/apol1/apol1.py': require('../assets/assays/apol1/apol1.py'),
      'assets/assays/apol1/variants/rs73885319.yaml': require('../assets/assays/apol1/variants/rs73885319.yaml'),
      'assets/assays/apol1/variants/rs60910145.yaml': require('../assets/assays/apol1/variants/rs60910145.yaml'),
      'assets/assays/apol1/variants/g2.yaml': require('../assets/assays/apol1/variants/g2.yaml'),
    },
  },
]
