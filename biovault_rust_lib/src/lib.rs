mod parsers;
mod database;

use parsers::twenty_three_and_me;
use database::create_genome_database;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;

/// Process a 23andMe file and create SQLite database
/// Returns the database name on success
#[unsafe(no_mangle)]
pub extern "C" fn process_23andme_file(
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
        Ok(db_name) => {
            match CString::new(db_name) {
                Ok(c_string) => c_string.into_raw(),
                Err(e) => {
                    eprintln!("Failed to create CString: {}", e);
                    std::ptr::null_mut()
                }
            }
        }
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
    // Parse the 23andMe file
    let parse_result = twenty_three_and_me::parse_23andme_file(Path::new(input_path))?;
    
    // Create output SQLite file path
    let timestamp = chrono::Utc::now().timestamp();
    let db_filename = format!("{}_{}.sqlite", custom_name.replace(' ', "_"), timestamp);
    let output_path = Path::new(output_dir).join(&db_filename);
    
    // Create SQLite database
    let db_name = create_genome_database(parse_result, &output_path, custom_name)?;
    
    // Return the full path to the created database
    Ok(output_path.to_string_lossy().to_string())
}

/// Free memory allocated by process_23andme_file
#[unsafe(no_mangle)]
pub extern "C" fn free_string(ptr: *mut c_char) {
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
    use crate::rust_add;
    use jni::JNIEnv;
    use jni::objects::JClass;
    use jni::sys::jint;

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn Java_expo_modules_biovault_ExpoBiovaultModule_processGenomeFile(
        mut env: JNIEnv,
        _class: JClass,
        input_path: jni::objects::JString,
        custom_name: jni::objects::JString,
        output_dir: jni::objects::JString,
    ) -> jni::objects::JString {
        let input_path_str: String = env.get_string(&input_path).unwrap().into();
        let custom_name_str: String = env.get_string(&custom_name).unwrap().into();
        let output_dir_str: String = env.get_string(&output_dir).unwrap().into();
        
        match process_file_internal(&input_path_str, &custom_name_str, &output_dir_str) {
            Ok(result) => env.new_string(result).unwrap(),
            Err(_) => env.new_string("ERROR").unwrap(),
        }
    }
}