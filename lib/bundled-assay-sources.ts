export type BundledAssaySource = {
  assayAssetModuleId: number
  assayPath: string
  intermediatePath: string
  fileAssetModuleIds: Record<string, number>
}

export const bundledAssaySources: BundledAssaySource[] = [
  {
    assayAssetModuleId: require('../assets/assays/herc2/assay.yaml'),
    assayPath: 'assets/assays/herc2/assay.yaml',
    intermediatePath: 'assets/assays/herc2/assay.intermediate.json',
    fileAssetModuleIds: {
      'assets/assays/herc2/assay.intermediate.json': require('../assets/assays/herc2/assay.intermediate.json'),
      'assets/assays/herc2/assay.yaml': require('../assets/assays/herc2/assay.yaml'),
      'assets/assays/herc2/catalogue.yaml': require('../assets/assays/herc2/catalogue.yaml'),
      'assets/assays/herc2/herc2.py': require('../assets/assays/herc2/herc2.py'),
      'assets/assays/herc2/variants/rs12913832.yaml': require('../assets/assays/herc2/variants/rs12913832.yaml'),
    },
  },
  {
    assayAssetModuleId: require('../assets/assays/apol1/assay.yaml'),
    assayPath: 'assets/assays/apol1/assay.yaml',
    intermediatePath: 'assets/assays/apol1/assay.intermediate.json',
    fileAssetModuleIds: {
      'assets/assays/apol1/assay.intermediate.json': require('../assets/assays/apol1/assay.intermediate.json'),
      'assets/assays/apol1/assay.yaml': require('../assets/assays/apol1/assay.yaml'),
      'assets/assays/apol1/catalogue.yaml': require('../assets/assays/apol1/catalogue.yaml'),
      'assets/assays/apol1/apol1.py': require('../assets/assays/apol1/apol1.py'),
      'assets/assays/apol1/variants/rs73885319.yaml': require('../assets/assays/apol1/variants/rs73885319.yaml'),
      'assets/assays/apol1/variants/rs60910145.yaml': require('../assets/assays/apol1/variants/rs60910145.yaml'),
      'assets/assays/apol1/variants/g2.yaml': require('../assets/assays/apol1/variants/g2.yaml'),
    },
  },
]
