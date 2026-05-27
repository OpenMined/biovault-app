use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    fs,
    fs::File,
    io::{BufRead, BufReader, Cursor, Read},
    path::{Path, PathBuf},
    time::Duration,
    time::{SystemTime, UNIX_EPOCH},
};

use bioscript_core::{
    Assembly, GenomicLocus, RuntimeError, VariantKind, VariantObservation, VariantSpec,
};
use bioscript_ffi::{
    run_file_request, run_variant_yaml_request, RunFileRequest, RunFileResult,
    RunVariantYamlRequest, RunVariantYamlResult,
};
use bioscript_formats::{
    inspect_bytes as inspect_bytes_rs, DetectionConfidence, DetectedKind, FileContainer,
    FileInspection, GenotypeLoadOptions, GenotypeStore, InspectOptions, SexInference,
    SourceMetadata,
};
use bioscript_runtime::{BioscriptRuntime, RuntimeConfig};
use bioscript_schema::{
    load_variant_manifest_text, load_variant_manifest_text_for_lookup,
    resolve_remote_resource_text as resolve_remote_resource_text_rs, RemoteResourceKind,
    RemoteResourceResolution, VariantManifest,
};
use monty::{MontyObject, ResourceLimits};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLabFile {
    name: String,
    path: String,
    size: u64,
    last_modified: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheRemoteBytesRequest {
    bytes: Vec<u8>,
    content_type: Option<String>,
    name: String,
    source_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFsInfo {
    exists: bool,
    uri: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRemoteLabFileRecord {
    cached_at: String,
    content_type: String,
    name: String,
    path: String,
    size: u64,
    source_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRemoteLabFileJs {
    cached_at: String,
    content_type: String,
    file: DesktopLabFile,
    source_url: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRunAssayRequest {
    assay_path: String,
    genome_path: String,
    input_format: String,
    input_index: Option<String>,
    reference_file: Option<String>,
    reference_index: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRunAssayResult {
    output_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    observations: Option<Vec<bioscript_ffi::VariantObservationResult>>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlFileRequest {
    url: String,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunFilePayload {
    request: DesktopRunFileRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRunFileRequest {
    script_path: String,
    script_contents: Option<String>,
    root: Option<String>,
    input_file: Option<String>,
    input_contents: Option<String>,
    input_bytes: Option<Vec<u8>>,
    input_index_bytes: Option<Vec<u8>>,
    reference_index_bytes: Option<Vec<u8>>,
    output_file: Option<String>,
    file_contents: Option<BTreeMap<String, String>>,
    participant_id: Option<String>,
    trace_report_path: Option<String>,
    timing_report_path: Option<String>,
    input_format: Option<String>,
    input_index: Option<String>,
    reference_file: Option<String>,
    reference_index: Option<String>,
    allow_md5_mismatch: Option<bool>,
    auto_index: Option<bool>,
    cache_dir: Option<String>,
    max_duration_ms: Option<u64>,
    max_memory_bytes: Option<usize>,
    max_allocations: Option<usize>,
    max_recursion_depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectBytesPayload {
    name: String,
    bytes: Vec<u8>,
    #[serde(default)]
    options: InspectOptionsPayload,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectOptionsPayload {
    detect_sex: Option<bool>,
    input_index_path: Option<String>,
    reference_file_path: Option<String>,
    reference_index_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileVariantYamlPayload {
    name: String,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveRemoteResourcePayload {
    source_url: String,
    name: String,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvePackageZipPayload {
    source_url: String,
    name: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyPackageArtifactPayload {
    name: String,
    bytes: Vec<u8>,
    expected: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPackageReportBytesPayload {
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    input_bytes: Vec<u8>,
    options: ReportOptionsInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPackageReportCramPayload {
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    cram_path: String,
    crai_bytes: Vec<u8>,
    fasta_path: String,
    fai_bytes: Vec<u8>,
    options: ReportOptionsInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPackageReportBamPayload {
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    bam_path: String,
    bai_bytes: Vec<u8>,
    options: ReportOptionsInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPackageReportVcfPayload {
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    vcf_path: String,
    tbi_bytes: Vec<u8>,
    options: ReportOptionsInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFileInput {
    path: String,
    contents: String,
    #[serde(default)]
    #[serde(alias = "source_url")]
    source_url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportOptionsInput {
    #[serde(default = "default_analysis_max_duration_ms")]
    analysis_max_duration_ms: u64,
    #[serde(default)]
    detect_sex: bool,
    #[serde(default)]
    filters: Vec<String>,
    #[serde(default)]
    output_dir: Option<String>,
    #[serde(default)]
    input_file_path: Option<String>,
    #[serde(default)]
    input_index_path: Option<String>,
    #[serde(default)]
    reference_file_path: Option<String>,
    #[serde(default)]
    reference_index_path: Option<String>,
    #[serde(default)]
    sample_sex: Option<String>,
}

impl ReportOptionsInput {
    fn inspect_options(&self, detect_sex: bool) -> InspectOptions {
        InspectOptions {
            input_index: self.input_index_path.as_ref().map(PathBuf::from),
            reference_file: self.reference_file_path.as_ref().map(PathBuf::from),
            reference_index: self.reference_index_path.as_ref().map(PathBuf::from),
            detect_sex,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupGenotypeRsidsPayload {
    name: String,
    bytes: Vec<u8>,
    rsids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupFileVariantsPayload {
    path: Option<String>,
    index_bytes: Vec<u8>,
    reference_path: Option<String>,
    reference_index_bytes: Option<Vec<u8>>,
    variants: Vec<VariantInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFileJs {
    path: String,
    contents: String,
    source_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageResourceJs {
    path: String,
    contents: String,
    resolution: RemoteResourceResolution,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageResolutionJs {
    entrypoint: String,
    files: Vec<PackageFileJs>,
    name: Option<String>,
    resources: Vec<PackageResourceJs>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageReleaseJs {
    artifact_sha256: Option<String>,
    artifact_size_bytes: Option<u64>,
    artifact_url: String,
    entrypoint: Option<String>,
    name: Option<String>,
    title: String,
    version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportArtifactOutput {
    name: String,
    path: String,
    mime_type: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRunOutput {
    artifacts: Vec<ReportArtifactOutput>,
    duration_ms: u128,
    text_output: String,
}

struct PackageDescriptor {
    entrypoint: PathBuf,
    name: Option<String>,
}

struct ExtractedPackageFile {
    path: PathBuf,
    contents: String,
}

struct PackageWorkspace {
    files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupGenotypePayload {
    name: String,
    bytes: Vec<u8>,
    variants: Vec<VariantInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantInput {
    name: String,
    chrom: String,
    #[serde(default)]
    pos: Option<i64>,
    #[serde(default)]
    start: Option<i64>,
    #[serde(default)]
    end: Option<i64>,
    #[serde(rename = "ref")]
    ref_base: String,
    #[serde(rename = "alt")]
    alt_base: String,
    #[serde(default)]
    observed_alts: Vec<String>,
    #[serde(default)]
    rsid: Option<String>,
    #[serde(default)]
    assembly: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    deletion_length: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRunFileResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_files: Option<BTreeMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRootJs {
    root: String,
    output_file: String,
    cache_dir: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectionJs {
    file_name: String,
    container: &'static str,
    detected_kind: &'static str,
    confidence: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    assembly: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phased: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<SourceJs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    selected_entry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_index: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference_matches: Option<bool>,
    evidence: Vec<String>,
    warnings: Vec<String>,
    duration_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceJs {
    vendor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    platform_version: Option<String>,
    confidence: &'static str,
    evidence: Vec<String>,
}

#[derive(Serialize)]
pub struct CompiledVariantSpecJs {
    name: String,
    chrom: String,
    start: i64,
    end: i64,
    #[serde(rename = "ref")]
    ref_base: String,
    #[serde(rename = "alt")]
    alt_base: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    rsid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assembly: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantLookupResultJs {
    duration_ms: u128,
    observations: Vec<VariantObservationJs>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantObservationJs {
    name: String,
    backend: String,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    reference: Option<String>,
    #[serde(rename = "alt", skip_serializing_if = "Option::is_none")]
    alternate: Option<String>,
    #[serde(rename = "matchedRsid", skip_serializing_if = "Option::is_none")]
    matched_rsid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assembly: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genotype: Option<String>,
    #[serde(rename = "refCount", skip_serializing_if = "Option::is_none")]
    ref_count: Option<u32>,
    #[serde(rename = "altCount", skip_serializing_if = "Option::is_none")]
    alt_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    depth: Option<u32>,
    #[serde(rename = "rawCounts")]
    raw_counts: BTreeMap<String, u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    decision: Option<String>,
    evidence: Vec<String>,
}

fn metadata_for_path(path: PathBuf) -> Result<DesktopLabFile, String> {
    let metadata = fs::metadata(&path).map_err(|error| format!("metadata failed: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("not a file: {}", path.display()));
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("invalid file name: {}", path.display()))?
        .to_owned();
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    Ok(DesktopLabFile {
        name,
        path: path.display().to_string(),
        size: metadata.len(),
        last_modified,
    })
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[tauri::command]
pub async fn lab_pick_files(app: AppHandle) -> Result<Vec<DesktopLabFile>, String> {
    let paths =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_files())
            .await
            .map_err(|error| format!("file picker failed: {error}"))?;
    let Some(paths) = paths else {
        return Ok(Vec::new());
    };

    paths
        .into_iter()
        .map(|path| {
            path.into_path()
                .map_err(|error| format!("invalid path: {error}"))
        })
        .map(|path| path.and_then(metadata_for_path))
        .collect()
}

#[tauri::command]
pub async fn lab_stat_paths(paths: Vec<String>) -> Result<Vec<DesktopLabFile>, String> {
    paths
        .into_iter()
        .map(PathBuf::from)
        .map(metadata_for_path)
        .collect()
}

#[tauri::command]
pub async fn lab_download_url_file(
    app: AppHandle,
    request: UrlFileRequest,
) -> Result<DesktopLabFile, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("biovault-app-desktop"))
        .join("lab-url-files");
    tauri::async_runtime::spawn_blocking(move || download_url_file_blocking(cache_dir, request))
        .await
        .map_err(|error| format!("download failed: {error}"))?
}

#[tauri::command]
pub async fn lab_cache_remote_url_file(
    app: AppHandle,
    request: UrlFileRequest,
) -> Result<CachedRemoteLabFileJs, String> {
    let cache_dir = remote_lab_file_cache_dir(&app);
    tauri::async_runtime::spawn_blocking(move || cache_remote_url_file_blocking(cache_dir, request))
        .await
        .map_err(|error| format!("download failed: {error}"))?
}

#[tauri::command]
pub async fn lab_cache_remote_bytes(
    app: AppHandle,
    request: CacheRemoteBytesRequest,
) -> Result<CachedRemoteLabFileJs, String> {
    let cache_dir = remote_lab_file_cache_dir(&app);
    tauri::async_runtime::spawn_blocking(move || cache_remote_bytes_blocking(cache_dir, request))
        .await
        .map_err(|error| format!("cache write failed: {error}"))?
}

#[tauri::command]
pub async fn lab_list_cached_remote_lab_files(
    app: AppHandle,
) -> Result<Vec<CachedRemoteLabFileJs>, String> {
    let cache_dir = remote_lab_file_cache_dir(&app);
    tauri::async_runtime::spawn_blocking(move || list_cached_remote_lab_files_blocking(cache_dir))
        .await
        .map_err(|error| format!("cache list failed: {error}"))?
}

#[tauri::command]
pub async fn lab_delete_cached_remote_lab_file(
    app: AppHandle,
    source_url: String,
) -> Result<(), String> {
    let cache_dir = remote_lab_file_cache_dir(&app);
    tauri::async_runtime::spawn_blocking(move || {
        delete_cached_remote_lab_file_blocking(cache_dir, &source_url)
    })
    .await
    .map_err(|error| format!("cache delete failed: {error}"))?
}

#[tauri::command]
pub async fn lab_fs_read_text(app: AppHandle, uri: String) -> Result<String, String> {
    let path = desktop_fs_uri_path(&app, &uri)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("read desktop file {} failed: {error}", path.display())),
    }
}

#[tauri::command]
pub async fn lab_fs_write_text(
    app: AppHandle,
    uri: String,
    contents: String,
) -> Result<(), String> {
    let path = desktop_fs_uri_path(&app, &uri)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create desktop file dir failed: {error}"))?;
    }
    fs::write(&path, contents)
        .map_err(|error| format!("write desktop file {} failed: {error}", path.display()))
}

#[tauri::command]
pub async fn lab_fs_delete(app: AppHandle, uri: String) -> Result<(), String> {
    let path = desktop_fs_uri_path(&app, &uri)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("delete desktop file {} failed: {error}", path.display())),
    }
}

#[tauri::command]
pub async fn lab_fs_info(app: AppHandle, uri: String) -> Result<DesktopFsInfo, String> {
    let path = desktop_fs_uri_path(&app, &uri)?;
    Ok(DesktopFsInfo {
        exists: path.exists(),
        uri,
    })
}

#[tauri::command]
pub async fn lab_read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|error| format!("read failed: {error}"))
}

#[tauri::command]
pub async fn lab_read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("read text failed: {error}"))
}

#[tauri::command]
pub async fn lab_run_assay(
    request: DesktopRunAssayRequest,
) -> Result<DesktopRunAssayResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_assay_blocking(request))
        .await
        .map_err(|error| format!("run failed: {error}"))?
}

#[tauri::command]
pub async fn lab_run_variant_yaml(
    request: DesktopRunAssayRequest,
) -> Result<DesktopRunAssayResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_variant_yaml_blocking(request))
        .await
        .map_err(|error| format!("run failed: {error}"))?
}

#[tauri::command]
pub async fn lab_run_file_request(
    request: DesktopRunFileRequest,
) -> Result<NativeRunFileResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_file_request_blocking(request))
        .await
        .map_err(|error| format!("run failed: {error}"))?
}

#[tauri::command]
pub async fn lab_prepare_runtime_root(
    app: AppHandle,
    output_file_name: String,
) -> Result<RuntimeRootJs, String> {
    let base = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("biovault-app-desktop"))
        .join("lab-runtime")
        .join(format!(
            "run-{}-{}",
            now_millis(),
            std::process::id()
        ));
    fs::create_dir_all(base.join("inputs"))
        .map_err(|error| format!("create runtime inputs dir failed: {error}"))?;
    fs::create_dir_all(base.join(".bioscript-cache"))
        .map_err(|error| format!("create runtime cache dir failed: {error}"))?;
    Ok(RuntimeRootJs {
        root: base.display().to_string(),
        output_file: output_file_name,
        cache_dir: Some(".bioscript-cache".to_owned()),
    })
}

#[tauri::command]
pub async fn lab_inspect_bytes(
    name: String,
    bytes: Vec<u8>,
    options: InspectOptionsPayload,
) -> Result<InspectionJs, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_bytes_blocking(name, bytes, options))
        .await
        .map_err(|error| format!("inspect failed: {error}"))?
}

#[tauri::command]
pub async fn lab_compile_variant_yaml_text(
    name: String,
    text: String,
) -> Result<Vec<CompiledVariantSpecJs>, String> {
    tauri::async_runtime::spawn_blocking(move || compile_variant_yaml_text_blocking(&name, &text))
        .await
        .map_err(|error| format!("compile failed: {error}"))?
}

#[tauri::command]
pub async fn lab_lookup_genotype_bytes_variants(
    name: String,
    bytes: Vec<u8>,
    variants: Vec<VariantInput>,
) -> Result<VariantLookupResultJs, String> {
    tauri::async_runtime::spawn_blocking(move || {
        lookup_genotype_bytes_variants_blocking(&name, &bytes, variants)
    })
    .await
        .map_err(|error| format!("lookup failed: {error}"))?
}

#[tauri::command]
pub async fn lab_lookup_genotype_bytes_rsids(
    name: String,
    bytes: Vec<u8>,
    rsids: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || lookup_genotype_bytes_rsids_blocking(&name, &bytes, rsids))
        .await
        .map_err(|error| format!("lookup rsids failed: {error}"))?
}

#[tauri::command]
pub async fn lab_lookup_cram_variants(
    request: LookupFileVariantsPayload,
) -> Result<VariantLookupResultJs, String> {
    tauri::async_runtime::spawn_blocking(move || lookup_cram_variants_blocking(request))
        .await
        .map_err(|error| format!("CRAM lookup failed: {error}"))?
}

#[tauri::command]
pub async fn lab_lookup_bam_variants(
    request: LookupFileVariantsPayload,
) -> Result<VariantLookupResultJs, String> {
    tauri::async_runtime::spawn_blocking(move || lookup_bam_variants_blocking(request))
        .await
        .map_err(|error| format!("BAM lookup failed: {error}"))?
}

#[tauri::command]
pub async fn lab_lookup_vcf_variants(
    request: LookupFileVariantsPayload,
) -> Result<VariantLookupResultJs, String> {
    tauri::async_runtime::spawn_blocking(move || lookup_vcf_variants_blocking(request))
        .await
        .map_err(|error| format!("VCF lookup failed: {error}"))?
}

#[tauri::command]
pub async fn lab_resolve_remote_resource_text(
    source_url: String,
    name: String,
    text: String,
) -> Result<RemoteResourceResolution, String> {
    tauri::async_runtime::spawn_blocking(move || {
        resolve_remote_resource_text_rs(&source_url, &name, &text)
    })
    .await
    .map_err(|error| format!("resolve remote resource failed: {error}"))?
}

#[tauri::command]
pub async fn lab_resolve_package_release_text(
    source_url: String,
    name: String,
    text: String,
) -> Result<PackageReleaseJs, String> {
    tauri::async_runtime::spawn_blocking(move || {
        resolve_package_release_text_blocking(&source_url, &name, &text)
    })
    .await
    .map_err(|error| format!("resolve package release failed: {error}"))?
}

#[tauri::command]
pub async fn lab_resolve_package_zip_bytes(
    source_url: String,
    name: String,
    bytes: Vec<u8>,
) -> Result<PackageResolutionJs, String> {
    tauri::async_runtime::spawn_blocking(move || {
        resolve_package_zip_bytes_blocking(&source_url, &name, &bytes)
    })
    .await
    .map_err(|error| format!("resolve package zip failed: {error}"))?
}

#[tauri::command]
pub async fn lab_verify_package_artifact_sha256(
    name: String,
    bytes: Vec<u8>,
    expected: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        verify_package_artifact_sha256_blocking(&name, &bytes, &expected)
    })
    .await
    .map_err(|error| format!("verify package artifact failed: {error}"))?
}

#[tauri::command]
pub async fn lab_run_package_report_bytes(
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    input_bytes: Vec<u8>,
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_package_report_bytes_blocking(
            &manifest_path,
            package_files,
            &input_name,
            &input_bytes,
            options,
        )
    })
    .await
    .map_err(|error| format!("run package report failed: {error}"))?
}

#[tauri::command]
pub async fn lab_run_package_report_from_cram(
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    cram_path: String,
    crai_bytes: Vec<u8>,
    fasta_path: String,
    fai_bytes: Vec<u8>,
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_package_report_from_cram_blocking(
            &manifest_path,
            package_files,
            &input_name,
            &cram_path,
            &crai_bytes,
            &fasta_path,
            &fai_bytes,
            options,
        )
    })
    .await
    .map_err(|error| format!("run CRAM package report failed: {error}"))?
}

#[tauri::command]
pub async fn lab_run_package_report_from_bam(
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    bam_path: String,
    bai_bytes: Vec<u8>,
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_package_report_from_bam_blocking(
            &manifest_path,
            package_files,
            &input_name,
            &bam_path,
            &bai_bytes,
            options,
        )
    })
    .await
    .map_err(|error| format!("run BAM package report failed: {error}"))?
}

#[tauri::command]
pub async fn lab_run_package_report_from_vcf(
    manifest_path: String,
    package_files: Vec<PackageFileInput>,
    input_name: String,
    vcf_path: String,
    tbi_bytes: Vec<u8>,
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_package_report_from_vcf_blocking(
            &manifest_path,
            package_files,
            &input_name,
            &vcf_path,
            &tbi_bytes,
            options,
        )
    })
    .await
    .map_err(|error| format!("run VCF package report failed: {error}"))?
}

pub async fn handle_ws_lab_request(
    action: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match action {
        "stat_paths" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                paths: Vec<String>,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid stat_paths payload: {error}"))?;
            serde_json::to_value(lab_stat_paths(payload.paths).await?)
                .map_err(|error| format!("encode stat_paths response: {error}"))
        }
        "read_file_bytes" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                path: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid read_file_bytes payload: {error}"))?;
            serde_json::to_value(lab_read_file_bytes(payload.path).await?)
                .map_err(|error| format!("encode read_file_bytes response: {error}"))
        }
        "read_file_text" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                path: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid read_file_text payload: {error}"))?;
            serde_json::to_value(lab_read_file_text(payload.path).await?)
                .map_err(|error| format!("encode read_file_text response: {error}"))
        }
        "download_url_file" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: UrlFileRequest,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid download_url_file payload: {error}"))?;
            let cache_dir = std::env::temp_dir()
                .join("biovault-app-desktop")
                .join("lab-url-files");
            let file = tauri::async_runtime::spawn_blocking(move || {
                download_url_file_blocking(cache_dir, payload.request)
            })
            .await
            .map_err(|error| format!("download failed: {error}"))??;
            serde_json::to_value(file).map_err(|error| format!("encode download response: {error}"))
        }
        "cache_remote_url_file" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: UrlFileRequest,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid cache_remote_url_file payload: {error}"))?;
            let cache_dir = std::env::temp_dir()
                .join("biovault-app-desktop")
                .join("remote-lab-files");
            let file = cache_remote_url_file_blocking(cache_dir, payload.request)?;
            serde_json::to_value(file)
                .map_err(|error| format!("encode cached file response: {error}"))
        }
        "cache_remote_bytes" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: CacheRemoteBytesRequest,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid cache_remote_bytes payload: {error}"))?;
            let cache_dir = std::env::temp_dir()
                .join("biovault-app-desktop")
                .join("remote-lab-files");
            let file = cache_remote_bytes_blocking(cache_dir, payload.request)?;
            serde_json::to_value(file)
                .map_err(|error| format!("encode cached file response: {error}"))
        }
        "list_cached_remote_lab_files" => {
            let cache_dir = std::env::temp_dir()
                .join("biovault-app-desktop")
                .join("remote-lab-files");
            serde_json::to_value(list_cached_remote_lab_files_blocking(cache_dir)?)
                .map_err(|error| format!("encode cached file list: {error}"))
        }
        "delete_cached_remote_lab_file" => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Payload {
                source_url: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid delete_cached_remote_lab_file payload: {error}"))?;
            let cache_dir = std::env::temp_dir()
                .join("biovault-app-desktop")
                .join("remote-lab-files");
            delete_cached_remote_lab_file_blocking(cache_dir, &payload.source_url)?;
            Ok(serde_json::Value::Null)
        }
        "fs_read_text" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                uri: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid fs_read_text payload: {error}"))?;
            serde_json::to_value(lab_fs_read_text_for_bridge(payload.uri)?)
                .map_err(|error| format!("encode fs read response: {error}"))
        }
        "fs_write_text" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                uri: String,
                contents: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid fs_write_text payload: {error}"))?;
            lab_fs_write_text_for_bridge(payload.uri, payload.contents)?;
            Ok(serde_json::Value::Null)
        }
        "fs_delete" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                uri: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid fs_delete payload: {error}"))?;
            lab_fs_delete_for_bridge(payload.uri)?;
            Ok(serde_json::Value::Null)
        }
        "fs_info" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                uri: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid fs_info payload: {error}"))?;
            serde_json::to_value(lab_fs_info_for_bridge(payload.uri)?)
                .map_err(|error| format!("encode fs info response: {error}"))
        }
        "run_assay" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: DesktopRunAssayRequest,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_assay payload: {error}"))?;
            let result =
                tauri::async_runtime::spawn_blocking(move || run_assay_blocking(payload.request))
                    .await
                    .map_err(|error| format!("run failed: {error}"))??;
            serde_json::to_value(result).map_err(|error| format!("encode run response: {error}"))
        }
        "run_variant_yaml" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: DesktopRunAssayRequest,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_variant_yaml payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                run_variant_yaml_blocking(payload.request)
            })
            .await
            .map_err(|error| format!("run failed: {error}"))??;
            serde_json::to_value(result).map_err(|error| format!("encode run response: {error}"))
        }
        "run_file_request" => {
            let payload: RunFilePayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_file_request payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                run_file_request_blocking(payload.request)
            })
            .await
            .map_err(|error| format!("run failed: {error}"))??;
            serde_json::to_value(result).map_err(|error| format!("encode run response: {error}"))
        }
        "prepare_runtime_root" => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Payload {
                output_file_name: String,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid prepare_runtime_root payload: {error}"))?;
            let base = std::env::temp_dir()
                .join("biovault-app-desktop")
                .join("lab-runtime")
                .join(format!("run-{}-{}", now_millis(), std::process::id()));
            fs::create_dir_all(base.join("inputs"))
                .map_err(|error| format!("create runtime inputs dir failed: {error}"))?;
            fs::create_dir_all(base.join(".bioscript-cache"))
                .map_err(|error| format!("create runtime cache dir failed: {error}"))?;
            serde_json::to_value(RuntimeRootJs {
                root: base.display().to_string(),
                output_file: payload.output_file_name,
                cache_dir: Some(".bioscript-cache".to_owned()),
            })
            .map_err(|error| format!("encode runtime root response: {error}"))
        }
        "inspect_bytes" => {
            let payload: InspectBytesPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid inspect_bytes payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                inspect_bytes_blocking(payload.name, payload.bytes, payload.options)
            })
            .await
            .map_err(|error| format!("inspect failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode inspect response: {error}"))
        }
        "compile_variant_yaml_text" => {
            let payload: CompileVariantYamlPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid compile_variant_yaml_text payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                compile_variant_yaml_text_blocking(&payload.name, &payload.text)
            })
            .await
            .map_err(|error| format!("compile failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode compile response: {error}"))
        }
        "lookup_genotype_bytes_variants" => {
            let payload: LookupGenotypePayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid lookup_genotype_bytes_variants payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                lookup_genotype_bytes_variants_blocking(&payload.name, &payload.bytes, payload.variants)
            })
            .await
            .map_err(|error| format!("lookup failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode lookup response: {error}"))
        }
        "lookup_genotype_bytes_rsids" => {
            let payload: LookupGenotypeRsidsPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid lookup_genotype_bytes_rsids payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                lookup_genotype_bytes_rsids_blocking(&payload.name, &payload.bytes, payload.rsids)
            })
            .await
            .map_err(|error| format!("lookup rsids failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode rsid lookup response: {error}"))
        }
        "lookup_cram_variants" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: LookupFileVariantsPayload,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid lookup_cram_variants payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                lookup_cram_variants_blocking(payload.request)
            })
            .await
            .map_err(|error| format!("CRAM lookup failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode CRAM lookup response: {error}"))
        }
        "lookup_bam_variants" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: LookupFileVariantsPayload,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid lookup_bam_variants payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                lookup_bam_variants_blocking(payload.request)
            })
            .await
            .map_err(|error| format!("BAM lookup failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode BAM lookup response: {error}"))
        }
        "lookup_vcf_variants" => {
            #[derive(serde::Deserialize)]
            struct Payload {
                request: LookupFileVariantsPayload,
            }
            let payload: Payload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid lookup_vcf_variants payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                lookup_vcf_variants_blocking(payload.request)
            })
            .await
            .map_err(|error| format!("VCF lookup failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode VCF lookup response: {error}"))
        }
        "resolve_remote_resource_text" => {
            let payload: ResolveRemoteResourcePayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid resolve_remote_resource_text payload: {error}"))?;
            let result = resolve_remote_resource_text_rs(&payload.source_url, &payload.name, &payload.text)?;
            serde_json::to_value(result)
                .map_err(|error| format!("encode remote resource response: {error}"))
        }
        "resolve_package_release_text" => {
            let payload: ResolveRemoteResourcePayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid resolve_package_release_text payload: {error}"))?;
            let result = resolve_package_release_text_blocking(&payload.source_url, &payload.name, &payload.text)?;
            serde_json::to_value(result)
                .map_err(|error| format!("encode package release response: {error}"))
        }
        "resolve_package_zip_bytes" => {
            let payload: ResolvePackageZipPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid resolve_package_zip_bytes payload: {error}"))?;
            let result = resolve_package_zip_bytes_blocking(&payload.source_url, &payload.name, &payload.bytes)?;
            serde_json::to_value(result)
                .map_err(|error| format!("encode package zip response: {error}"))
        }
        "verify_package_artifact_sha256" => {
            let payload: VerifyPackageArtifactPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid verify_package_artifact_sha256 payload: {error}"))?;
            verify_package_artifact_sha256_blocking(&payload.name, &payload.bytes, &payload.expected)?;
            Ok(serde_json::Value::Null)
        }
        "run_package_report_bytes" => {
            let payload: RunPackageReportBytesPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_package_report_bytes payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                run_package_report_bytes_blocking(
                    &payload.manifest_path,
                    payload.package_files,
                    &payload.input_name,
                    &payload.input_bytes,
                    payload.options,
                )
            })
            .await
            .map_err(|error| format!("run package report failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode package report response: {error}"))
        }
        "run_package_report_from_cram" => {
            let payload: RunPackageReportCramPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_package_report_from_cram payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                run_package_report_from_cram_blocking(
                    &payload.manifest_path,
                    payload.package_files,
                    &payload.input_name,
                    &payload.cram_path,
                    &payload.crai_bytes,
                    &payload.fasta_path,
                    &payload.fai_bytes,
                    payload.options,
                )
            })
            .await
            .map_err(|error| format!("run CRAM package report failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode CRAM package report response: {error}"))
        }
        "run_package_report_from_bam" => {
            let payload: RunPackageReportBamPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_package_report_from_bam payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                run_package_report_from_bam_blocking(
                    &payload.manifest_path,
                    payload.package_files,
                    &payload.input_name,
                    &payload.bam_path,
                    &payload.bai_bytes,
                    payload.options,
                )
            })
            .await
            .map_err(|error| format!("run BAM package report failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode BAM package report response: {error}"))
        }
        "run_package_report_from_vcf" => {
            let payload: RunPackageReportVcfPayload = serde_json::from_value(payload)
                .map_err(|error| format!("invalid run_package_report_from_vcf payload: {error}"))?;
            let result = tauri::async_runtime::spawn_blocking(move || {
                run_package_report_from_vcf_blocking(
                    &payload.manifest_path,
                    payload.package_files,
                    &payload.input_name,
                    &payload.vcf_path,
                    &payload.tbi_bytes,
                    payload.options,
                )
            })
            .await
            .map_err(|error| format!("run VCF package report failed: {error}"))??;
            serde_json::to_value(result)
                .map_err(|error| format!("encode VCF package report response: {error}"))
        }
        other => Err(format!("unknown lab action: {other}")),
    }
}

fn run_file_request_blocking(request: DesktopRunFileRequest) -> Result<NativeRunFileResult, String> {
    let output_file = request.output_file.clone();
    let root = request.root.clone();
    if let (Some(root), Some(input_file), Some(bytes)) =
        (request.root.as_deref(), request.input_file.as_deref(), request.input_bytes.as_deref())
    {
        write_runtime_bytes(root, input_file, bytes)?;
    }
    if let (Some(root), Some(input_index), Some(bytes)) =
        (request.root.as_deref(), request.input_index.as_deref(), request.input_index_bytes.as_deref())
    {
        write_runtime_bytes(root, input_index, bytes)?;
    }
    if let (Some(root), Some(reference_index), Some(bytes)) =
        (
            request.root.as_deref(),
            request.reference_index.as_deref(),
            request.reference_index_bytes.as_deref(),
        )
    {
        write_runtime_bytes(root, reference_index, bytes)?;
    }
    let ffi_request = request.into_ffi();
    let RunFileResult { ok } = run_file_request(ffi_request)?;
    let output_text = output_file
        .as_deref()
        .and_then(|path| read_runtime_output(root.as_deref(), path).ok());
    Ok(NativeRunFileResult {
        ok,
        output_text,
        output_files: None,
    })
}

impl DesktopRunFileRequest {
    fn into_ffi(self) -> RunFileRequest {
        RunFileRequest {
            script_path: self.script_path,
            script_contents: self.script_contents,
            root: self.root,
            input_file: self.input_file,
            input_contents: self.input_contents,
            output_file: self.output_file,
            file_contents: self.file_contents,
            participant_id: self.participant_id,
            trace_report_path: self.trace_report_path,
            timing_report_path: self.timing_report_path,
            input_format: self.input_format,
            input_index: self.input_index,
            reference_file: self.reference_file,
            reference_index: self.reference_index,
            allow_md5_mismatch: self.allow_md5_mismatch,
            auto_index: self.auto_index,
            cache_dir: self.cache_dir,
            max_duration_ms: self.max_duration_ms,
            max_memory_bytes: self.max_memory_bytes,
            max_allocations: self.max_allocations,
            max_recursion_depth: self.max_recursion_depth,
        }
    }
}

fn write_runtime_bytes(root: &str, path: &str, bytes: &[u8]) -> Result<(), String> {
    let target = resolve_runtime_path(root, path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create runtime file dir failed: {error}"))?;
    }
    fs::write(&target, bytes)
        .map_err(|error| format!("write runtime file {} failed: {error}", target.display()))
}

fn resolve_runtime_path(root: &str, path: &str) -> PathBuf {
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() {
        candidate
    } else {
        PathBuf::from(root).join(candidate)
    }
}

fn inspect_bytes_blocking(
    name: String,
    bytes: Vec<u8>,
    options: InspectOptionsPayload,
) -> Result<InspectionJs, String> {
    let options = InspectOptions {
        input_index: options.input_index_path.map(PathBuf::from),
        reference_file: options.reference_file_path.map(PathBuf::from),
        reference_index: options.reference_index_path.map(PathBuf::from),
        detect_sex: options.detect_sex.unwrap_or(false),
    };
    inspect_bytes_rs(&name, &bytes, &options)
        .map(InspectionJs::from)
        .map_err(|error| format!("inspect_bytes failed: {error:?}"))
}

fn compile_variant_yaml_text_blocking(
    name: &str,
    text: &str,
) -> Result<Vec<CompiledVariantSpecJs>, String> {
    let manifest = load_variant_manifest_text_for_lookup(name, text)
        .map_err(|error| format!("compile variant YAML failed: {error}"))?;
    let spec = manifest.spec;
    let ref_base = spec
        .reference
        .clone()
        .ok_or_else(|| format!("variant {}: alleles.ref missing", manifest.name))?;
    let alt_base = spec
        .alternate
        .clone()
        .ok_or_else(|| format!("variant {}: alleles.alts missing", manifest.name))?;
    let rsid = spec.rsids.first().cloned();
    let kind = spec.kind.map(render_variant_kind).map(str::to_owned);
    let mut out = Vec::new();
    if let Some(locus) = spec.grch38 {
        out.push(CompiledVariantSpecJs {
            name: manifest.name.clone(),
            chrom: locus.chrom,
            start: locus.start,
            end: locus.end,
            ref_base: ref_base.clone(),
            alt_base: alt_base.clone(),
            rsid: rsid.clone(),
            assembly: Some("grch38".to_owned()),
            kind: kind.clone(),
        });
    }
    if let Some(locus) = spec.grch37 {
        out.push(CompiledVariantSpecJs {
            name: if out.is_empty() {
                manifest.name.clone()
            } else {
                format!("{}_grch37", manifest.name)
            },
            chrom: locus.chrom,
            start: locus.start,
            end: locus.end,
            ref_base,
            alt_base,
            rsid,
            assembly: Some("grch37".to_owned()),
            kind,
        });
    }
    if out.is_empty() {
        return Err(format!("variant {} has no coordinates", manifest.name));
    }
    Ok(out)
}

fn lookup_genotype_bytes_variants_blocking(
    name: &str,
    bytes: &[u8],
    variants: Vec<VariantInput>,
) -> Result<VariantLookupResultJs, String> {
    let started = SystemTime::now();
    let store = GenotypeStore::from_bytes(name, bytes)
        .map_err(|error| format!("load genotype bytes {name}: {error:?}"))?;
    let specs = variants
        .iter()
        .map(variant_input_to_spec)
        .collect::<Result<Vec<_>, _>>()?;
    let observations = store
        .lookup_variants(&specs)
        .map_err(|error| format!("lookup genotype bytes {name}: {error:?}"))?;
    Ok(VariantLookupResultJs {
        duration_ms: started
            .elapsed()
            .map(|duration| duration.as_millis())
            .unwrap_or(0),
        observations: variants
            .into_iter()
            .zip(observations)
            .map(|(variant, observation)| observation_to_js(variant, observation))
            .collect(),
    })
}

fn lookup_genotype_bytes_rsids_blocking(
    name: &str,
    bytes: &[u8],
    rsids: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    let store = GenotypeStore::from_bytes(name, bytes)
        .map_err(|error| format!("load genotype bytes {name}: {error:?}"))?;
    rsids
        .iter()
        .map(|rsid| {
            store
                .get(rsid)
                .map_err(|error| format!("lookup genotype rsid {rsid}: {error:?}"))
        })
        .collect()
}

fn lookup_cram_variants_blocking(request: LookupFileVariantsPayload) -> Result<VariantLookupResultJs, String> {
    let started = SystemTime::now();
    let cram_path = request.path.ok_or_else(|| "CRAM lookup requires a file path".to_owned())?;
    let fasta_path = request
        .reference_path
        .ok_or_else(|| "CRAM lookup requires a reference FASTA path".to_owned())?;
    let crai_index = bioscript_formats::alignment::parse_crai_bytes(&request.index_bytes)
        .map_err(|error| format!("parse crai: {error:?}"))?;
    let fai_bytes = request
        .reference_index_bytes
        .ok_or_else(|| "CRAM lookup requires FAI bytes".to_owned())?;
    let fai_index = bioscript_formats::alignment::parse_fai_bytes(&fai_bytes)
        .map_err(|error| format!("parse fai: {error:?}"))?;
    let fasta = File::open(&fasta_path).map_err(|error| format!("open FASTA {fasta_path}: {error}"))?;
    let repository =
        bioscript_formats::alignment::build_reference_repository_from_readers(BufReader::new(fasta), fai_index);
    let cram = File::open(&cram_path).map_err(|error| format!("open CRAM {cram_path}: {error}"))?;
    let mut indexed = bioscript_formats::alignment::build_cram_indexed_reader_from_reader(
        cram, crai_index, repository,
    )
    .map_err(|error| format!("build cram reader: {error:?}"))?;
    let variants = request.variants;
    let mut observations = Vec::with_capacity(variants.len());
    for variant in &variants {
        let spec = variant_input_to_spec(variant)?;
        observations.push(observe_cram_variant(&mut indexed, &cram_path, &spec)
            .map_err(|error| format!("CRAM lookup {}: {error:?}", variant.name))?);
    }
    Ok(VariantLookupResultJs {
        duration_ms: started.elapsed().map(|duration| duration.as_millis()).unwrap_or(0),
        observations: variants
            .into_iter()
            .zip(observations)
            .map(|(variant, observation)| observation_to_js(variant, observation))
            .collect(),
    })
}

fn lookup_bam_variants_blocking(request: LookupFileVariantsPayload) -> Result<VariantLookupResultJs, String> {
    let started = SystemTime::now();
    let bam_path = request.path.ok_or_else(|| "BAM lookup requires a file path".to_owned())?;
    let bai_index = bioscript_formats::alignment::parse_bai_bytes(&request.index_bytes)
        .map_err(|error| format!("parse bai: {error:?}"))?;
    let bam = File::open(&bam_path).map_err(|error| format!("open BAM {bam_path}: {error}"))?;
    let mut indexed = bioscript_formats::alignment::build_bam_indexed_reader_from_reader(bam, bai_index)
        .map_err(|error| format!("build bam reader: {error:?}"))?;
    let variants = request.variants;
    let mut observations = Vec::with_capacity(variants.len());
    for variant in &variants {
        let spec = variant_input_to_spec(variant)?;
        observations.push(bioscript_formats::observe_bam_variant(&mut indexed, &bam_path, &spec)
            .map_err(|error| format!("BAM lookup {}: {error:?}", variant.name))?);
    }
    Ok(VariantLookupResultJs {
        duration_ms: started.elapsed().map(|duration| duration.as_millis()).unwrap_or(0),
        observations: variants
            .into_iter()
            .zip(observations)
            .map(|(variant, observation)| observation_to_js(variant, observation))
            .collect(),
    })
}

fn lookup_vcf_variants_blocking(request: LookupFileVariantsPayload) -> Result<VariantLookupResultJs, String> {
    let started = SystemTime::now();
    let vcf_path = request.path.ok_or_else(|| "VCF lookup requires a file path".to_owned())?;
    let tabix_index = bioscript_formats::alignment::parse_tbi_bytes(&request.index_bytes)
        .map_err(|error| format!("parse tbi: {error:?}"))?;
    let detected_assembly = detect_vcf_assembly_from_path(Path::new(&vcf_path));
    let vcf = File::open(&vcf_path).map_err(|error| format!("open VCF {vcf_path}: {error}"))?;
    let mut indexed = noodles::csi::io::IndexedReader::new(vcf, tabix_index);
    let variants = request.variants;
    let mut observations = Vec::with_capacity(variants.len());
    for variant in &variants {
        let spec = variant_input_to_spec(variant)?;
        observations.push(observe_vcf_variant(&mut indexed, &vcf_path, &spec, detected_assembly)
            .map_err(|error| format!("VCF lookup {}: {error:?}", variant.name))?);
    }
    Ok(VariantLookupResultJs {
        duration_ms: started.elapsed().map(|duration| duration.as_millis()).unwrap_or(0),
        observations: variants
            .into_iter()
            .zip(observations)
            .map(|(variant, observation)| observation_to_js(variant, observation))
            .collect(),
    })
}

const PACKAGE_DESCRIPTOR: &str = "manifest.yaml";
const LEGACY_PACKAGE_DESCRIPTOR: &str = "bioscript-package.yaml";
const MAX_PACKAGE_FILES: usize = 1000;
const MAX_PACKAGE_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PACKAGE_TOTAL_BYTES: u64 = 64 * 1024 * 1024;

fn resolve_package_zip_bytes_blocking(
    source_url: &str,
    name: &str,
    bytes: &[u8],
) -> Result<PackageResolutionJs, String> {
    let files = extract_package_zip(name, bytes)?;
    let descriptor = load_package_descriptor(&files)?;
    let entrypoint = descriptor.entrypoint.display().to_string();
    let entry_file = files
        .iter()
        .find(|file| file.path == descriptor.entrypoint)
        .ok_or_else(|| format!("package entrypoint not found: {entrypoint}"))?;
    let entry_resolution = resolve_remote_resource_text_rs(
        &package_member_url(source_url, &descriptor.entrypoint),
        &entrypoint,
        &entry_file.contents,
    )
    .map_err(|err| format!("resolve package entrypoint failed: {err}"))?;
    match entry_resolution.kind {
        RemoteResourceKind::Assay
        | RemoteResourceKind::Panel
        | RemoteResourceKind::Python
        | RemoteResourceKind::Variant => {}
        _ => {
            return Err(format!(
                "package entrypoint has unsupported resource kind: {:?}",
                entry_resolution.kind
            ));
        }
    }

    let mut resources = Vec::new();
    for file in &files {
        if !is_resource_file(&file.path) {
            continue;
        }
        let path = file.path.display().to_string();
        let resolution = resolve_remote_resource_text_rs(
            &package_member_url(source_url, &file.path),
            &path,
            &file.contents,
        )
        .map_err(|err| format!("resolve package member {path} failed: {err}"))?;
        if matches!(
            resolution.kind,
            RemoteResourceKind::Assay
                | RemoteResourceKind::Panel
                | RemoteResourceKind::Python
                | RemoteResourceKind::Variant
        ) {
            resources.push(PackageResourceJs {
                path,
                contents: file.contents.clone(),
                resolution,
            });
        }
    }

    let files_js = files
        .iter()
        .map(|file| PackageFileJs {
            path: file.path.display().to_string(),
            contents: file.contents.clone(),
            source_url: package_member_url(source_url, &file.path),
        })
        .collect();

    Ok(PackageResolutionJs {
        entrypoint,
        files: files_js,
        name: descriptor.name,
        resources,
    })
}

fn resolve_package_release_text_blocking(
    source_url: &str,
    name: &str,
    text: &str,
) -> Result<PackageReleaseJs, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(text)
        .map_err(|err| format!("failed to parse package release {name}: {err}"))?;
    let schema = yaml_string(&value, "schema");
    if schema.as_deref() != Some("bioscript:package-release:1.0") {
        return Err(format!("{name} is not a bioscript:package-release:1.0 manifest"));
    }
    let artifact = value
        .as_mapping()
        .and_then(|mapping| mapping.get(serde_yaml::Value::String("artifact".to_owned())))
        .and_then(serde_yaml::Value::as_mapping)
        .ok_or_else(|| format!("package release {name} is missing artifact"))?;
    let artifact_path = artifact
        .get(serde_yaml::Value::String("path".to_owned()))
        .and_then(serde_yaml::Value::as_str);
    let artifact_url = artifact
        .get(serde_yaml::Value::String("url".to_owned()))
        .and_then(serde_yaml::Value::as_str);
    let artifact_url = if let Some(url) = artifact_url {
        url.to_owned()
    } else if let Some(relative) = artifact_path {
        join_url(source_url, relative)
    } else {
        return Err(format!("package release {name} artifact needs path or url"));
    };

    Ok(PackageReleaseJs {
        artifact_sha256: artifact
            .get(serde_yaml::Value::String("sha256".to_owned()))
            .and_then(serde_yaml::Value::as_str)
            .map(ToOwned::to_owned),
        artifact_size_bytes: artifact
            .get(serde_yaml::Value::String("size_bytes".to_owned()))
            .and_then(serde_yaml::Value::as_u64),
        artifact_url,
        entrypoint: scalar_at(&value, "entrypoint"),
        name: scalar_at(&value, "name"),
        title: scalar_at(&value, "label")
            .or_else(|| scalar_at(&value, "title"))
            .or_else(|| scalar_at(&value, "name"))
            .unwrap_or_else(|| name.to_owned()),
        version: scalar_at(&value, "package_version").or_else(|| scalar_at(&value, "version")),
    })
}

fn verify_package_artifact_sha256_blocking(
    name: &str,
    bytes: &[u8],
    expected: &str,
) -> Result<(), String> {
    let actual = sha256_hex(bytes);
    if actual != expected {
        return Err(format!(
            "package artifact sha256 mismatch for {name}: expected {expected}, got {actual}"
        ));
    }
    Ok(())
}

fn extract_package_zip(name: &str, bytes: &[u8]) -> Result<Vec<ExtractedPackageFile>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|err| format!("failed to read package zip {name}: {err}"))?;
    if archive.len() > MAX_PACKAGE_FILES {
        return Err(format!("package has too many entries: {} > {MAX_PACKAGE_FILES}", archive.len()));
    }
    let mut seen = BTreeSet::new();
    let mut total_size = 0_u64;
    let mut files = Vec::new();
    for idx in 0..archive.len() {
        let mut entry = archive
            .by_index(idx)
            .map_err(|err| format!("failed to read package zip entry {idx}: {err}"))?;
        let Some(enclosed) = entry.enclosed_name() else {
            return Err(format!("package zip entry has unsafe path: {}", entry.name()));
        };
        let relative = checked_relative_package_path(&enclosed.to_string_lossy())?;
        if entry.is_dir() {
            continue;
        }
        if entry.unix_mode().is_some_and(|mode| mode & 0o170_000 == 0o120_000) {
            return Err(format!("package zip entry is a symlink: {}", entry.name()));
        }
        if !is_allowed_package_file(&relative) {
            return Err(format!("package zip entry has unsupported extension: {}", relative.display()));
        }
        if entry.size() > MAX_PACKAGE_FILE_BYTES {
            return Err(format!("package file too large: {}", relative.display()));
        }
        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| "package total size overflow".to_owned())?;
        if total_size > MAX_PACKAGE_TOTAL_BYTES {
            return Err(format!("package total size exceeds {MAX_PACKAGE_TOTAL_BYTES} bytes"));
        }
        if !seen.insert(relative.clone()) {
            return Err(format!("package has duplicate path: {}", relative.display()));
        }
        let mut contents = String::new();
        entry
            .read_to_string(&mut contents)
            .map_err(|err| format!("package file is not UTF-8 {}: {err}", relative.display()))?;
        files.push(ExtractedPackageFile {
            path: relative,
            contents,
        });
    }
    if files.is_empty() {
        return Err("package zip did not contain files".to_owned());
    }
    Ok(files)
}

fn load_package_descriptor(files: &[ExtractedPackageFile]) -> Result<PackageDescriptor, String> {
    let descriptor_file = files
        .iter()
        .find(|file| file.path == Path::new(PACKAGE_DESCRIPTOR))
        .or_else(|| files.iter().find(|file| file.path == Path::new(LEGACY_PACKAGE_DESCRIPTOR)));
    let Some(descriptor_file) = descriptor_file else {
        let entrypoint = files
            .iter()
            .find(|file| is_resource_file(&file.path))
            .map(|file| file.path.clone())
            .ok_or_else(|| "package has no manifest.yaml or runnable resource".to_owned())?;
        return Ok(PackageDescriptor {
            entrypoint,
            name: None,
        });
    };
    let value: serde_yaml::Value = serde_yaml::from_str(&descriptor_file.contents)
        .map_err(|err| format!("failed to parse {}: {err}", descriptor_file.path.display()))?;
    let entrypoint = scalar_at(&value, "entrypoint")
        .or_else(|| scalar_at(&value, "main"))
        .ok_or_else(|| format!("{} is missing entrypoint", descriptor_file.path.display()))?;
    let entrypoint = checked_relative_package_path(&entrypoint)?;
    Ok(PackageDescriptor {
        entrypoint,
        name: scalar_at(&value, "name"),
    })
}

fn checked_relative_package_path(path: &str) -> Result<PathBuf, String> {
    let normalized = path.replace('\\', "/");
    let candidate = Path::new(&normalized);
    if candidate.is_absolute() {
        return Err(format!("package path must be relative: {path}"));
    }
    let mut out = PathBuf::new();
    for component in candidate.components() {
        match component {
            std::path::Component::Normal(part) => out.push(part),
            std::path::Component::CurDir => {}
            _ => return Err(format!("package path contains unsafe component: {path}")),
        }
    }
    if out.as_os_str().is_empty() {
        return Err("package path is empty".to_owned());
    }
    Ok(out)
}

fn is_allowed_package_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "yaml" | "yml" | "py" | "json" | "txt" | "md" | "tsv" | "csv"))
}

fn is_resource_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "yaml" | "yml" | "py" | "json"))
}

fn package_member_url(source_url: &str, path: &Path) -> String {
    format!("{}/{}", source_url.trim_end_matches('/'), path.to_string_lossy())
}

fn join_url(base: &str, relative: &str) -> String {
    url::Url::parse(base)
        .and_then(|url| url.join(relative))
        .map(|url| url.to_string())
        .unwrap_or_else(|_| relative.to_owned())
}

fn yaml_string(value: &serde_yaml::Value, key: &str) -> Option<String> {
    value
        .as_mapping()
        .and_then(|mapping| mapping.get(serde_yaml::Value::String(key.to_owned())))
        .and_then(serde_yaml::Value::as_str)
        .map(ToOwned::to_owned)
}

fn scalar_at(value: &serde_yaml::Value, key: &str) -> Option<String> {
    value
        .as_mapping()
        .and_then(|mapping| mapping.get(serde_yaml::Value::String(key.to_owned())))
        .and_then(|value| match value {
            serde_yaml::Value::String(text) => Some(text.clone()),
            serde_yaml::Value::Number(number) => Some(number.to_string()),
            _ => None,
        })
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn default_analysis_max_duration_ms() -> u64 {
    30_000
}

fn run_package_report_bytes_blocking(
    manifest_path: &str,
    package_files: Vec<PackageFileInput>,
    input_name: &str,
    input_bytes: &[u8],
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    let started = SystemTime::now();
    let workspace = PackageWorkspace::new(package_files)?;
    let participant_id = bioscript_reporting::participant_id_from_name(input_name);
    let input_file_path = options.input_file_path.as_deref().unwrap_or(input_name);
    let inspect_options = options.inspect_options(options.detect_sex);
    let input_inspection = inspect_bytes_rs(input_name, input_bytes, &inspect_options)
        .map_err(|err| format!("inspect input failed: {err:?}"))?;
    let loader = GenotypeLoadOptions {
        assembly: input_inspection.assembly,
        inferred_sex: input_inspection
            .inferred_sex
            .as_ref()
            .map(|inference| inference.sex),
        ..Default::default()
    };
    let store = GenotypeStore::from_bytes(input_name, input_bytes)
        .map_err(|err| format!("load genotypes failed: {err:?}"))?;
    let analysis_runner = DesktopReportAnalysisRunner {
        workspace: &workspace,
        input_name,
        input_bytes,
        participant_id: &participant_id,
        loader: &loader,
        options: &options,
    };
    let run = bioscript_reporting::run_report(
        &workspace,
        manifest_path,
        &store,
        &analysis_runner,
        bioscript_reporting::ReportInputContext {
            participant_id: &participant_id,
            input_file_name: input_name,
            input_file_path,
            input_inspection: Some(&input_inspection),
        },
        bioscript_reporting::ReportRunOptions {
            filters: &options.filters,
        },
    )?;
    Ok(report_output_from_artifacts(started, run.artifacts))
}

#[allow(clippy::too_many_arguments)]
fn run_package_report_from_cram_blocking(
    manifest_path: &str,
    package_files: Vec<PackageFileInput>,
    input_name: &str,
    cram_path: &str,
    crai_bytes: &[u8],
    fasta_path: &str,
    fai_bytes: &[u8],
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    let started = SystemTime::now();
    let workspace = PackageWorkspace::new(package_files)?;
    let participant_id = bioscript_reporting::participant_id_from_name(input_name);
    let input_file_path = options.input_file_path.as_deref().unwrap_or(cram_path);
    let mut head_inspection = inspect_head_from_path(
        Path::new(cram_path),
        input_name,
        &options.inspect_options(false),
        false,
    );
    let crai_index = bioscript_formats::alignment::parse_crai_bytes(crai_bytes)
        .map_err(|err| format!("parse crai: {err:?}"))?;
    let fai_index = bioscript_formats::alignment::parse_fai_bytes(fai_bytes)
        .map_err(|err| format!("parse fai: {err:?}"))?;
    let fasta_file = File::open(fasta_path).map_err(|err| format!("open FASTA {fasta_path}: {err}"))?;
    let repository = bioscript_formats::alignment::build_reference_repository_from_readers(
        BufReader::new(fasta_file),
        fai_index,
    );
    let cram_file = File::open(cram_path).map_err(|err| format!("open CRAM {cram_path}: {err}"))?;
    let indexed = bioscript_formats::alignment::build_cram_indexed_reader_from_reader(
        cram_file,
        crai_index,
        repository,
    )
    .map_err(|err| format!("build cram reader: {err:?}"))?;
    let lookup = CramReportLookup {
        reader: RefCell::new(indexed),
        label: input_file_path.to_owned(),
    };
    if let Some(explicit) = explicit_sex_from_options(&options) {
        head_inspection.inferred_sex = Some(explicit);
    } else if options.detect_sex {
        let mut reader = lookup.reader.borrow_mut();
        match bioscript_formats::infer_sex_from_alignment_reader(&mut reader, &lookup.label, true) {
            Ok(inference) => head_inspection.inferred_sex = Some(inference),
            Err(err) => head_inspection
                .evidence
                .push(format!("alignment sex detection failed: {err:?}")),
        }
    }
    let loader = GenotypeLoadOptions {
        format: Some(bioscript_formats::GenotypeSourceFormat::Cram),
        allow_reference_md5_mismatch: true,
        ..Default::default()
    };
    let analysis_runner = DesktopReportAnalysisRunner {
        workspace: &workspace,
        input_name,
        input_bytes: &[],
        participant_id: &participant_id,
        loader: &loader,
        options: &options,
    };
    let run = bioscript_reporting::run_report(
        &workspace,
        manifest_path,
        &lookup,
        &analysis_runner,
        bioscript_reporting::ReportInputContext {
            participant_id: &participant_id,
            input_file_name: input_name,
            input_file_path,
            input_inspection: Some(&head_inspection),
        },
        bioscript_reporting::ReportRunOptions {
            filters: &options.filters,
        },
    )?;
    Ok(report_output_from_artifacts(started, run.artifacts))
}

fn run_package_report_from_bam_blocking(
    manifest_path: &str,
    package_files: Vec<PackageFileInput>,
    input_name: &str,
    bam_path: &str,
    bai_bytes: &[u8],
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    let started = SystemTime::now();
    let workspace = PackageWorkspace::new(package_files)?;
    let participant_id = bioscript_reporting::participant_id_from_name(input_name);
    let input_file_path = options.input_file_path.as_deref().unwrap_or(bam_path);
    let mut head_inspection = inspect_head_from_path(
        Path::new(bam_path),
        input_name,
        &options.inspect_options(false),
        options.detect_sex,
    );
    let bai_index = bioscript_formats::alignment::parse_bai_bytes(bai_bytes)
        .map_err(|err| format!("parse bai: {err:?}"))?;
    let bam_file = File::open(bam_path).map_err(|err| format!("open BAM {bam_path}: {err}"))?;
    let indexed = bioscript_formats::alignment::build_bam_indexed_reader_from_reader(bam_file, bai_index)
        .map_err(|err| format!("build bam reader: {err:?}"))?;
    let lookup = BamReportLookup {
        reader: RefCell::new(indexed),
        label: input_file_path.to_owned(),
    };
    if let Some(explicit) = explicit_sex_from_options(&options) {
        head_inspection.inferred_sex = Some(explicit);
    }
    let loader = GenotypeLoadOptions {
        format: Some(bioscript_formats::GenotypeSourceFormat::Bam),
        ..Default::default()
    };
    let analysis_runner = DesktopReportAnalysisRunner {
        workspace: &workspace,
        input_name,
        input_bytes: &[],
        participant_id: &participant_id,
        loader: &loader,
        options: &options,
    };
    let run = bioscript_reporting::run_report(
        &workspace,
        manifest_path,
        &lookup,
        &analysis_runner,
        bioscript_reporting::ReportInputContext {
            participant_id: &participant_id,
            input_file_name: input_name,
            input_file_path,
            input_inspection: Some(&head_inspection),
        },
        bioscript_reporting::ReportRunOptions {
            filters: &options.filters,
        },
    )?;
    Ok(report_output_from_artifacts(started, run.artifacts))
}

fn run_package_report_from_vcf_blocking(
    manifest_path: &str,
    package_files: Vec<PackageFileInput>,
    input_name: &str,
    vcf_path: &str,
    tbi_bytes: &[u8],
    options: ReportOptionsInput,
) -> Result<ReportRunOutput, String> {
    let started = SystemTime::now();
    let workspace = PackageWorkspace::new(package_files)?;
    let participant_id = bioscript_reporting::participant_id_from_name(input_name);
    let input_file_path = options.input_file_path.as_deref().unwrap_or(vcf_path);
    let mut head_inspection = inspect_head_from_path(
        Path::new(vcf_path),
        input_name,
        &options.inspect_options(false),
        false,
    );
    if head_inspection.assembly.is_none() {
        head_inspection.assembly = detect_vcf_assembly_from_path(Path::new(vcf_path));
    }
    let tabix_index = bioscript_formats::alignment::parse_tbi_bytes(tbi_bytes)
        .map_err(|err| format!("parse tbi: {err:?}"))?;
    let vcf_file = File::open(vcf_path).map_err(|err| format!("open VCF {vcf_path}: {err}"))?;
    let indexed = noodles::csi::io::IndexedReader::new(vcf_file, tabix_index);
    let lookup = VcfReportLookup {
        reader: RefCell::new(indexed),
        label: input_file_path.to_owned(),
        detected_assembly: head_inspection.assembly,
    };
    if let Some(explicit) = explicit_sex_from_options(&options) {
        head_inspection.inferred_sex = Some(explicit);
    } else if options.detect_sex {
        if let Ok(file) = File::open(vcf_path) {
            if let Ok(inference) =
                bioscript_formats::infer_sex_from_named_reader(input_name, file, DetectedKind::Vcf)
            {
                head_inspection.inferred_sex = Some(inference);
            }
        }
    }
    let loader = GenotypeLoadOptions {
        format: Some(bioscript_formats::GenotypeSourceFormat::Vcf),
        ..Default::default()
    };
    let analysis_runner = DesktopReportAnalysisRunner {
        workspace: &workspace,
        input_name,
        input_bytes: &[],
        participant_id: &participant_id,
        loader: &loader,
        options: &options,
    };
    let run = bioscript_reporting::run_report(
        &workspace,
        manifest_path,
        &lookup,
        &analysis_runner,
        bioscript_reporting::ReportInputContext {
            participant_id: &participant_id,
            input_file_name: input_name,
            input_file_path,
            input_inspection: Some(&head_inspection),
        },
        bioscript_reporting::ReportRunOptions {
            filters: &options.filters,
        },
    )?;
    Ok(report_output_from_artifacts(started, run.artifacts))
}

fn report_output_from_artifacts(
    started: SystemTime,
    artifacts: bioscript_reporting::ReportArtifactTexts,
) -> ReportRunOutput {
    let duration_ms = started
        .elapsed()
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    ReportRunOutput {
        text_output: artifacts.text_output.clone(),
        duration_ms,
        artifacts: vec![
            ReportArtifactOutput {
                name: "observations.tsv".to_owned(),
                path: "observations.tsv".to_owned(),
                mime_type: "text/tab-separated-values".to_owned(),
                text: artifacts.observations_tsv,
            },
            ReportArtifactOutput {
                name: "analysis.jsonl".to_owned(),
                path: "analysis.jsonl".to_owned(),
                mime_type: "application/x-ndjson".to_owned(),
                text: artifacts.analysis_jsonl,
            },
            ReportArtifactOutput {
                name: "reports.jsonl".to_owned(),
                path: "reports.jsonl".to_owned(),
                mime_type: "application/x-ndjson".to_owned(),
                text: artifacts.reports_jsonl,
            },
            ReportArtifactOutput {
                name: "index.html".to_owned(),
                path: "index.html".to_owned(),
                mime_type: "text/html".to_owned(),
                text: artifacts.html,
            },
        ],
    }
}

struct CramReportLookup<R: std::io::Read + std::io::Seek> {
    reader: RefCell<noodles::cram::io::indexed_reader::IndexedReader<R>>,
    label: String,
}

impl<R: std::io::Read + std::io::Seek> bioscript_reporting::ReportVariantLookup
    for CramReportLookup<R>
{
    fn lookup_variants(&self, specs: &[VariantSpec]) -> Result<Vec<VariantObservation>, String> {
        let mut reader = self.reader.borrow_mut();
        specs
            .iter()
            .map(|spec| observe_cram_variant(&mut reader, &self.label, spec).map_err(|err| err.to_string()))
            .collect()
    }
}

struct BamReportLookup<R: std::io::Read + std::io::Seek> {
    reader: RefCell<
        noodles::bam::io::indexed_reader::IndexedReader<noodles::bgzf::io::Reader<R>>,
    >,
    label: String,
}

impl<R: std::io::Read + std::io::Seek> bioscript_reporting::ReportVariantLookup
    for BamReportLookup<R>
{
    fn lookup_variants(&self, specs: &[VariantSpec]) -> Result<Vec<VariantObservation>, String> {
        let mut reader = self.reader.borrow_mut();
        specs
            .iter()
            .map(|spec| bioscript_formats::observe_bam_variant(&mut reader, &self.label, spec).map_err(|err| err.to_string()))
            .collect()
    }
}

struct VcfReportLookup<R: std::io::Read + std::io::Seek> {
    reader: RefCell<
        noodles::csi::io::IndexedReader<noodles::bgzf::io::Reader<R>, noodles::tabix::Index>,
    >,
    label: String,
    detected_assembly: Option<Assembly>,
}

impl<R: std::io::Read + std::io::Seek> bioscript_reporting::ReportVariantLookup
    for VcfReportLookup<R>
{
    fn lookup_variants(&self, specs: &[VariantSpec]) -> Result<Vec<VariantObservation>, String> {
        let mut reader = self.reader.borrow_mut();
        specs
            .iter()
            .map(|spec| observe_vcf_variant(&mut reader, &self.label, spec, self.detected_assembly).map_err(|err| err.to_string()))
            .collect()
    }
}

struct DesktopReportAnalysisRunner<'a> {
    workspace: &'a PackageWorkspace,
    input_name: &'a str,
    input_bytes: &'a [u8],
    participant_id: &'a str,
    loader: &'a GenotypeLoadOptions,
    options: &'a ReportOptionsInput,
}

impl bioscript_reporting::ReportAnalysisRunner for DesktopReportAnalysisRunner<'_> {
    fn run_analysis_task(
        &self,
        task: &bioscript_reporting::AnalysisManifestTask,
        _observation_rows: &[BTreeMap<String, String>],
        variant_observations: &[VariantObservation],
        _observations: &[serde_json::Value],
    ) -> Result<Vec<serde_json::Value>, String> {
        self.workspace.run_interpretations(
            &task.manifest_path,
            &task.manifest_name,
            &task.interpretations,
            self.input_name,
            self.input_bytes,
            variant_observations,
            self.participant_id,
            self.loader,
            self.options,
        )
    }
}

fn observe_cram_variant<R: std::io::Read + std::io::Seek>(
    reader: &mut noodles::cram::io::indexed_reader::IndexedReader<R>,
    label: &str,
    variant: &VariantSpec,
) -> Result<VariantObservation, RuntimeError> {
    let assembly = variant
        .grch38
        .as_ref()
        .map(|_| Assembly::Grch38)
        .or_else(|| variant.grch37.as_ref().map(|_| Assembly::Grch37));
    let locus = variant.grch38.as_ref().or(variant.grch37.as_ref()).ok_or_else(|| {
        RuntimeError::Io(format!(
            "variant {} has no GRCh37/GRCh38 locus",
            variant.rsids.first().map(String::as_str).unwrap_or("variant")
        ))
    })?;
    let locus = GenomicLocus {
        chrom: locus.chrom.clone(),
        start: locus.start,
        end: locus.end,
    };
    match variant.kind.unwrap_or(VariantKind::Snp) {
        VariantKind::Snp => {
            let ref_char = variant
                .reference
                .as_deref()
                .and_then(|value| value.chars().next())
                .ok_or_else(|| RuntimeError::Io("variant missing reference allele".to_owned()))?;
            let alt_char = variant
                .alternate
                .as_deref()
                .and_then(|value| value.chars().next())
                .ok_or_else(|| RuntimeError::Io("variant missing alternate allele".to_owned()))?;
            bioscript_formats::observe_cram_snp_with_reader(
                reader,
                label,
                &locus,
                ref_char,
                alt_char,
                variant.rsids.first().cloned(),
                assembly,
            )
        }
        VariantKind::Deletion => {
            let deletion_length = variant.deletion_length.ok_or_else(|| {
                RuntimeError::Io("variant missing deletion_length".to_owned())
            })?;
            bioscript_formats::observe_cram_deletion_with_reader(
                reader,
                label,
                &locus,
                deletion_length,
                variant.reference.as_deref().unwrap_or("I"),
                variant.alternate.as_deref().unwrap_or("D"),
                variant.rsids.first().cloned(),
                assembly,
            )
        }
        VariantKind::Insertion | VariantKind::Indel => {
            let reference = variant
                .reference
                .as_deref()
                .ok_or_else(|| RuntimeError::Io("variant missing reference allele".to_owned()))?;
            let alternate = variant
                .alternate
                .as_deref()
                .ok_or_else(|| RuntimeError::Io("variant missing alternate allele".to_owned()))?;
            let mut alternate_lengths = variant
                .observed_alternates
                .iter()
                .map(String::len)
                .filter(|len| *len > 0)
                .collect::<Vec<_>>();
            if alternate_lengths.is_empty() {
                alternate_lengths.push(alternate.len());
            }
            alternate_lengths.sort_unstable();
            alternate_lengths.dedup();
            bioscript_formats::observe_cram_indel_with_reader(
                reader,
                label,
                &locus,
                reference,
                alternate,
                &alternate_lengths,
                variant.rsids.first().cloned(),
                assembly,
            )
        }
        other => Err(RuntimeError::Io(format!(
            "variant {} kind {:?} is not supported on CRAM",
            variant.rsids.first().map(String::as_str).unwrap_or("variant"),
            other
        ))),
    }
}

fn observe_vcf_variant<R: std::io::Read + std::io::Seek>(
    reader: &mut noodles::csi::io::IndexedReader<
        noodles::bgzf::io::Reader<R>,
        noodles::tabix::Index,
    >,
    label: &str,
    variant: &VariantSpec,
    detected_assembly: Option<Assembly>,
) -> Result<VariantObservation, RuntimeError> {
    let raw_locus =
        bioscript_formats::choose_variant_locus_for_assembly(variant, detected_assembly)
            .ok_or_else(|| {
                RuntimeError::Io(format!(
                    "variant {} has no GRCh37/GRCh38 locus",
                    variant.rsids.first().map(String::as_str).unwrap_or("variant")
                ))
            })?;
    let assembly = detected_assembly.or_else(|| {
        if variant.grch37.as_ref().is_some_and(|locus| locus == &raw_locus) {
            Some(Assembly::Grch37)
        } else if variant.grch38.as_ref().is_some_and(|locus| locus == &raw_locus) {
            Some(Assembly::Grch38)
        } else {
            None
        }
    });
    let locus = GenomicLocus {
        chrom: raw_locus.chrom.clone(),
        start: raw_locus.start,
        end: raw_locus.end,
    };
    let observation = bioscript_formats::observe_vcf_variant_with_reader(
        reader,
        label,
        &locus,
        variant,
        variant.rsids.first().cloned(),
        assembly,
    )?;
    if observation.genotype.is_none()
        && !observation.evidence.iter().any(|line| {
            line.contains("tabix index has no contig")
                || line.contains("has no GRCh37/GRCh38 locus")
        })
    {
        if let Some(imputed) = bioscript_formats::imputed_reference_observation(
            "vcf",
            label,
            variant,
            &locus,
            assembly,
            None,
            &observation.evidence.join(" | "),
        ) {
            return Ok(imputed);
        }
    }
    Ok(observation)
}

fn inspect_head_from_path(
    path: &Path,
    input_name: &str,
    options: &InspectOptions,
    detect_sex: bool,
) -> FileInspection {
    let head_len = fs::metadata(path)
        .map(|metadata| metadata.len().min(8 * 1024 * 1024) as usize)
        .unwrap_or(0);
    let mut buf = vec![0; head_len];
    let mut filled = 0usize;
    if let Ok(mut file) = File::open(path) {
        while filled < buf.len() {
            match file.read(&mut buf[filled..]) {
                Ok(0) => break,
                Ok(n) => filled += n,
                Err(_) => break,
            }
        }
    }
    buf.truncate(filled);
    let mut options = options.clone();
    options.detect_sex = detect_sex;
    match inspect_bytes_rs(input_name, &buf, &options) {
        Ok(inspection) => inspection,
        Err(err) => FileInspection {
            path: PathBuf::from(input_name),
            container: FileContainer::Plain,
            detected_kind: DetectedKind::Unknown,
            confidence: DetectionConfidence::Unknown,
            source: None,
            assembly: None,
            phased: None,
            selected_entry: None,
            has_index: None,
            index_path: None,
            reference_matches: None,
            inferred_sex: None,
            evidence: vec![format!("inspect_bytes failed: {err:?}")],
            warnings: Vec::new(),
            duration_ms: 0,
        },
    }
}

fn detect_vcf_assembly_from_path(path: &Path) -> Option<Assembly> {
    let file = File::open(path).ok()?;
    let bgzf_reader = noodles::bgzf::io::Reader::new(file);
    let mut lines = BufReader::new(bgzf_reader).lines();
    let mut probe_lines = Vec::new();
    for _ in 0..256 {
        let line = match lines.next() {
            Some(Ok(line)) => line,
            Some(Err(_)) | None => break,
        };
        let reached_samples = line.starts_with("#CHROM");
        probe_lines.push(line);
        if reached_samples {
            break;
        }
    }
    bioscript_formats::detect_vcf_assembly(path, &probe_lines)
}

fn explicit_sex_from_options(options: &ReportOptionsInput) -> Option<SexInference> {
    let raw = options.sample_sex.as_deref()?.trim().to_ascii_lowercase();
    let sex = match raw.as_str() {
        "male" | "m" => bioscript_formats::InferredSex::Male,
        "female" | "f" => bioscript_formats::InferredSex::Female,
        "unknown" | "u" | "" => bioscript_formats::InferredSex::Unknown,
        _ => return None,
    };
    Some(SexInference {
        sex,
        confidence: bioscript_formats::SexDetectionConfidence::High,
        method: "explicit_sample_sex".to_owned(),
        evidence: vec!["source=sample_sex_option".to_owned()],
    })
}

impl PackageWorkspace {
    fn new(files: Vec<PackageFileInput>) -> Result<Self, String> {
        let mut map = BTreeMap::new();
        for file in files {
            let _ = file.source_url;
            map.insert(normalize_package_path(&file.path)?, file.contents);
        }
        Ok(Self { files: map })
    }

    fn text(&self, path: &str) -> Result<&str, String> {
        let normalized = normalize_package_path(path)?;
        self.files
            .get(&normalized)
            .map(String::as_str)
            .ok_or_else(|| format!("package file not found: {normalized}"))
    }

    fn yaml(&self, path: &str) -> Result<serde_yaml::Value, String> {
        serde_yaml::from_str(self.text(path)?)
            .map_err(|err| format!("failed to parse YAML {path}: {err}"))
    }

    fn resolve(&self, base: &str, relative: &str) -> Result<String, String> {
        let base = Path::new(base).parent().unwrap_or_else(|| Path::new(""));
        normalize_package_path(&base.join(relative).display().to_string())
    }

    fn load_variant(&self, path: &str) -> Result<VariantManifest, String> {
        load_variant_manifest_text(path, self.text(path)?)
            .map_err(|err| format!("load variant {path}: {err}"))
    }

    #[allow(clippy::too_many_arguments)]
    fn run_interpretations(
        &self,
        manifest_path: &str,
        manifest_name: &str,
        interpretations: &[bioscript_schema::PanelInterpretation],
        _input_name: &str,
        input_bytes: &[u8],
        preloaded_observations: &[VariantObservation],
        participant_id: &str,
        loader: &GenotypeLoadOptions,
        options: &ReportOptionsInput,
    ) -> Result<Vec<serde_json::Value>, String> {
        let mut outputs = Vec::new();
        for interpretation in interpretations {
            bioscript_reporting::validate_bioscript_interpretation(interpretation)?;
            let script_path = self.resolve(manifest_path, &interpretation.path)?;
            let analysis_format = bioscript_reporting::analysis_output_format(
                interpretation.output_format.as_deref(),
            )?;
            let analysis_output_file = bioscript_reporting::analysis_output_relative_file(
                participant_id,
                &interpretation.id,
                analysis_format.extension,
            );
            let output_file = options
                .output_dir
                .as_deref()
                .filter(|dir| !dir.is_empty())
                .map(|dir| format!("{}/{}", dir.trim_end_matches('/'), analysis_output_file))
                .unwrap_or(analysis_output_file);
            let observations_output_file = bioscript_reporting::analysis_observations_relative_file(
                participant_id,
                &interpretation.id,
            );
            let observations_file = options
                .output_dir
                .as_deref()
                .filter(|dir| !dir.is_empty())
                .map(|dir| format!("{}/{}", dir.trim_end_matches('/'), observations_output_file))
                .unwrap_or(observations_output_file);
            let output_extension = Path::new(&output_file)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or(analysis_format.extension);
            let virtual_input_file = "/input/genotypes".to_owned();
            let virtual_output_file = format!("/output/results.{output_extension}");
            let virtual_observations_file = "/work/observations.tsv".to_owned();
            let script_virtual_path = virtual_pipeline_path(&script_path, "analysis.py");
            let manifest_virtual_path = virtual_pipeline_path(manifest_path, "manifest.yaml");
            let mut virtual_text_files = BTreeMap::new();
            virtual_text_files.insert(script_virtual_path.clone(), self.text(&script_path)?.to_owned());
            virtual_text_files.insert(manifest_virtual_path.clone(), self.text(manifest_path)?.to_owned());
            virtual_text_files.insert(
                virtual_observations_file.clone(),
                bioscript_reporting::render_analysis_observations_tsv(preloaded_observations),
            );
            let mut asset_paths = BTreeMap::new();
            for asset in &interpretation.assets {
                let asset_path = self.resolve(manifest_path, &asset.path)?;
                let virtual_asset_path = virtual_pipeline_path(&asset_path, &asset.path);
                virtual_text_files.insert(virtual_asset_path.clone(), self.text(&asset_path)?.to_owned());
                asset_paths.insert(asset.id.clone(), virtual_asset_path);
            }
            let runtime_observations = if input_bytes.is_empty() {
                preloaded_observations.to_vec()
            } else {
                Vec::new()
            };
            let mut virtual_binary_files = BTreeMap::new();
            virtual_binary_files.insert(virtual_input_file.clone(), input_bytes.to_vec());
            let limits = ResourceLimits::new()
                .max_duration(Duration::from_millis(options.analysis_max_duration_ms))
                .max_memory(16 * 1024 * 1024)
                .max_allocations(400_000)
                .gc_interval(1000)
                .max_recursion_depth(Some(200));
            let runtime = BioscriptRuntime::with_config(
                PathBuf::new(),
                RuntimeConfig {
                    limits,
                    loader: loader.clone(),
                    context: analysis_context(
                        participant_id,
                        &virtual_input_file,
                        &script_virtual_path,
                        &manifest_virtual_path,
                        &asset_paths,
                        &virtual_observations_file,
                        &virtual_output_file,
                    ),
                    virtual_binary_files,
                    virtual_text_files,
                    preloaded_observations: runtime_observations,
                },
            )
            .map_err(|err| format!("create analysis runtime failed: {err:?}"))?;
            runtime
                .run_file(
                    &script_virtual_path,
                    None,
                    vec![
                        ("input_file", MontyObject::String(virtual_input_file.clone())),
                        ("output_file", MontyObject::String(virtual_output_file.clone())),
                        (
                            "observations_file",
                            MontyObject::String(virtual_observations_file.clone()),
                        ),
                        ("asset_paths", monty_string_dict(&asset_paths)),
                        ("participant_id", MontyObject::String(participant_id.to_owned())),
                    ],
                )
                .map_err(|err| format!("analysis {} failed: {err:?}", interpretation.id))?;
            let written = runtime.virtual_written_text_files();
            let text = written.get(&virtual_output_file).ok_or_else(|| {
                format!("analysis {} did not write {virtual_output_file}", interpretation.id)
            })?;
            let (rows, row_headers) =
                bioscript_reporting::parse_analysis_output_text(text, analysis_format.format)?;
            outputs.push(bioscript_reporting::analysis_output_json(
                bioscript_reporting::AnalysisOutputJsonInput {
                    participant_id,
                    assay_id: manifest_name,
                    interpretation,
                    output_format: analysis_format.format,
                    manifest_path,
                    script_path: &script_path,
                    output_file: &output_file,
                    observations_file: Some(&observations_file),
                    row_headers,
                    rows,
                },
            ));
        }
        Ok(outputs)
    }
}

impl bioscript_reporting::ManifestWorkspace for PackageWorkspace {
    fn load_text(&self, path: &str) -> Result<String, String> {
        self.text(path).map(str::to_owned)
    }

    fn load_yaml(&self, path: &str) -> Result<serde_yaml::Value, String> {
        self.yaml(path)
    }

    fn resolve(&self, base: &str, relative: &str) -> Result<String, String> {
        self.resolve(base, relative)
    }
}

impl bioscript_reporting::ReportWorkspace for PackageWorkspace {
    fn app_observation_from_manifest_row(
        &self,
        row: &BTreeMap<String, String>,
        assay_id: &str,
        inferred_sex: Option<&SexInference>,
        fallback_assembly: Option<Assembly>,
    ) -> Result<serde_json::Value, String> {
        let row_path = row.get("path").cloned().unwrap_or_default();
        let (manifest, gene, source, alt_alleles, observed_alt_alleles) = if row_path.contains('#')
        {
            let task = bioscript_reporting::load_variant_manifest_task_by_path(self, &row_path)?;
            let alt_alleles = task
                .manifest
                .spec
                .alternate
                .clone()
                .into_iter()
                .collect::<Vec<_>>();
            let observed_alt_alleles = task.manifest.spec.observed_alternates.clone();
            (
                task.manifest,
                String::new(),
                serde_json::Value::Null,
                alt_alleles,
                observed_alt_alleles,
            )
        } else {
            let manifest = self.load_variant(&row_path)?;
            let value = self.yaml(&row_path)?;
            (
                manifest,
                scalar_at(&value, "gene").unwrap_or_default(),
                variant_primary_source_from_yaml(&value),
                variant_alt_alleles_from_yaml(&value),
                variant_observed_alt_alleles_from_yaml(&value),
            )
        };
        Ok(bioscript_reporting::app_observation_from_manifest_row(
            bioscript_reporting::AppObservationInput {
                row,
                row_path: &row_path,
                assay_id,
                manifest,
                gene,
                source,
                alt_alleles,
                observed_alt_alleles,
                inferred_sex,
                fallback_assembly,
            },
        ))
    }
}

fn virtual_pipeline_path(path: &str, fallback: &str) -> String {
    let name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(fallback);
    format!("/input/pipeline/{name}")
}

fn analysis_context(
    participant_id: &str,
    input_file: &str,
    script_path: &str,
    manifest_path: &str,
    asset_paths: &BTreeMap<String, String>,
    observations_file: &str,
    output_file: &str,
) -> BTreeMap<String, MontyObject> {
    BTreeMap::from([
        (
            "participant_id".to_owned(),
            MontyObject::String(participant_id.to_owned()),
        ),
        (
            "input_files".to_owned(),
            monty_string_dict(&BTreeMap::from([(
                "genotypes".to_owned(),
                input_file.to_owned(),
            )])),
        ),
        (
            "pipeline_files".to_owned(),
            monty_string_dict(&BTreeMap::from([
                ("manifest".to_owned(), manifest_path.to_owned()),
                ("analysis".to_owned(), script_path.to_owned()),
            ])),
        ),
        ("assets".to_owned(), monty_string_dict(asset_paths)),
        (
            "observations_file".to_owned(),
            MontyObject::String(observations_file.to_owned()),
        ),
        (
            "output_file".to_owned(),
            MontyObject::String(output_file.to_owned()),
        ),
    ])
}

fn monty_string_dict(values: &BTreeMap<String, String>) -> MontyObject {
    MontyObject::Dict(
        values
            .iter()
            .map(|(key, value)| {
                (
                    MontyObject::String(key.clone()),
                    MontyObject::String(value.clone()),
                )
            })
            .collect(),
    )
}

fn variant_primary_source_from_yaml(value: &serde_yaml::Value) -> serde_json::Value {
    let mut links = BTreeMap::<String, serde_json::Value>::new();
    let _ = bioscript_reporting::collect_manifest_provenance_entries(value, &mut links);
    if let Some(source) = links
        .values()
        .find(|source| source_url_contains(source, "ncbi.nlm.nih.gov/snp/rs"))
    {
        return source.clone();
    }
    if let Some(rsid) = value
        .get("identifiers")
        .and_then(|identifiers| identifiers.get("rsids"))
        .and_then(serde_yaml::Value::as_sequence)
        .and_then(|items| items.iter().find_map(serde_yaml::Value::as_str))
    {
        return serde_json::json!({
            "kind": "database",
            "label": "dbSNP / NCBI SNP",
            "url": format!("https://www.ncbi.nlm.nih.gov/snp/{rsid}"),
            "fields": ["identifiers.rsids"],
        });
    }
    links
        .into_values()
        .next()
        .unwrap_or(serde_json::Value::Null)
}

fn source_url_contains(source: &serde_json::Value, needle: &str) -> bool {
    source
        .get("url")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|url| url.contains(needle))
}

fn variant_observed_alt_alleles_from_yaml(value: &serde_yaml::Value) -> Vec<String> {
    value
        .as_mapping()
        .and_then(|mapping| mapping.get(serde_yaml::Value::String("alleles".to_owned())))
        .and_then(serde_yaml::Value::as_mapping)
        .and_then(|mapping| mapping.get(serde_yaml::Value::String("observed_alts".to_owned())))
        .and_then(serde_yaml::Value::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_yaml::Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn variant_alt_alleles_from_yaml(value: &serde_yaml::Value) -> Vec<String> {
    value
        .as_mapping()
        .and_then(|mapping| mapping.get(serde_yaml::Value::String("alleles".to_owned())))
        .and_then(serde_yaml::Value::as_mapping)
        .and_then(|mapping| mapping.get(serde_yaml::Value::String("alts".to_owned())))
        .and_then(serde_yaml::Value::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_yaml::Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_package_path(path: &str) -> Result<String, String> {
    Ok(checked_relative_package_path(path)?
        .to_string_lossy()
        .replace('\\', "/"))
}

fn run_assay_blocking(request: DesktopRunAssayRequest) -> Result<DesktopRunAssayResult, String> {
    let assay_path = PathBuf::from(&request.assay_path);
    let genome_path = PathBuf::from(&request.genome_path);
    let root = if assay_path.is_absolute() || genome_path.is_absolute() {
        PathBuf::from("/")
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    };
    let output_path = std::env::temp_dir().join(format!(
        "biovault-assay-output-{}-{}.tsv",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    ));

    run_file_request(RunFileRequest {
        script_path: assay_path.display().to_string(),
        script_contents: None,
        root: Some(root.display().to_string()),
        input_file: Some(root_relative_path(&root, &genome_path)),
        input_contents: None,
        output_file: Some(root_relative_path(&root, &output_path)),
        file_contents: None,
        participant_id: Some("desktop".to_owned()),
        trace_report_path: None,
        timing_report_path: None,
        input_format: Some(request.input_format),
        input_index: request
            .input_index
            .map(|path| root_relative_path(&root, &PathBuf::from(path))),
        reference_file: request
            .reference_file
            .map(|path| root_relative_path(&root, &PathBuf::from(path))),
        reference_index: request
            .reference_index
            .map(|path| root_relative_path(&root, &PathBuf::from(path))),
        allow_md5_mismatch: Some(true),
        auto_index: Some(false),
        cache_dir: None,
        max_duration_ms: Some(60_000),
        max_memory_bytes: Some(128 * 1024 * 1024),
        max_allocations: Some(1_000_000),
        max_recursion_depth: Some(512),
    })?;

    let output_text = fs::read_to_string(&output_path).unwrap_or_default();
    let _ = fs::remove_file(&output_path);
    Ok(DesktopRunAssayResult {
        output_text,
        observations: None,
    })
}

fn run_variant_yaml_blocking(
    request: DesktopRunAssayRequest,
) -> Result<DesktopRunAssayResult, String> {
    let RunVariantYamlResult { observations } = run_variant_yaml_request(&RunVariantYamlRequest {
        yaml_path: request.assay_path,
        genome_path: request.genome_path,
        input_format: Some(request.input_format),
        input_index: request.input_index,
        reference_file: request.reference_file,
        reference_index: request.reference_index,
        allow_md5_mismatch: Some(true),
    })?;
    Ok(DesktopRunAssayResult {
        output_text: String::new(),
        observations: Some(observations),
    })
}

fn root_relative_path(root: &std::path::Path, path: &std::path::Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .display()
        .to_string()
}

fn read_runtime_output(root: Option<&str>, output_file: &str) -> Result<String, std::io::Error> {
    let path = PathBuf::from(output_file);
    let path = if path.is_absolute() {
        path
    } else if let Some(root) = root {
        PathBuf::from(root).join(path)
    } else {
        path
    };
    fs::read_to_string(path)
}

impl From<FileInspection> for InspectionJs {
    fn from(i: FileInspection) -> Self {
        InspectionJs {
            file_name: i.path.display().to_string(),
            container: render_container(i.container),
            detected_kind: render_kind(i.detected_kind),
            confidence: render_confidence(i.confidence),
            assembly: i.assembly.map(render_assembly),
            phased: i.phased,
            source: i.source.map(SourceJs::from),
            selected_entry: i.selected_entry,
            has_index: i.has_index,
            reference_matches: i.reference_matches,
            evidence: i.evidence,
            warnings: i.warnings,
            duration_ms: i.duration_ms,
        }
    }
}

impl From<SourceMetadata> for SourceJs {
    fn from(s: SourceMetadata) -> Self {
        SourceJs {
            vendor: s.vendor.unwrap_or_default(),
            platform_version: s.platform_version,
            confidence: render_confidence(s.confidence),
            evidence: s.evidence,
        }
    }
}

fn render_container(container: FileContainer) -> &'static str {
    match container {
        FileContainer::Plain => "plain",
        FileContainer::Zip => "zip",
    }
}

fn render_kind(kind: DetectedKind) -> &'static str {
    match kind {
        DetectedKind::GenotypeText => "genotype_text",
        DetectedKind::Vcf => "vcf",
        DetectedKind::Bcf => "bcf",
        DetectedKind::AlignmentCram => "alignment_cram",
        DetectedKind::AlignmentBam => "alignment_bam",
        DetectedKind::ReferenceFasta => "reference_fasta",
        DetectedKind::Unknown => "unknown",
    }
}

fn render_confidence(confidence: DetectionConfidence) -> &'static str {
    match confidence {
        DetectionConfidence::Authoritative => "authoritative",
        DetectionConfidence::StrongHeuristic => "strong_heuristic",
        DetectionConfidence::WeakHeuristic => "weak_heuristic",
        DetectionConfidence::Unknown => "unknown",
    }
}

fn render_assembly(assembly: Assembly) -> &'static str {
    match assembly {
        Assembly::Grch37 => "grch37",
        Assembly::Grch38 => "grch38",
    }
}

fn render_variant_kind(kind: VariantKind) -> &'static str {
    match kind {
        VariantKind::Snp => "snv",
        VariantKind::Insertion => "insertion",
        VariantKind::Deletion => "deletion",
        VariantKind::Indel => "indel",
        VariantKind::Other => "other",
    }
}

fn parse_assembly_str(value: &str) -> Option<Assembly> {
    match value.to_ascii_lowercase().as_str() {
        "grch37" | "hg19" | "b37" => Some(Assembly::Grch37),
        "grch38" | "hg38" => Some(Assembly::Grch38),
        _ => None,
    }
}

fn parse_variant_kind(kind: Option<&str>) -> Option<VariantKind> {
    match kind.unwrap_or("").to_ascii_lowercase().as_str() {
        "snp" | "snv" | "variant" | "" => Some(VariantKind::Snp),
        "insertion" => Some(VariantKind::Insertion),
        "deletion" => Some(VariantKind::Deletion),
        "indel" => Some(VariantKind::Indel),
        "other" => Some(VariantKind::Other),
        _ => Some(VariantKind::Other),
    }
}

fn variant_input_to_spec(variant: &VariantInput) -> Result<VariantSpec, String> {
    let start = variant
        .start
        .or(variant.pos)
        .ok_or_else(|| format!("variant {}: start/pos missing", variant.name))?;
    let locus = GenomicLocus {
        chrom: variant.chrom.clone(),
        start,
        end: variant.end.unwrap_or(start),
    };
    let assembly = variant.assembly.as_deref().and_then(parse_assembly_str);
    Ok(VariantSpec {
        rsids: variant.rsid.clone().into_iter().collect(),
        grch37: if assembly == Some(Assembly::Grch37) {
            Some(locus.clone())
        } else {
            None
        },
        grch38: if assembly == Some(Assembly::Grch38) || assembly.is_none() {
            Some(locus)
        } else {
            None
        },
        grch37_assembly_ref: None,
        grch38_assembly_ref: None,
        reference: Some(variant.ref_base.clone()),
        alternate: Some(variant.alt_base.clone()),
        observed_alternates: if variant.observed_alts.is_empty() {
            vec![variant.alt_base.clone()]
        } else {
            variant.observed_alts.clone()
        },
        kind: parse_variant_kind(variant.kind.as_deref()),
        deletion_length: variant.deletion_length,
        motifs: Vec::new(),
    })
}

fn observation_to_js(
    variant: VariantInput,
    observation: VariantObservation,
) -> VariantObservationJs {
    VariantObservationJs {
        name: variant.name,
        backend: observation.backend,
        reference: Some(variant.ref_base),
        alternate: Some(variant.alt_base),
        matched_rsid: observation.matched_rsid,
        assembly: observation.assembly.map(|value| render_assembly(value).to_owned()),
        genotype: observation.genotype,
        ref_count: observation.ref_count,
        alt_count: observation.alt_count,
        depth: observation.depth,
        raw_counts: observation.raw_counts,
        decision: observation.decision,
        evidence: observation.evidence,
    }
}

fn download_url_file_blocking(
    cache_dir: PathBuf,
    request: UrlFileRequest,
) -> Result<DesktopLabFile, String> {
    fs::create_dir_all(&cache_dir).map_err(|error| {
        format!(
            "failed to create cache dir {}: {error}",
            cache_dir.display()
        )
    })?;
    let effective_url = raw_download_url(&request.url);
    let url =
        reqwest::Url::parse(&effective_url).map_err(|error| format!("invalid URL: {error}"))?;
    let name = request
        .name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| {
            url.path_segments()
                .and_then(|mut segments| segments.next_back())
                .filter(|segment| !segment.is_empty())
                .unwrap_or("downloaded-lab-file")
                .to_owned()
        });
    let file_name = format!(
        "{}-{}",
        stable_hash(effective_url.as_bytes()),
        sanitize_file_name(&name)
    );
    let path = cache_dir.join(file_name);

    if !path.exists() {
        let response = reqwest::blocking::get(url)
            .map_err(|error| format!("download request failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!("download failed with HTTP {}", response.status()));
        }
        let bytes = response
            .bytes()
            .map_err(|error| format!("download body failed: {error}"))?;
        fs::write(&path, bytes)
            .map_err(|error| format!("failed to write cache file {}: {error}", path.display()))?;
    }

    metadata_for_path(path)
}

fn remote_lab_file_cache_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("biovault-app-desktop"))
        .join("remote-lab-files")
}

fn cache_index_path(cache_dir: &std::path::Path) -> PathBuf {
    cache_dir.join("index.json")
}

fn read_remote_cache_index(cache_dir: &std::path::Path) -> BTreeMap<String, CachedRemoteLabFileRecord> {
    let path = cache_index_path(cache_dir);
    let Ok(text) = fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_remote_cache_index(
    cache_dir: &std::path::Path,
    index: &BTreeMap<String, CachedRemoteLabFileRecord>,
) -> Result<(), String> {
    fs::create_dir_all(cache_dir).map_err(|error| {
        format!(
            "failed to create cache dir {}: {error}",
            cache_dir.display()
        )
    })?;
    let text = serde_json::to_string_pretty(index)
        .map_err(|error| format!("encode remote cache index failed: {error}"))?;
    fs::write(cache_index_path(cache_dir), text)
        .map_err(|error| format!("write remote cache index failed: {error}"))
}

fn cache_file_name(source_url: &str, name: &str) -> String {
    format!(
        "{}-{}",
        stable_hash(source_url.as_bytes()),
        sanitize_file_name(name)
    )
}

fn cache_remote_url_file_blocking(
    cache_dir: PathBuf,
    request: UrlFileRequest,
) -> Result<CachedRemoteLabFileJs, String> {
    let source_url = request.url.clone();
    let file = download_url_file_blocking(cache_dir.clone(), request)?;
    let content_type = content_type_for_name(&file.name).to_owned();
    let record = CachedRemoteLabFileRecord {
        cached_at: iso_timestamp_now(),
        content_type,
        name: file.name.clone(),
        path: file.path.clone(),
        size: file.size,
        source_url: source_url.clone(),
    };
    let mut index = read_remote_cache_index(&cache_dir);
    index.insert(source_url, record.clone());
    write_remote_cache_index(&cache_dir, &index)?;
    cached_record_to_js(record)
}

fn cache_remote_bytes_blocking(
    cache_dir: PathBuf,
    request: CacheRemoteBytesRequest,
) -> Result<CachedRemoteLabFileJs, String> {
    fs::create_dir_all(&cache_dir).map_err(|error| {
        format!(
            "failed to create cache dir {}: {error}",
            cache_dir.display()
        )
    })?;
    let path = cache_dir.join(cache_file_name(&request.source_url, &request.name));
    fs::write(&path, &request.bytes)
        .map_err(|error| format!("failed to write cache file {}: {error}", path.display()))?;
    let file = metadata_for_path(path)?;
    let record = CachedRemoteLabFileRecord {
        cached_at: iso_timestamp_now(),
        content_type: request
            .content_type
            .unwrap_or_else(|| content_type_for_name(&file.name).to_owned()),
        name: file.name.clone(),
        path: file.path.clone(),
        size: file.size,
        source_url: request.source_url.clone(),
    };
    let mut index = read_remote_cache_index(&cache_dir);
    index.insert(request.source_url, record.clone());
    write_remote_cache_index(&cache_dir, &index)?;
    cached_record_to_js(record)
}

fn list_cached_remote_lab_files_blocking(
    cache_dir: PathBuf,
) -> Result<Vec<CachedRemoteLabFileJs>, String> {
    let mut index = read_remote_cache_index(&cache_dir);
    let mut stale = Vec::new();
    let mut files = Vec::new();
    for (source_url, record) in &index {
        if std::path::Path::new(&record.path).is_file() {
            files.push(cached_record_to_js(record.clone())?);
        } else {
            stale.push(source_url.clone());
        }
    }
    if !stale.is_empty() {
        for source_url in stale {
            index.remove(&source_url);
        }
        write_remote_cache_index(&cache_dir, &index)?;
    }
    files.sort_by(|left, right| right.cached_at.cmp(&left.cached_at));
    Ok(files)
}

fn delete_cached_remote_lab_file_blocking(
    cache_dir: PathBuf,
    source_url: &str,
) -> Result<(), String> {
    let mut index = read_remote_cache_index(&cache_dir);
    if let Some(record) = index.remove(source_url) {
        match fs::remove_file(&record.path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("delete cache file failed: {error}")),
        }
        write_remote_cache_index(&cache_dir, &index)?;
    }
    Ok(())
}

fn cached_record_to_js(record: CachedRemoteLabFileRecord) -> Result<CachedRemoteLabFileJs, String> {
    Ok(CachedRemoteLabFileJs {
        cached_at: record.cached_at,
        content_type: record.content_type,
        file: metadata_for_path(PathBuf::from(&record.path))?,
        source_url: record.source_url,
    })
}

fn desktop_fs_root_for_bridge() -> PathBuf {
    std::env::temp_dir()
        .join("biovault-app-desktop")
        .join("expo-file-system")
}

fn desktop_fs_uri_path_for_root(root: PathBuf, uri: &str) -> Result<PathBuf, String> {
    let (bucket, rest) = if let Some(rest) = uri.strip_prefix("desktop://cache") {
        ("cache", rest)
    } else if let Some(rest) = uri.strip_prefix("desktop://document") {
        ("document", rest)
    } else {
        return Err(format!("unsupported desktop fs uri: {uri}"));
    };
    let relative = rest.trim_start_matches('/').replace("..", "_");
    Ok(root.join(bucket).join(relative))
}

fn desktop_fs_uri_path(app: &AppHandle, uri: &str) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("biovault-app-desktop"))
        .join("expo-file-system");
    desktop_fs_uri_path_for_root(root, uri)
}

fn lab_fs_read_text_for_bridge(uri: String) -> Result<String, String> {
    let path = desktop_fs_uri_path_for_root(desktop_fs_root_for_bridge(), &uri)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("read desktop file {} failed: {error}", path.display())),
    }
}

fn lab_fs_write_text_for_bridge(uri: String, contents: String) -> Result<(), String> {
    let path = desktop_fs_uri_path_for_root(desktop_fs_root_for_bridge(), &uri)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create desktop file dir failed: {error}"))?;
    }
    fs::write(&path, contents)
        .map_err(|error| format!("write desktop file {} failed: {error}", path.display()))
}

fn lab_fs_delete_for_bridge(uri: String) -> Result<(), String> {
    let path = desktop_fs_uri_path_for_root(desktop_fs_root_for_bridge(), &uri)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("delete desktop file {} failed: {error}", path.display())),
    }
}

fn lab_fs_info_for_bridge(uri: String) -> Result<DesktopFsInfo, String> {
    let path = desktop_fs_uri_path_for_root(desktop_fs_root_for_bridge(), &uri)?;
    Ok(DesktopFsInfo {
        exists: path.exists(),
        uri,
    })
}

fn content_type_for_name(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".zip") {
        "application/zip"
    } else if lower.ends_with(".json") {
        "application/json"
    } else if lower.ends_with(".yaml") || lower.ends_with(".yml") {
        "application/yaml"
    } else {
        "application/octet-stream"
    }
}

fn iso_timestamp_now() -> String {
    format!("{}Z", now_millis())
}

fn raw_download_url(url: &str) -> String {
    let Some(rest) = url.strip_prefix("https://github.com/") else {
        return url.to_owned();
    };
    let parts: Vec<&str> = rest.split('/').collect();
    if parts.len() > 4 && parts[2] == "blob" {
        let owner = parts[0];
        let repo = parts[1];
        let branch = parts[3];
        let path = parts[4..].join("/");
        return format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}");
    }
    url.to_owned()
}

fn sanitize_file_name(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn stable_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct ScenarioFile {
        scenarios: Vec<Scenario>,
    }

    #[derive(Deserialize)]
    struct Scenario {
        id: String,
        #[serde(default)]
        assay: Option<ScenarioAssay>,
        #[serde(default)]
        genome: Option<ScenarioGenome>,
        #[serde(rename = "assert")]
        assertion: ScenarioExpect,
        platforms: Vec<String>,
    }

    #[derive(Deserialize)]
    struct ScenarioAssay {
        path: String,
        language: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "snake_case")]
    struct ScenarioGenome {
        kind: String,
        #[serde(default)]
        files: Vec<String>,
        expect_display_name: String,
        #[serde(default)]
        zip_source_path: Option<String>,
    }

    #[derive(Deserialize)]
    struct ScenarioExpect {
        contains: String,
    }

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .expect("repo root")
            .to_path_buf()
    }

    fn shared_scenario(id: &str) -> Scenario {
        let repo = repo_root();
        let text = fs::read_to_string(repo.join("tests/lab-scenarios.yaml"))
            .expect("read shared lab scenarios");
        let scenarios: ScenarioFile = serde_yaml::from_str(&text).expect("parse scenarios");
        scenarios
            .scenarios
            .into_iter()
            .find(|scenario| scenario.id == id)
            .unwrap_or_else(|| panic!("{id} scenario"))
    }

    fn desktop_scenario(id: &str) -> Scenario {
        let scenario = shared_scenario(id);
        assert!(
            scenario
                .platforms
                .iter()
                .any(|platform| platform == "desktop"),
            "{id} must be marked for desktop"
        );
        scenario
    }

    fn run_shared_desktop_scenario(id: &str) {
        let repo = repo_root();
        let scenario = desktop_scenario(id);

        let assay = scenario
            .assay
            .as_ref()
            .unwrap_or_else(|| panic!("{id} scenario missing assay"));
        let genome = scenario
            .genome
            .as_ref()
            .unwrap_or_else(|| panic!("{id} scenario missing genome"));
        let assay_path = repo.join(&assay.path);
        let mut generated_zip: Option<PathBuf> = None;
        let genome_path = if let Some(zip_source) = genome.zip_source_path.as_deref() {
            let source = repo.join(zip_source);
            if !source.exists() {
                eprintln!("missing shared lab fixture; skipping desktop {id} scenario");
                return;
            }
            let zip_path = std::env::temp_dir().join(format!("biovault-{id}.zip"));
            create_zip_fixture(&source, &zip_path);
            generated_zip = Some(zip_path.clone());
            zip_path
        } else {
            repo.join(&genome.files[0])
        };

        let required_paths: Vec<PathBuf> = std::iter::once(assay_path.clone())
            .chain(std::iter::once(genome_path.clone()))
            .chain(genome.files.iter().skip(1).map(|path| repo.join(path)))
            .collect();
        if required_paths.iter().any(|path| !path.exists()) {
            eprintln!("missing shared lab fixture; skipping desktop {id} scenario");
            return;
        }

        let request = DesktopRunAssayRequest {
            assay_path: assay_path.display().to_string(),
            genome_path: genome_path.display().to_string(),
            input_format: desktop_input_format(&genome.kind).to_owned(),
            input_index: input_index_path(&repo, genome),
            reference_file: reference_path(&repo, genome),
            reference_index: reference_index_path(&repo, genome),
        };
        let result = if assay.language == "yaml" {
            run_variant_yaml_blocking(request)
        } else {
            run_assay_blocking(request)
        }
        .unwrap_or_else(|err| panic!("desktop {id} run: {err}"));
        let combined_output = format!(
            "{}\n{}",
            result.output_text,
            serde_json::to_string(&result.observations).unwrap_or_default()
        );
        assert!(
            combined_output.contains(&scenario.assertion.contains),
            "{combined_output}"
        );

        if let Some(path) = generated_zip {
            let _ = fs::remove_file(path);
        }
    }

    fn desktop_input_format(kind: &str) -> &str {
        match kind {
            "genotype_text" => "text",
            "zip" => "zip",
            "cram" => "cram",
            "vcf" => "vcf",
            other => panic!("unsupported desktop scenario kind {other}"),
        }
    }

    fn input_index_path(repo: &std::path::Path, genome: &ScenarioGenome) -> Option<String> {
        match genome.kind.as_str() {
            "cram" | "vcf" => genome
                .files
                .get(1)
                .map(|path| repo.join(path).display().to_string()),
            _ => None,
        }
    }

    fn reference_path(repo: &std::path::Path, genome: &ScenarioGenome) -> Option<String> {
        (genome.kind == "cram")
            .then(|| {
                genome
                    .files
                    .get(2)
                    .map(|path| repo.join(path).display().to_string())
            })
            .flatten()
    }

    fn reference_index_path(repo: &std::path::Path, genome: &ScenarioGenome) -> Option<String> {
        (genome.kind == "cram")
            .then(|| {
                genome
                    .files
                    .get(3)
                    .map(|path| repo.join(path).display().to_string())
            })
            .flatten()
    }

    fn create_zip_fixture(source_path: &std::path::Path, zip_path: &std::path::Path) {
        let file = fs::File::create(zip_path).expect("create zip fixture");
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        let name = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("genome.txt");
        zip.start_file(name, options)
            .expect("start zip fixture file");
        std::io::copy(
            &mut fs::File::open(source_path).expect("open zip source"),
            &mut zip,
        )
        .expect("write zip source");
        zip.finish().expect("finish zip fixture");
    }

    #[test]
    fn desktop_lab_runs_shared_app_smoke_scenario() {
        let scenario = desktop_scenario("app-smoke");
        assert_eq!(scenario.assertion.contains, "Lab");
    }

    #[test]
    fn desktop_lab_runs_shared_file_picker_zip_scenario() {
        let repo = repo_root();
        let scenario = desktop_scenario("local-file-picker-23andme-zip");
        let genome = scenario.genome.as_ref().expect("file picker genome");
        let path = repo.join(&genome.files[0]);
        if !path.exists() {
            eprintln!("missing shared lab fixture; skipping desktop file picker scenario");
            return;
        }
        let file = metadata_for_path(path).expect("desktop file picker metadata");
        assert_eq!(file.name, genome.expect_display_name);
    }

    #[test]
    fn desktop_lab_runs_shared_drag_drop_zip_scenario() {
        let repo = repo_root();
        let scenario = desktop_scenario("local-drag-drop-23andme-zip");
        let genome = scenario.genome.as_ref().expect("drag drop genome");
        let path = repo.join(&genome.files[0]);
        if !path.exists() {
            eprintln!("missing shared lab fixture; skipping desktop drag/drop scenario");
            return;
        }
        let files = lab_stat_paths(vec![path.display().to_string()]);
        let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
        let files = runtime
            .block_on(files)
            .expect("desktop drag/drop stat paths");
        assert_eq!(files[0].name, genome.expect_display_name);
    }

    #[test]
    fn desktop_lab_runs_shared_apol1_text_scenario() {
        run_shared_desktop_scenario("apol1-text");
    }

    #[test]
    fn desktop_lab_runs_shared_apol1_zip_scenario() {
        run_shared_desktop_scenario("apol1-zip");
    }

    #[test]
    fn desktop_lab_runs_shared_apol1_cram_scenario() {
        run_shared_desktop_scenario("apol1-cram");
    }

    #[test]
    fn desktop_lab_runs_shared_apol1_cram_smoke_scenario() {
        run_shared_desktop_scenario("apol1-cram-smoke");
    }

    #[test]
    fn desktop_lab_runs_shared_apol1_vcf_scenario() {
        run_shared_desktop_scenario("apol1-vcf");
    }

    #[test]
    fn desktop_lab_runs_shared_yaml_apol1_text_scenario() {
        run_shared_desktop_scenario("yaml-apol1-text");
    }

    #[test]
    fn desktop_lab_runs_shared_yaml_apol1_zip_scenario() {
        run_shared_desktop_scenario("yaml-apol1-zip");
    }

    #[test]
    fn desktop_lab_runs_shared_yaml_apol1_cram_scenario() {
        run_shared_desktop_scenario("yaml-apol1-cram");
    }

    #[test]
    fn desktop_lab_runs_shared_yaml_apol1_vcf_scenario() {
        run_shared_desktop_scenario("yaml-apol1-vcf");
    }
}
