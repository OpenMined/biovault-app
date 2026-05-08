use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bioscript_ffi::{
    run_file_request, run_variant_yaml_request, RunFileRequest, RunVariantYamlRequest,
    RunVariantYamlResult,
};
use serde::Serialize;
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
        .unwrap_or_else(|_| std::env::temp_dir().join("biovault-desktop"))
        .join("lab-url-files");
    tauri::async_runtime::spawn_blocking(move || download_url_file_blocking(cache_dir, request))
        .await
        .map_err(|error| format!("download failed: {error}"))?
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
                .join("biovault-desktop")
                .join("lab-url-files");
            let file = tauri::async_runtime::spawn_blocking(move || {
                download_url_file_blocking(cache_dir, payload.request)
            })
            .await
            .map_err(|error| format!("download failed: {error}"))??;
            serde_json::to_value(file).map_err(|error| format!("encode download response: {error}"))
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
        other => Err(format!("unknown lab action: {other}")),
    }
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
    let RunVariantYamlResult { observations } = run_variant_yaml_request(RunVariantYamlRequest {
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

    fn input_index_path(repo: &PathBuf, genome: &ScenarioGenome) -> Option<String> {
        match genome.kind.as_str() {
            "cram" | "vcf" => genome
                .files
                .get(1)
                .map(|path| repo.join(path).display().to_string()),
            _ => None,
        }
    }

    fn reference_path(repo: &PathBuf, genome: &ScenarioGenome) -> Option<String> {
        (genome.kind == "cram")
            .then(|| {
                genome
                    .files
                    .get(2)
                    .map(|path| repo.join(path).display().to_string())
            })
            .flatten()
    }

    fn reference_index_path(repo: &PathBuf, genome: &ScenarioGenome) -> Option<String> {
        (genome.kind == "cram")
            .then(|| {
                genome
                    .files
                    .get(3)
                    .map(|path| repo.join(path).display().to_string())
            })
            .flatten()
    }

    fn create_zip_fixture(source_path: &PathBuf, zip_path: &PathBuf) {
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
