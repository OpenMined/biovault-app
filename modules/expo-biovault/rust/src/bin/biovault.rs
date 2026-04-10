use std::env;
use std::fs;
use std::path::Path;

fn print_usage_and_exit() -> ! {
    eprintln!(
        "Usage:\n  biovault parse --file <input> --output <dir> [--name <name>] [--json]\n\n  Legacy (still supported):\n  biovault <input> <custom_name> <output_dir>\n\nNotes:\n  - <input> is a 23andMe .txt or .zip file\n  - <dir> is the output directory for generated files (created if missing)"
    );
    std::process::exit(2);
}

fn cmd_parse(mut args: impl Iterator<Item = String>) -> i32 {
    let mut file: Option<String> = None;
    let mut output: Option<String> = None;
    let mut name: Option<String> = None;
    let mut json = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--file" => {
                file = args.next();
            }
            "--output" => {
                output = args.next();
            }
            "--name" => {
                name = args.next();
            }
            "--json" => {
                json = true;
            }
            _ => {
                eprintln!("Unknown argument: {}", arg);
                return 2;
            }
        }
    }

    let input_path = match file {
        Some(p) => p,
        None => {
            eprintln!("Missing required --file <path>");
            return 2;
        }
    };
    let output_dir = match output {
        Some(p) => p,
        None => {
            eprintln!("Missing required --output <dir>");
            return 2;
        }
    };

    let input = Path::new(&input_path);
    if !input.exists() {
        eprintln!("Input file not found: {}", input.display());
        return 1;
    }

    let out = Path::new(&output_dir);
    if !out.exists()
        && let Err(e) = fs::create_dir_all(out)
    {
        eprintln!("Failed to create output directory {}: {}", out.display(), e);
        return 1;
    }
    if !out.is_dir() {
        eprintln!("Output path is not a directory: {}", out.display());
        return 1;
    }

    let derived_name = name.unwrap_or_else(|| {
        input
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("genome")
            .to_string()
    });

    // Process the file with universal parser
    match expo_biovault_ffi::process_genome(&input_path, &derived_name, &output_dir) {
        Ok(db_path) => {
            if json {
                println!("{{\"success\":true,\"database_path\":\"{}\"}}", db_path);
            } else {
                println!("Success! Database created at: {}", db_path);
            }
            0
        }
        Err(e) => {
            if json {
                println!("{{\"success\":false,\"error\":\"{}\"}}", e);
            } else {
                eprintln!("Error: {}", e);
            }
            1
        }
    }
}

fn main() {
    let mut args = env::args().skip(1);
    match args.next() {
        Some(cmd) if cmd == "parse" => {
            let code = cmd_parse(args);
            std::process::exit(code);
        }
        Some(first) => {
            // Legacy positional invocation: <input> <custom_name> <output_dir>
            let input_path = first;
            let custom_name = args.next().unwrap_or_else(|| {
                eprintln!("Missing <custom_name> argument");
                print_usage_and_exit();
            });
            let output_dir = args.next().unwrap_or_else(|| {
                eprintln!("Missing <output_dir> argument");
                print_usage_and_exit();
            });

            let input = Path::new(&input_path);
            if !input.exists() {
                eprintln!("Input file not found: {}", input.display());
                std::process::exit(1);
            }
            let out = Path::new(&output_dir);
            if !out.exists()
                && let Err(e) = fs::create_dir_all(out)
            {
                eprintln!("Failed to create output directory {}: {}", out.display(), e);
                std::process::exit(1);
            }
            if !out.is_dir() {
                eprintln!("Output path is not a directory: {}", out.display());
                std::process::exit(1);
            }

            // Process with universal parser
            match expo_biovault_ffi::process_genome(&input_path, &custom_name, &output_dir) {
                Ok(db_path) => {
                    println!("Success! Database created at: {}", db_path);
                    std::process::exit(0);
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        None => print_usage_and_exit(),
    }
}
