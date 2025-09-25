mod analysis;
mod database;
mod parsers;

use analysis::analyze_clinvar_matches;
use database::create_genome_database;
use parsers::twenty_three_and_me;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;

/// Process a 23andMe file and create an SQLite database.
///
/// Returns a newly-allocated C string containing the full path to the
/// created database file on success, or a null pointer on error.
///
/// # Safety
/// - `input_path`, `custom_name`, and `output_dir` must be valid pointers to
///   NUL-terminated UTF-8 strings and remain valid for the duration of the call.
/// - The returned pointer must be freed by calling `free_string` exactly once.
/// - Passing null or invalid pointers, or freeing the returned pointer by any
///   other means is undefined behavior.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn process_23andme_file(
    input_path: *const c_char,
    custom_name: *const c_char,
    output_dir: *const c_char,
) -> *mut c_char {
    let input_path = unsafe {
        match CStr::from_ptr(input_path).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let custom_name = unsafe {
        match CStr::from_ptr(custom_name).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let output_dir = unsafe {
        match CStr::from_ptr(output_dir).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    match process_file_internal(input_path, custom_name, output_dir) {
        Ok(db_name) => match CString::new(db_name) {
            Ok(c_string) => c_string.into_raw(),
            Err(e) => {
                eprintln!("Failed to create CString: {}", e);
                std::ptr::null_mut()
            }
        },
        Err(e) => {
            eprintln!("Rust processing failed: {}", e);
            std::ptr::null_mut()
        }
    }
}

fn process_file_internal(
    input_path: &str,
    custom_name: &str,
    output_dir: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    eprintln!("Rust: Starting to process file: {}", input_path);

    // Parse the 23andMe file
    let parse_result = twenty_three_and_me::parse_23andme_file(Path::new(input_path))?;

    eprintln!(
        "Rust: Parsed {} variants, {} with rsIDs",
        parse_result.metadata.total_variants, parse_result.metadata.rsid_count
    );

    // Create output SQLite file path in SQLite subdirectory
    // expo-sqlite expects databases to be in Documents/SQLite/
    let timestamp = chrono::Utc::now().timestamp();
    let db_filename = format!("{}_{}.sqlite", custom_name.replace(' ', "_"), timestamp);

    // Create SQLite subdirectory if it doesn't exist
    let sqlite_dir = Path::new(output_dir).join("SQLite");
    if !sqlite_dir.exists() {
        std::fs::create_dir_all(&sqlite_dir)?;
        eprintln!("Rust: Created SQLite directory at: {:?}", sqlite_dir);
    }

    let output_path = sqlite_dir.join(&db_filename);

    eprintln!("Rust: Creating database at: {:?}", output_path);

    // Create SQLite database
    let _db_name = create_genome_database(parse_result, &output_path, custom_name)?;

    eprintln!("Rust: Database created successfully");

    // Return the full path to the created database
    Ok(output_path.to_string_lossy().to_string())
}

/// Free memory allocated by `process_23andme_file`.
///
/// # Safety
/// - `ptr` must be a pointer previously returned by `process_23andme_file`.
/// - It must not have been freed already.
/// - Passing any other pointer, or double-freeing, is undefined behavior.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

// Keep the existing add function for testing
#[unsafe(no_mangle)]
pub extern "C" fn rust_add(a: i32, b: i32) -> i32 {
    a + b
}

/// cbindgen:ignore
#[cfg(target_os = "android")]
pub mod android {
    use crate::process_file_internal;
    use jni::JNIEnv;
    use jni::objects::JClass;
    use jni::sys;

    /// JNI entrypoint used by the Android module to process a genome file.
    ///
    /// # Safety
    /// - Called by the JVM with valid JNI references and strings.
    /// - Follows standard JNI safety rules; misuse on the caller side is UB.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn Java_expo_modules_biovault_ExpoBiovaultModule_processGenomeFile<
        'local,
    >(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        input_path: jni::objects::JString<'local>,
        custom_name: jni::objects::JString<'local>,
        output_dir: jni::objects::JString<'local>,
    ) -> jni::objects::JString<'local> {
        let input_path_str: String = env.get_string(&input_path).unwrap().into();
        let custom_name_str: String = env.get_string(&custom_name).unwrap().into();
        let output_dir_str: String = env.get_string(&output_dir).unwrap().into();

        match process_file_internal(&input_path_str, &custom_name_str, &output_dir_str) {
            Ok(result) => env.new_string(result).unwrap(),
            Err(_) => env.new_string("ERROR").unwrap(),
        }
    }

    /// JNI entrypoint for the rust_add function.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn Java_expo_modules_biovault_ExpoBiovaultModule_rustAdd(
        _env: JNIEnv,
        _class: JClass,
        a: sys::jint,
        b: sys::jint,
    ) -> sys::jint {
        crate::rust_add(a, b)
    }

    /// JNI entrypoint for ClinVar analysis
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn Java_expo_modules_biovault_ExpoBiovaultModule_analyzeClinVar<
        'local,
    >(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        user_db_path: jni::objects::JString<'local>,
        clinvar_db_path: jni::objects::JString<'local>,
    ) -> jni::objects::JString<'local> {
        let user_db_str: String = env.get_string(&user_db_path).unwrap().into();
        let clinvar_db_str: String = env.get_string(&clinvar_db_path).unwrap().into();

        match analyze_clinvar_matches(&user_db_str, &clinvar_db_str) {
            Ok(result) => {
                match serde_json::to_string(&result) {
                    Ok(json) => env.new_string(json).unwrap(),
                    Err(_) => env.new_string("ERROR_SERIALIZATION").unwrap(),
                }
            }
            Err(_) => env.new_string("ERROR_ANALYSIS").unwrap(),
        }
    }
}
/// Analyze user genome against ClinVar database
#[unsafe(no_mangle)]
pub unsafe extern "C" fn analyze_clinvar(
    user_db_path: *const c_char,
    clinvar_db_path: *const c_char,
) -> *mut c_char {
    let user_db_path = unsafe {
        match CStr::from_ptr(user_db_path).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let clinvar_db_path = unsafe {
        match CStr::from_ptr(clinvar_db_path).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    match analyze_clinvar_matches(user_db_path, clinvar_db_path) {
        Ok(result) => {
            match serde_json::to_string(&result) {
                Ok(json) => match CString::new(json) {
                    Ok(c_string) => c_string.into_raw(),
                    Err(e) => {
                        eprintln!("Failed to create CString: {}", e);
                        std::ptr::null_mut()
                    }
                },
                Err(e) => {
                    eprintln!("Failed to serialize result: {}", e);
                    std::ptr::null_mut()
                }
            }
        }
        Err(e) => {
            eprintln!("Rust analysis failed: {}", e);
            std::ptr::null_mut()
        }
    }
}

/// Public, safe Rust API to process a 23andMe file and create an SQLite DB.
/// Returns the full path to the created database file.
pub fn process_23andme(
    input_path: &str,
    custom_name: &str,
    output_dir: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    process_file_internal(input_path, custom_name, output_dir)
}

/// Public, safe Rust API for ClinVar analysis
pub fn analyze_clinvar_safe(
    user_db_path: &str,
    clinvar_db_path: &str,
) -> Result<analysis::AnalysisResult, Box<dyn std::error::Error>> {
    analyze_clinvar_matches(user_db_path, clinvar_db_path)
}
